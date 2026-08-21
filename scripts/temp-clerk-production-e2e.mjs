import { chromium } from 'playwright';
import { clerk } from '@clerk/testing/playwright';
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
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const shot = async (page, name) => { try { await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); } catch {} };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function dismissCookie(page) {
  const essential = page.getByRole('button', { name: /Essential Only/i });
  if (await essential.isVisible().catch(() => false)) await essential.click();
}

async function selectOption(page, index, label) {
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

try {
  const healthResponse = await fetch(`${base}/healthz?auth_e2e=${stamp}`, { headers: { 'cache-control': 'no-cache' } });
  assert(healthResponse.ok, `healthz HTTP ${healthResponse.status}`);
  const health = await healthResponse.json();
  assert(health.status === 'ok', `health status=${health.status}`);
  assert(health.commit === expectedCommit, `health commit ${health.commit} != ${expectedCommit}`);
  assert(String(health.runtime || '').startsWith('v24.'), `runtime ${health.runtime} is not Node 24`);
  pass('healthz', { commit: health.commit, runtime: health.runtime });

  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('response', response => {
    try {
      const u = new URL(response.url());
      if (u.origin === new URL(base).origin && response.status() >= 500) sameOrigin5xx.push(`${response.status()} ${u.pathname}`);
    } catch {}
  });

  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await dismissCookie(page);
  await clerk.loaded({ page });
  await clerk.signIn({ page, emailAddress: email });
  await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByText(/Welcome back/i).waitFor({ state: 'visible', timeout: 25000 });
  pass('clerk-authenticated-signin');
  await shot(page, '01-dashboard-authenticated');

  const newProject = page.getByRole('button', { name: /New Project|Create Your First Project/i }).first();
  await newProject.click();
  await page.locator('input[placeholder="Q4 Campaign"]').fill(projectName);
  const projectDesc = page.locator('textarea[placeholder="Links for the Q4 marketing push"]');
  if (await projectDesc.isVisible().catch(() => false)) await projectDesc.fill('Temporary live E2E project');
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
  await page.locator('input[placeholder="https://example.com/landing-page"]').fill(`https://example.com/?slugly_e2e=${stamp}`);
  await page.locator('input[placeholder="Black Friday Landing"]').fill(firstTitle);
  const tagInput = page.locator('input[placeholder="Add tags (press Enter)"]');
  await tagInput.fill(tag);
  await tagInput.press('Enter');
  await page.locator('input[placeholder="my-link"]').fill(firstCode);
  await page.getByRole('button', { name: 'Create Link', exact: true }).click();
  await page.getByText('Link Created!', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  pass('create-link-ui', { shortCode: firstCode, tag });
  await shot(page, '02-link-created');

  const analyticsButton = page.getByRole('button', { name: /View Analytics/i });
  await analyticsButton.click();
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
  await sleep(1800);

  await page.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByText(projectName, { exact: true }).waitFor({ state: 'visible', timeout: 20000 });

  const cookies = await context.cookies(base);
  const cookieHeader = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
  let workspaceId = '';
  try { workspaceId = await page.evaluate(() => localStorage.getItem('slugly_workspace_id') || ''); } catch {}
  apiClient = createTRPCClient({
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

  const currentWorkspace = await apiClient.workspace.current.query();
  if (!workspaceId && currentWorkspace?.workspace?.id) workspaceId = String(currentWorkspace.workspace.id);
  assert(currentWorkspace?.workspace, 'workspace.current returned no workspace');
  pass('workspace-current', { plan: currentWorkspace.workspace.plan || 'free' });

  const projectList = await apiClient.project.list.query();
  assert(projectList.some(item => item.id === projectId), 'created project missing from authenticated API');
  pass('authenticated-trpc');

  // Seed exactly 50 additional active links through the same production tRPC API.
  // Together with the UI-created link this forces ProjectView onto two pages (50 + 1).
  for (let start = 0; start < 50; start += 5) {
    const batch = Array.from({ length: Math.min(5, 50 - start) }, (_, offset) => start + offset + 1);
    const created = await Promise.all(batch.map(i => apiClient.link.create.mutate({
      destinationUrl: `https://example.com/?slugly_seed=${stamp}-${i}`,
      title: `E2E Seed ${stamp} ${String(i).padStart(2, '0')}`,
      projectId,
      customCode: `e2e-seed-${stamp}-${i}`,
    })));
    createdLinkIds.push(...created.map(item => item.id));
    await sleep(150);
  }
  assert(createdLinkIds.length === 51, `expected 51 created links, got ${createdLinkIds.length}`);
  pass('seed-pagination-data', { links: createdLinkIds.length });

  await page.goto(`${base}/project/${projectId}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByText('51 matching links · 50 per page', { exact: false }).waitFor({ state: 'visible', timeout: 30000 });
  await page.getByText('Page 1 of 2', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByRole('button', { name: /Next/i }).click();
  await page.getByText('Page 2 of 2', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  await page.getByText('Showing 51–51 of 51', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  pass('project-pagination-50-per-page');
  await shot(page, '03-project-page-2');
  await page.getByRole('button', { name: /Previous/i }).click();
  await page.getByText('Page 1 of 2', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });

  const search = page.locator('input[placeholder="Search links..."]');
  await search.fill(firstTitle);
  await page.waitForTimeout(900);
  await page.getByText(firstCode, { exact: false }).waitFor({ state: 'visible', timeout: 15000 });
  pass('project-search');
  await search.fill('');
  await page.waitForTimeout(750);

  await selectOption(page, 0, 'Active');
  await page.getByText(firstCode, { exact: false }).waitFor({ state: 'visible', timeout: 15000 });
  pass('status-filter-active');
  for (const label of ['Broken', 'Quarantine', 'Expired']) {
    await selectOption(page, 0, label);
    await page.waitForTimeout(500);
    const failed = await page.getByText(/Couldn’t load project links|Failed to load project links/i).isVisible().catch(() => false);
    assert(!failed, `${label} status filter returned page error`);
    pass(`status-filter-${label.toLowerCase()}`);
  }
  await selectOption(page, 0, 'All Status');

  const combos = page.locator('button[role="combobox"]');
  assert((await combos.count()) >= 3, `expected status/tag/sort controls, found ${await combos.count()}`);
  await selectOption(page, 1, tag);
  await page.getByText(firstCode, { exact: false }).waitFor({ state: 'visible', timeout: 15000 });
  pass('tag-filter');
  await selectOption(page, 1, 'All Tags');
  await selectOption(page, 2, 'Most Clicks');
  await page.waitForTimeout(1000);
  const firstCard = page.locator('div.group.cursor-pointer').first();
  await firstCard.waitFor({ state: 'visible', timeout: 15000 });
  assert((await firstCard.innerText()).includes(firstCode), `Most Clicks did not put clicked link first: ${(await firstCard.innerText()).slice(0, 160)}`);
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
  await shot(page, '04-qr-dialog');
  await page.keyboard.press('Escape');

  await card.hover();
  await cardButtons.nth(1).click();
  await page.getByText('Edit Link', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
  const titleInput = page.locator('input[placeholder="Optional title"]');
  await titleInput.fill(editedTitle);
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
  await page.getByText(editedTitle, { exact: true }).waitFor({ state: 'visible', timeout: 20000 });
  pass('edit-link-preserves-record');

  await page.getByRole('button', { name: 'Analytics', exact: true }).click();
  await page.waitForURL(new RegExp(`/project/${projectId}/analytics$`), { timeout: 20000 });
  assert(/Analytics/i.test(await page.locator('body').innerText()), 'project analytics page missing Analytics');
  pass('project-analytics');
  await shot(page, '05-project-analytics');

  await page.goto(`${base}/qr`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  assert(/QR/i.test(await page.locator('body').innerText()), 'QR page failed to render');
  pass('qr-page');

  await page.goto(`${base}/reports`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  const reportsBody = await page.locator('body').innerText();
  assert(/Export Report|Reports require Team/i.test(reportsBody), 'reports page failed to render');
  if (/Reports require Team/i.test(reportsBody)) pass('reports-team-plan-gate');
  else pass('reports-page-access');
  await shot(page, '06-reports');

  const protectedRoutes = ['/billing','/domains','/tags','/team','/utm-templates','/campaigns','/compare','/branding','/privacy-settings'];
  for (const route of protectedRoutes) {
    const response = await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    assert(response && response.status() < 500, `${route} HTTP ${response?.status()}`);
    await page.waitForTimeout(600);
    const body = await page.locator('body').innerText();
    assert(body.trim().length > 40, `${route} rendered empty content`);
    pass(`route-${route.slice(1)}`);
  }

  await page.goto(`${base}/admin`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByText('Access denied', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  assert(/Administrator or support access is required/i.test(await page.locator('body').innerText()), 'non-admin admin guard copy missing');
  pass('admin-nonprivileged-access-denied');

  await page.goto(`${base}/project/${projectId}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByLabel('Edit project').click();
  const projectNameInput = page.locator('#project-name');
  await projectNameInput.fill(projectNameEdited);
  await page.getByRole('button', { name: 'Save Project', exact: true }).click();
  await page.getByText(projectNameEdited, { exact: true }).waitFor({ state: 'visible', timeout: 20000 });
  pass('edit-project');

  await page.goto(`${base}/project/${projectId}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await selectOption(page, 2, 'Most Clicks');
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
  await shot(page, '07-dashboard-final');

  if (sameOrigin5xx.length) throw new Error(`same-origin 5xx encountered: ${[...new Set(sameOrigin5xx)].join(', ')}`);
} catch (error) {
  primaryError = error;
  diagnostics.push({ failure: error instanceof Error ? error.message : String(error) });
  if (page) await shot(page, 'FAIL-current-page');
} finally {
  // Best-effort production cleanup. Slugly deletion is intentionally soft-delete,
  // so these records enter the 30-day Trash retention path instead of remaining active.
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
