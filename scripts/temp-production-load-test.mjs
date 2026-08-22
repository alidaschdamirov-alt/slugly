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
const projectName = `Capacity Probe ${stamp}`;
const shortCode = `e2e-load-${stamp}`;

const stages = [
  { rps: 10, duration: 15, connections: 10 },
  { rps: 25, duration: 15, connections: 15 },
  { rps: 50, duration: 15, connections: 25 },
  { rps: 100, duration: 15, connections: 50 },
  { rps: 200, duration: 10, connections: 80 },
];

const assert = (value, message) => {
  if (!value) throw new Error(message);
};

async function checkHealth(label) {
  const response = await fetch(`${base}/healthz?load_probe=${stamp}-${label}`, {
    headers: { 'cache-control': 'no-cache' },
  });
  assert(response.ok, `${label} healthz HTTP ${response.status}`);
  const health = await response.json();
  assert(health.status === 'ok', `${label} health status=${health.status}`);
  assert(health.commit === expectedCommit, `${label} commit ${health.commit} != ${expectedCommit}`);
  assert(String(health.runtime || '').startsWith('v24.'), `${label} runtime ${health.runtime} is not Node 24`);
  console.log(`HEALTH ${label}=PASS commit=${health.commit} runtime=${health.runtime}`);
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
    targetRps: stage.rps,
    durationSec: stage.duration,
    connections: stage.connections,
    total,
    status302,
    non302,
    successPct: Number(successPct.toFixed(3)),
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
let projectId = 0;
let linkId = 0;
const summaries = [];

try {
  await checkHealth('before');

  await clerkSetup();
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await context.newPage();

  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await clerk.loaded({ page });
  await clerk.signIn({ page, emailAddress: email });
  await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1000);
  assert(!page.url().includes('/auth'), `authenticated user was redirected to ${page.url()}`);
  console.log('AUTH=PASS');

  const cookies = await context.cookies(base);
  const cookieHeader = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
  assert(cookieHeader.length > 0, 'no authenticated Clerk cookies found');

  let workspaceId = await page.evaluate(() => localStorage.getItem('slugly_workspace_id') || '').catch(() => '');
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
  const workspaceState = await apiClient.workspace.current.query();
  assert(workspaceState?.workspace?.id, 'workspace.current returned no workspace');
  if (!workspaceId) {
    workspaceId = String(workspaceState.workspace.id);
    apiClient = makeClient();
  }

  const project = await apiClient.project.create.mutate({
    name: projectName,
    description: 'Temporary production redirect capacity probe',
  });
  projectId = Number(project.id || 0);
  assert(projectId > 0, 'project.create returned no id');

  const link = await apiClient.link.create.mutate({
    destinationUrl: `https://example.com/?slugly_load=${stamp}`,
    title: `Capacity Probe ${stamp}`,
    projectId,
    customCode: shortCode,
  });
  linkId = Number(link.id || 0);
  assert(linkId > 0, 'link.create returned no id');
  console.log(`FIXTURE projectId=${projectId} linkId=${linkId} shortCode=${shortCode}`);

  const warmup = await fetch(`${base}/r/${shortCode}?warmup=${stamp}`, {
    redirect: 'manual',
    headers: { 'user-agent': 'Mozilla/5.0 Slugly-Capacity-Probe' },
  });
  assert(warmup.status === 302, `warmup expected 302, got ${warmup.status}`);
  console.log('WARMUP=PASS');

  for (const stage of stages) {
    console.log(`STAGE_START targetRps=${stage.rps} duration=${stage.duration}s connections=${stage.connections}`);
    const result = await autocannon({
      url: `${base}/r/${shortCode}?capacity=${stamp}`,
      method: 'GET',
      duration: stage.duration,
      connections: stage.connections,
      overallRate: stage.rps,
      headers: {
        'user-agent': 'Mozilla/5.0 Slugly-Capacity-Probe',
        'cache-control': 'no-cache',
      },
      timeout: 10,
    });
    const summary = summarize(result, stage);
    summaries.push(summary);

    const badResponses = summary.non302 + summary.errors + summary.timeouts;
    const failureRate = summary.total > 0 ? badResponses / summary.total : 1;
    const p99 = Number(summary.latencyMs.p99 || 0);
    if (failureRate > 0.01 || p99 > 2500) {
      console.log(`STOP_EARLY failureRate=${failureRate.toFixed(4)} p99=${p99}`);
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  await new Promise(resolve => setTimeout(resolve, 10000));
  await checkHealth('after');

  const overall = {
    expectedCommit,
    stages: summaries,
    passedStages: summaries.filter(s => s.successPct >= 99 && s.errors === 0 && s.timeouts === 0).length,
    totalStagesRun: summaries.length,
  };
  fs.writeFileSync('/tmp/slugly-load-result.json', JSON.stringify(overall, null, 2));
  console.log(`LOAD_TEST_RESULT ${JSON.stringify(overall)}`);
} finally {
  if (apiClient && projectId > 0) {
    try {
      await new Promise(resolve => setTimeout(resolve, 5000));
      await apiClient.project.delete.mutate({ id: projectId, mode: 'cascade' });
      console.log(`CLEANUP project.delete id=${projectId} success`);
    } catch (error) {
      console.error(`CLEANUP project.delete id=${projectId} failed: ${error?.message || error}`);
    }
  }
  if (browser) await browser.close().catch(() => undefined);
}
