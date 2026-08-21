import { chromium } from 'playwright';
import { clerk, clerkSetup } from '@clerk/testing/playwright';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import fs from 'node:fs/promises';

const base = (process.env.BASE_URL || 'https://slugly.io').replace(/\/$/, '');
const expectedCommit = process.env.EXPECTED_COMMIT;
const email = process.env.E2E_EMAIL;
const stamp = Date.now();
const projectName = `E2E Project ${stamp}`;
const projectNameEdited = `E2E Project Edited ${stamp}`;
const firstTitle = `E2E Active ${stamp}`;
const editedTitle = `E2E Edited ${stamp}`;
const firstCode = `e2e-live-${stamp}`;
const tag = `e2e-${String(stamp).slice(-6)}`;
const out = '/tmp/slugly-clerk-e2e/screens';
await fs.mkdir(out, { recursive: true });

const results = [];
const diagnostics = [];
const pass = (check, detail = {}) => results.push({ check, status: 'PASS', ...detail });
const assert = (value, message) => { if (!value) throw new Error(message); };
const shot = async (page, name) => { try { await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); } catch {} };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function dismissCookie(page) {
  const essential = page.getByRole('button', { name: /Essential Only/i });
  if (await essential.isVisible().catch(() => false)) await essential.click();
}

async function chooseCombo(page, index, label) {
  const combo = page.locator('button[role="combobox"]').nth(index);
  await combo.click();
  await page.getByRole('option', { name: label, exact: true }).click();
  await page.waitForTimeout(650);
}

let browser;
let context;
let page;
let apiClient;
let projectId = 0;
let firstLinkId = 0;
const createdLinkIds = [];
let primaryError = null;
const sameOrigin5xx = [];
const pageErrors = [];
const linkCreateResponses = [];

