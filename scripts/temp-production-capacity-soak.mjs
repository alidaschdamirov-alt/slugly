import fs from 'node:fs';
import { chromium } from 'playwright';
import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import autocannon from 'autocannon';

const base = (process.env.BASE_URL || 'https://slugly.io').replace(/\/$/, '');
const expectedCommit = process.env.EXPECTED_COMMIT;
const email = process.env.E2E_EMAIL;
const stamp = Date.now();
const projectName = `Capacity Soak ${stamp}`;
const shortCode = `e2e-soak-${stamp}`;

const stages = [
  { name: 'soak-50', rps: 50, duration: 1800, connections: 40 },
  { name: 'soak-100', rps: 100, duration: 600, connections: 70 },
  { name: 'burst-150', rps: 150, duration: 120, connections: 100 },
  { name: 'burst-200', rps: 200, duration: 60, connections: 120 },
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (value, message) => {
  if (!value) throw new Error(message);
};

async function checkHealth(label) {
  const response = await fetch(`${base}/healthz?capacity_soak=${stamp}-${label}`, {
    headers: { 'cache-control': 'no-cache' },
  });
  assert(response.ok, `${label} healthz HTTP ${response.status}`);
  const health = await response.json();
  assert(health.status === 'ok', `${label} health status=${health.status}`);
  assert(health.commit === expectedCommit, `${label} commit ${health.commit} != ${expectedCommit}`);
  assert(String(health.runtime || '').startsWith('v24.'), `${label} runtime ${health.runtime} is not Node 24`);
  console.log(`HEALTH ${label}=PASS commit=${health.commit} runtime=${health.runtime}`);
  return health;
}

function summarize(result, stage) {
  const statusStats = result.statusCodeStats || {};
  const status302 = Number(statusStats['302']?.count || statusStats[302]?.count || 0);
  const total = Number(result.requests?.total || 0);
  const errors = Number(result.errors || 0);
  const timeouts = Number(result.timeouts || 0);
  const non302 = Math.max(0, total - status302);
  const successPct = total > 0 ? (status302 / total) * 100 : 0;
  const summary = {
    name: stage.name,
    targetRps: stage.rps,
    durationSec: stage.duration,
    connections: stage.connections,
    total,
    status302,
    non302,
    successPct: Number(successPct.toFixed(4)),
    errors,
    timeouts,
    achievedRps: Number((result.requests?.average || 0).toFixed(2)),
    throughputBytesSec: Number((result.throughput?.average || 0).toFixed(2)),
    latencyMs: {
      p50: result.latency?.p50 ?? null,
      p90: result.latency?.p90 ?? null,
      p97_5: result.latency?.p97_5 ?? null,
      p99: result.latency?.p99 ?? null,
      average: result.latency?.average ?? null,
      max: result.latency?.max ?? null,
    },
    statusCodeStats: statusStats,
  };
  console.log(`STAGE_RESULT ${JSON.stringify(summary)}`);
  return summary;
}

let browser;
let context;
let page;
let apiClient;
let workspaceId = '';
let projectId = 0;
let linkId = 0;
let baselineClickCount = 0;
const summaries = [];

async function establishAuthenticatedClient({ freshContext = false } = {}) {
  if (freshContext) {
    if (context) await context.close().catch(() => undefined);
    context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    page = await context.newPage();
  }

  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await clerk.loaded({ page });
  await clerk.signIn({ page, emailAddress: email });
  await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1200);
  assert(!page.url().includes('/auth'), `authenticated user was redirected to ${page.url()}`);

  const cookies = await context.cookies(base);
  const cookieHeader = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
  assert(cookieHeader.length > 0, 'no authenticated Clerk cookies found');

  const makeClient = () => createTRPCClient({
    links: [httpBatchLink({
      url: `${base}/api/trpc`,
      transformer: superjson,
      headers() {
        return {
          cookie: cookieHeader,
          ...(workspaceId ? { 'x-workspace-id': workspaceId } : {}),
        };
      },
    })],
  });

  apiClient = makeClient();
  const state = await apiClient.workspace.current.query();
  assert(state?.workspace?.id, 'workspace.current returned no workspace');
  if (!workspaceId) {
    workspaceId = String(state.workspace.id);
    apiClient = makeClient();
  }
  console.log(`AUTH=PASS workspaceId=${workspaceId}`);
}

async function getCurrentClickCount() {
  const link = await apiClient.link.get.query({ id: linkId });
  assert(link?.id === linkId, 'link.get failed for capacity fixture');
  return Number(link.clickCount || 0);
}

