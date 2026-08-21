import { chromium } from 'playwright';
import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';

const base = (process.env.BASE_URL || 'https://slugly.io').replace(/\/$/, '');
const expectedCommit = process.env.EXPECTED_COMMIT;
const email = process.env.E2E_EMAIL;
const stamp = Date.now();
const projectName = `410 Regression ${stamp}`;
const shortCode = `e2e-gone-${stamp}`;

const assert = (value, message) => {
  if (!value) throw new Error(message);
};

let browser;
let context;
let page;
let apiClient;
let projectId = 0;
let linkId = 0;

try {
  const healthResponse = await fetch(`${base}/healthz?soft_delete_410=${stamp}`, {
    headers: { 'cache-control': 'no-cache' },
  });
  assert(healthResponse.ok, `healthz HTTP ${healthResponse.status}`);
  const health = await healthResponse.json();
  assert(health.status === 'ok', `health status=${health.status}`);
  assert(health.commit === expectedCommit, `health commit ${health.commit} != ${expectedCommit}`);
  assert(String(health.runtime || '').startsWith('v24.'), `runtime ${health.runtime} is not Node 24`);
  console.log(`PASS healthz commit=${health.commit} runtime=${health.runtime}`);

  await clerkSetup();
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await context.newPage();

  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await clerk.loaded({ page });
  await clerk.signIn({ page, emailAddress: email });
  await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1200);
  assert(!page.url().includes('/auth'), `authenticated user was redirected to ${page.url()}`);
  console.log('PASS Clerk authenticated production sign-in');

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
  console.log(`PASS workspace.current id=${workspaceState.workspace.id}`);

  const project = await apiClient.project.create.mutate({
    name: projectName,
    description: 'Temporary production soft-delete 410 regression',
  });
  projectId = Number(project.id || 0);
  assert(projectId > 0, 'project.create returned no id');
  console.log(`PASS project.create id=${projectId}`);

  const link = await apiClient.link.create.mutate({
    destinationUrl: `https://example.com/?slugly_410=${stamp}`,
    title: `410 Regression Link ${stamp}`,
    projectId,
    customCode: shortCode,
  });
  linkId = Number(link.id || 0);
  assert(linkId > 0, 'link.create returned no id');
  console.log(`PASS link.create id=${linkId} shortCode=${shortCode}`);

  const beforeDelete = await fetch(`${base}/r/${shortCode}?before=${stamp}`, {
    redirect: 'manual',
    headers: { 'user-agent': 'Mozilla/5.0 Slugly-E2E' },
  });
  assert(beforeDelete.status === 302, `active redirect expected 302, got ${beforeDelete.status}`);
  const location = beforeDelete.headers.get('location') || '';
  assert(location.includes('example.com'), `active redirect location unexpected: ${location}`);
  console.log(`PASS active redirect HTTP 302 location=${location}`);

  await apiClient.link.delete.mutate({ id: linkId });
  console.log('PASS user link.delete mutation');

  const visibleAfterDelete = await apiClient.link.list.query({ projectId });
  assert(!visibleAfterDelete.some(item => item.id === linkId), 'soft-deleted link is still visible in link.list');
  console.log('PASS soft-deleted link hidden from user list');

  const gone = await fetch(`${base}/r/${shortCode}?after=${stamp}`, {
    redirect: 'manual',
    headers: {
      'cache-control': 'no-cache',
      'user-agent': 'Mozilla/5.0 Slugly-E2E',
    },
  });
  assert(gone.status === 410, `soft-deleted redirect expected 410, got ${gone.status}`);
  const goneBody = await gone.text();
  assert(/removed|unavailable|no longer available/i.test(goneBody), '410 response did not render removed-link message');
  console.log('PASS soft-deleted redirect HTTP 410 Gone');

  console.log('SOFT_DELETE_410_PRODUCTION_REGRESSION=PASS');
} finally {
  if (apiClient && projectId > 0) {
    try {
      await apiClient.project.delete.mutate({ id: projectId, mode: 'cascade' });
      console.log(`CLEANUP project.delete id=${projectId} success`);
    } catch (error) {
      console.error(`CLEANUP project.delete id=${projectId} failed: ${error?.message || error}`);
    }
  }
  if (browser) await browser.close().catch(() => undefined);
}