try {
  const healthResponse = await fetch(`${base}/healthz?auth_e2e=${stamp}`, { headers: { 'cache-control': 'no-cache' } });
  assert(healthResponse.ok, `healthz HTTP ${healthResponse.status}`);
  const health = await healthResponse.json();
  assert(health.status === 'ok', `health status=${health.status}`);
  assert(health.commit === expectedCommit, `health commit ${health.commit} != ${expectedCommit}`);
  assert(String(health.runtime || '').startsWith('v24.'), `runtime ${health.runtime} is not Node 24`);
  pass('healthz', { commit: health.commit, runtime: health.runtime });

  await clerkSetup();
  pass('clerk-testing-token-setup');

  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('response', response => {
    try {
      const u = new URL(response.url());
      if (u.origin === new URL(base).origin && response.status() >= 500) sameOrigin5xx.push(`${response.status()} ${u.pathname}`);
      if (u.origin === new URL(base).origin && u.pathname.includes('/api/trpc') && u.pathname.includes('link.create')) {
        linkCreateResponses.push({ status: response.status(), url: u.pathname + u.search });
      }
    } catch {}
  });

  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await dismissCookie(page);
  await clerk.loaded({ page });
  await clerk.signIn({ page, emailAddress: email });
  await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await dismissCookie(page);
  await page.getByText(/Welcome back/i).waitFor({ state: 'visible', timeout: 25000 });
  pass('clerk-authenticated-signin');
  await shot(page, '01-dashboard-authenticated');

  const createProjectButton = page.getByRole('button', { name: /New Project|Create Your First Project/i }).first();
  await createProjectButton.click();
  await page.locator('input[placeholder="Q4 Campaign"]').fill(projectName);
  const desc = page.locator('textarea[placeholder="Links for the Q4 marketing push"]');
  if (await desc.isVisible().catch(() => false)) await desc.fill('Temporary production E2E project');
  await page.getByRole('button', { name: 'Create Project', exact: true }).click();
  await page.getByText(projectName, { exact: true }).waitFor({ state: 'visible', timeout: 20000 });
  pass('dashboard-create-project');

  await page.getByText(projectName, { exact: true }).click();
  await page.waitForURL(/\/project\/\d+$/, { timeout: 20000 });
  projectId = Number(page.url().match(/\/project\/(\d+)$/)?.[1] || 0);
  assert(projectId > 0, `could not derive project id from ${page.url()}`);
  await page.getByText(/50 per page/i).waitFor({ state: 'visible', timeout: 20000 });
  pass('project-view', { projectId });

  await page.getByRole('button', { name: /Add Link/i }).click();
  await page.waitForURL(/\/create\?project=/, { timeout: 20000 });
  await dismissCookie(page);
  await page.locator('input[placeholder="https://example.com/landing-page"]').fill(`https://example.com/?slugly_e2e=${stamp}`);
  await page.locator('input[placeholder="Black Friday Landing"]').fill(firstTitle);
  const tagInput = page.locator('input[placeholder="Add tags (press Enter)"]');
  await tagInput.fill(tag);
  await tagInput.press('Enter');
  await page.locator('input[placeholder="my-link"]').fill(firstCode);
  const submit = page.locator('form button[type="submit"]').filter({ hasText: /Create Short Link|Create Link/i }).first();
  await submit.waitFor({ state: 'visible', timeout: 10000 });
  assert(!(await submit.isDisabled()), 'Create Short Link button is disabled before submit');
  await submit.click();
  try {
    await page.getByText('Link Created!', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  } catch (error) {
    diagnostics.push({ linkCreateResponses, createPageBody: (await page.locator('body').innerText()).slice(-1800) });
    throw error;
  }
  pass('create-link-ui', { shortCode: firstCode, network: linkCreateResponses });
  await shot(page, '02-link-created');

  await page.getByRole('button', { name: /View Analytics/i }).click();
  await page.waitForURL(/\/link\/\d+\/analytics$/, { timeout: 20000 });
  firstLinkId = Number(page.url().match(/\/link\/(\d+)\/analytics$/)?.[1] || 0);
  assert(firstLinkId > 0, `could not derive link id from ${page.url()}`);
  createdLinkIds.push(firstLinkId);
  await page.waitForTimeout(1200);
  assert(/Analytics|Clicks|Overview/i.test(await page.locator('body').innerText()), 'link analytics page did not render analytics content');
  pass('link-analytics', { linkId: firstLinkId });

  const redirectPage = await context.newPage();
  const redirectResponse = await redirectPage.goto(`${base}/r/${firstCode}?e2e=${stamp}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const finalUrl = redirectPage.url();
  assert(new URL(finalUrl).hostname === 'example.com', `redirect ended at ${finalUrl}`);
  assert(!redirectResponse || redirectResponse.status() < 500, `redirect final HTTP ${redirectResponse?.status()}`);
  pass('redirect-live', { finalHost: 'example.com' });
  await redirectPage.close();
  await sleep(1500);

  await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByText(projectName, { exact: true }).waitFor({ state: 'visible', timeout: 20000 });
  const cookies = await context.cookies(base);
  const cookieHeader = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
  let workspaceId = await page.evaluate(() => localStorage.getItem('slugly_workspace_id') || '').catch(() => '');
  const makeApiClient = () => createTRPCClient({
    links: [httpBatchLink({
      url: `${base}/api/trpc`,
      transformer: superjson,
      headers() { return { cookie: cookieHeader, ...(workspaceId ? { 'x-workspace-id': workspaceId } : {}) }; },
    })],
  });
  apiClient = makeApiClient();
  const workspaceState = await apiClient.workspace.current.query();
  assert(workspaceState?.workspace, 'workspace.current returned no workspace');
  if (!workspaceId) {
    workspaceId = String(workspaceState.workspace.id);
    apiClient = makeApiClient();
  }
  pass('workspace-current', { plan: workspaceState.workspace.plan || 'free', linkLimit: workspaceState.planConfig?.limits?.links });
  assert(workspaceState.planConfig?.limits?.links === 5, `expected free test workspace limit 5, got ${workspaceState.planConfig?.limits?.links}`);

  const projectList = await apiClient.project.list.query();
  assert(projectList.some(item => item.id === projectId), 'created project missing from authenticated API');
  pass('authenticated-trpc');

  // Free production workspaces allow five links. Seed four more, then validate both
  // the server paginator at limit=1 and the real plan-limit gate without touching Stripe.
  for (let i = 2; i <= 5; i += 1) {
    const created = await apiClient.link.create.mutate({
      destinationUrl: `https://example.com/?slugly_seed=${stamp}-${i}`,
      title: `E2E Seed ${stamp} ${i}`,
      projectId,
      customCode: `e2e-seed-${stamp}-${i}`,
    });
    createdLinkIds.push(created.id);
  }
  assert(createdLinkIds.length === 5, `expected 5 created links, got ${createdLinkIds.length}`);
  pass('seed-free-plan-links', { links: 5 });

  const pagination = await page.evaluate(async ({ projectId }) => {
    const first = await fetch(`/api/project-links/${projectId}?page=1&limit=1&sortField=createdAt&sortDir=desc`, { credentials: 'include' });
    const second = await fetch(`/api/project-links/${projectId}?page=2&limit=1&sortField=createdAt&sortDir=desc`, { credentials: 'include' });
    return { firstStatus: first.status, secondStatus: second.status, first: await first.json(), second: await second.json() };
  }, { projectId });
  assert(pagination.firstStatus === 200 && pagination.secondStatus === 200, `pagination HTTP ${pagination.firstStatus}/${pagination.secondStatus}`);
  assert(pagination.first.pagination?.total === 5, `pagination total ${pagination.first.pagination?.total} != 5`);
  assert(pagination.first.pagination?.pageCount === 5, `limit=1 pageCount ${pagination.first.pagination?.pageCount} != 5`);
  assert(pagination.first.items?.[0]?.id !== pagination.second.items?.[0]?.id, 'page 1 and page 2 returned same link');
  pass('server-pagination', { total: 5, limit: 1, pageCount: 5 });

  let limitRejected = false;
  try {
    await apiClient.link.create.mutate({
      destinationUrl: `https://example.com/?slugly_over_limit=${stamp}`,
      title: `E2E Over Limit ${stamp}`,
      projectId,
      customCode: `e2e-over-${stamp}`,
    });
  } catch (error) {
    const message = String(error?.message || error);
    limitRejected = message.includes('LIMIT_REACHED') || message.includes('limit');
  }
  assert(limitRejected, 'sixth link was not rejected by free-plan limit');
  pass('free-plan-server-limit');

  await page.goto(`${base}/create?project=${projectId}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByText(/Link limit reached/i).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: /Upgrade to Create More Links/i }).waitFor({ state: 'visible', timeout: 15000 });
  pass('free-plan-ui-limit-gate');

  await page.goto(`${base}/project/${projectId}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByText('5 matching links · 50 per page', { exact: false }).waitFor({ state: 'visible', timeout: 20000 });
  const search = page.locator('input[placeholder="Search links..."]');
  await search.fill(firstTitle);
  await page.waitForTimeout(900);
  await page.getByText(firstCode, { exact: false }).waitFor({ state: 'visible', timeout: 15000 });
  pass('project-search');
  await search.fill('');
  await page.waitForTimeout(750);

  await chooseCombo(page, 0, 'Active');
  await page.getByText(firstCode, { exact: false }).waitFor({ state: 'visible', timeout: 15000 });
  pass('status-filter-active');
  for (const label of ['Broken', 'Quarantine', 'Expired']) {
    await chooseCombo(page, 0, label);
    await page.waitForTimeout(500);
    const pageError = await page.getByText(/Couldn’t load project links|Failed to load project links/i).isVisible().catch(() => false);
    assert(!pageError, `${label} filter returned page error`);
    pass(`status-filter-${label.toLowerCase()}`);
  }
  await chooseCombo(page, 0, 'All Status');

  const combos = page.locator('button[role="combobox"]');
  assert((await combos.count()) >= 3, `expected status/tag/sort controls, got ${await combos.count()}`);
  await chooseCombo(page, 1, tag);
  await page.getByText(firstCode, { exact: false }).waitFor({ state: 'visible', timeout: 15000 });
  pass('tag-filter');
  await chooseCombo(page, 1, 'All Tags');
  await chooseCombo(page, 2, 'Most Clicks');
  await page.waitForTimeout(1000);
  const topCard = page.locator('div.group.cursor-pointer').first();
  await topCard.waitFor({ state: 'visible', timeout: 15000 });
  assert((await topCard.innerText()).includes(firstCode), `clicked link not first under Most Clicks: ${(await topCard.innerText()).slice(0, 160)}`);
  pass('clicks-sorting-most-clicks');

  const card = page.locator('div.group.cursor-pointer').filter({ hasText: firstCode }).first();
  await card.hover();
  const cardButtons = card.locator('button');
  assert((await cardButtons.count()) >= 4, `expected QR/edit/delete/copy actions, got ${await cardButtons.count()}`);
  await cardButtons.nth(0).click();
  const qrDialog = page.getByRole('dialog');
  await qrDialog.waitFor({ state: 'visible', timeout: 10000 });
  assert(/QR|Download|PNG|SVG/i.test(await qrDialog.innerText()) || (await qrDialog.locator('svg,canvas,img').count()) > 0, 'QR dialog lacks QR content');
  pass('qr-dialog');
  await shot(page, '03-qr-dialog');
  await page.keyboard.press('Escape');

  await card.hover();
  await cardButtons.nth(1).click();
  await page.getByText('Edit Link', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
  await page.locator('input[placeholder="Optional title"]').fill(editedTitle);
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await page.getByText(editedTitle, { exact: true }).waitFor({ state: 'visible', timeout: 20000 });
  pass('edit-link');

  await page.getByRole('button', { name: 'Analytics', exact: true }).click();
  await page.waitForURL(new RegExp(`/project/${projectId}/analytics$`), { timeout: 20000 });
  assert(/Analytics/i.test(await page.locator('body').innerText()), 'project analytics page missing Analytics');
  pass('project-analytics');
  await shot(page, '04-project-analytics');

  await page.goto(`${base}/qr`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  assert(/QR/i.test(await page.locator('body').innerText()), 'QR page failed to render');
  pass('qr-page');

  await page.goto(`${base}/create/bulk`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByText(/Bulk create requires Pro/i).waitFor({ state: 'visible', timeout: 15000 });
  pass('bulk-create-pro-gate');

  await page.goto(`${base}/reports`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByText(/Reports require Team/i).waitFor({ state: 'visible', timeout: 15000 });
  pass('reports-team-gate');
  await shot(page, '05-reports-team-gate');

  const routes = ['/billing','/domains','/tags','/team','/utm-templates','/campaigns','/compare','/branding','/privacy-settings'];
  for (const route of routes) {
    const response = await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    assert(response && response.status() < 500, `${route} HTTP ${response?.status()}`);
    await page.waitForTimeout(600);
    assert((await page.locator('body').innerText()).trim().length > 40, `${route} rendered empty content`);
    pass(`route-${route.slice(1)}`);
  }

  await page.goto(`${base}/admin`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByText('Access denied', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  pass('admin-nonprivileged-access-denied');

  await page.goto(`${base}/project/${projectId}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByLabel('Edit project').click();
  await page.locator('#project-name').fill(projectNameEdited);
  await page.getByRole('button', { name: 'Save Project', exact: true }).click();
  await page.getByText(projectNameEdited, { exact: true }).waitFor({ state: 'visible', timeout: 20000 });
  pass('edit-project');

  await page.goto(`${base}/project/${projectId}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await chooseCombo(page, 2, 'Most Clicks');
  const deleteCard = page.locator('div.group.cursor-pointer').filter({ hasText: firstCode }).first();
  await deleteCard.hover();
  await deleteCard.locator('button').nth(2).click();
  const deleteDialog = page.getByRole('alertdialog');
  await deleteDialog.waitFor({ state: 'visible', timeout: 10000 });
  await deleteDialog.getByRole('button', { name: 'Delete Link', exact: true }).click();
  await page.getByText(firstCode, { exact: false }).waitFor({ state: 'hidden', timeout: 20000 });
  pass('soft-delete-link');

  const gone = await fetch(`${base}/r/${firstCode}?deleted_check=${stamp}`, { redirect: 'manual' });
  assert(gone.status === 410, `soft-deleted redirect expected 410, got ${gone.status}`);
  pass('soft-deleted-redirect-410');

  await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByText(projectNameEdited, { exact: true }).waitFor({ state: 'visible', timeout: 20000 });
  pass('dashboard-after-actions');
  await shot(page, '06-dashboard-final');

  if (sameOrigin5xx.length) throw new Error(`same-origin 5xx encountered: ${[...new Set(sameOrigin5xx)].join(', ')}`);
} catch (error) {
  primaryError = error;
  diagnostics.push({ failure: error instanceof Error ? error.message : String(error), linkCreateResponses });
  if (page) await shot(page, 'FAIL-current-page');
} finally {
  if (apiClient && createdLinkIds.length) {
    let deleted = 0;
    for (const id of createdLinkIds) {
      try { await apiClient.link.delete.mutate({ id }); deleted += 1; } catch {}
    }
    diagnostics.push({ cleanupSoftDeletedLinks: deleted, attempted: createdLinkIds.length });
  }
  if (apiClient && projectId) {
    try {
      await apiClient.project.delete.mutate({ id: projectId, mode: 'move' });
      diagnostics.push({ cleanupProjectDeleted: projectId });
    } catch (error) {
      diagnostics.push({ cleanupProjectDeleteError: String(error) });
    }
  }
  if (browser) await browser.close();
}

console.log('AUTHENTICATED_PRODUCTION_E2E_RESULTS=' + JSON.stringify(results, null, 2));
console.log('AUTHENTICATED_PRODUCTION_E2E_DIAGNOSTICS=' + JSON.stringify(diagnostics, null, 2));
if (pageErrors.length) console.log('AUTHENTICATED_PRODUCTION_E2E_PAGE_ERRORS=' + JSON.stringify(pageErrors.slice(0, 30), null, 2));
if (primaryError) throw primaryError;