try {
  await checkHealth('before');
  await clerkSetup();
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await context.newPage();
  await establishAuthenticatedClient();

  const project = await apiClient.project.create.mutate({
    name: projectName,
    description: 'Temporary 43-minute production capacity soak test',
  });
  projectId = Number(project.id || 0);
  assert(projectId > 0, 'project.create returned no id');

  const link = await apiClient.link.create.mutate({
    destinationUrl: `https://example.com/?slugly_soak=${stamp}`,
    title: `Capacity Soak ${stamp}`,
    projectId,
    customCode: shortCode,
  });
  linkId = Number(link.id || 0);
  assert(linkId > 0, 'link.create returned no id');
  console.log(`FIXTURE projectId=${projectId} linkId=${linkId} shortCode=${shortCode}`);

  const warmup = await fetch(`${base}/r/${shortCode}?warmup=${stamp}`, {
    redirect: 'manual',
    headers: { 'user-agent': 'Mozilla/5.0 Slugly-Capacity-Soak' },
  });
  assert(warmup.status === 302, `warmup expected 302, got ${warmup.status}`);
  await sleep(2000);
  baselineClickCount = await getCurrentClickCount();
  console.log(`WARMUP=PASS baselineClickCount=${baselineClickCount}`);

  for (const stage of stages) {
    console.log(`STAGE_START name=${stage.name} targetRps=${stage.rps} duration=${stage.duration}s connections=${stage.connections}`);
    const startedAt = Date.now();
    const heartbeat = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      console.log(`STAGE_HEARTBEAT name=${stage.name} elapsedSec=${elapsed}/${stage.duration}`);
    }, 300000);

    let result;
    try {
      result = await autocannon({
        url: `${base}/r/${shortCode}?capacity_soak=${stamp}`,
        method: 'GET',
        duration: stage.duration,
        connections: stage.connections,
        overallRate: stage.rps,
        headers: {
          'user-agent': 'Mozilla/5.0 Slugly-Capacity-Soak',
          'cache-control': 'no-cache',
        },
        timeout: 10,
      });
    } finally {
      clearInterval(heartbeat);
    }

    const summary = summarize(result, stage);
    summaries.push(summary);
    await checkHealth(`after-${stage.name}`);

    const badResponses = summary.non302 + summary.errors + summary.timeouts;
    const failureRate = summary.total > 0 ? badResponses / summary.total : 1;
    const p99 = Number(summary.latencyMs.p99 || 0);
    if (failureRate > 0.005 || p99 > 3000) {
      console.log(`STOP_EARLY stage=${stage.name} failureRate=${failureRate.toFixed(5)} p99=${p99}`);
      break;
    }
    await sleep(10000);
  }

  await checkHealth('after-load');
  console.log('CLICK_DRAIN_WAIT seconds=60');
  await sleep(60000);

  // The Clerk session can expire during a 40+ minute soak. Establish a fresh session
  // before measuring click persistence and deleting the disposable fixture.
  await establishAuthenticatedClient({ freshContext: true });

  const expectedLoadClicks = summaries.reduce((sum, s) => sum + s.status302, 0);
  let finalClickCount = await getCurrentClickCount();
  let recordedDelta = Math.max(0, finalClickCount - baselineClickCount);
  let recordedPct = expectedLoadClicks > 0 ? (recordedDelta / expectedLoadClicks) * 100 : 0;
  console.log(`CLICK_PERSISTENCE attempt=1 expected=${expectedLoadClicks} baseline=${baselineClickCount} final=${finalClickCount} delta=${recordedDelta} pct=${recordedPct.toFixed(4)}`);

  for (let attempt = 2; attempt <= 5 && recordedDelta < expectedLoadClicks; attempt++) {
    await sleep(15000);
    finalClickCount = await getCurrentClickCount();
    recordedDelta = Math.max(0, finalClickCount - baselineClickCount);
    recordedPct = expectedLoadClicks > 0 ? (recordedDelta / expectedLoadClicks) * 100 : 0;
    console.log(`CLICK_PERSISTENCE attempt=${attempt} expected=${expectedLoadClicks} baseline=${baselineClickCount} final=${finalClickCount} delta=${recordedDelta} pct=${recordedPct.toFixed(4)}`);
  }

  const overall = {
    expectedCommit,
    fixture: { projectId, linkId, shortCode },
    baselineClickCount,
    expectedLoadClicks,
    finalClickCount,
    recordedDelta,
    recordedPct: Number(recordedPct.toFixed(4)),
    stages: summaries,
    passedStages: summaries.filter(s => s.successPct >= 99.5 && s.errors === 0 && s.timeouts === 0).length,
    totalStagesRun: summaries.length,
  };
  fs.writeFileSync('/tmp/slugly-soak-result.json', JSON.stringify(overall, null, 2));
  console.log(`CAPACITY_SOAK_RESULT ${JSON.stringify(overall)}`);

  assert(recordedPct >= 99.9, `click persistence below 99.9%: ${recordedPct.toFixed(4)}%`);
} finally {
  if (browser && projectId > 0) {
    try {
      if (!apiClient) await establishAuthenticatedClient({ freshContext: true });
      await apiClient.project.delete.mutate({ id: projectId, mode: 'cascade' });
      console.log(`CLEANUP project.delete id=${projectId} success`);
    } catch (error) {
      console.error(`CLEANUP project.delete id=${projectId} failed: ${error?.message || error}`);
    }
  }
  if (browser) await browser.close().catch(() => undefined);
}
