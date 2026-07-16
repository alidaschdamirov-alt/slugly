/**
 * Workspace helpers: gating, plan config, membership, invitations
 */
import { eq, and, or, desc, sql, inArray, isNull } from "drizzle-orm";
import { getDb } from "./db";
import { workspaces, workspaceMembers, workspaceInvitations, projects, links, domains, users, clicks } from "../drizzle/schema";
import type { Workspace, WorkspaceMember, InsertWorkspace, InsertWorkspaceMember } from "../drizzle/schema";
import { getSiteSetting, setSiteSetting } from "./db";

// ============ PLAN CONFIG (source of truth for gating) ============

export type PlanName = "free" | "starter" | "pro" | "team";

export interface PlanLimits {
  projects: number;        // max projects (-1 = unlimited)
  links: number;           // max links (-1 = unlimited)
  domains: number;         // max custom domains
  analyticsRetentionDays: number;
  seats: number;           // max workspace members
}

export interface PlanFeatures {
  utmTemplates: boolean;
  campaignDashboard: "none" | "basic" | "full";
  csvExport: boolean;
  bulkOps: boolean;
  geoTarget: boolean;
  abTest: boolean;
  deepLinks: boolean;
  pixels: boolean;
  roles: boolean;          // extended roles (viewer/editor distinction)
  whiteLabelReports: boolean;
}

export interface PlanConfig {
  limits: PlanLimits;
  features: PlanFeatures;
}

const DEFAULT_PLAN_CONFIG: Record<PlanName, PlanConfig> = {
  free: {
    limits: { projects: 1, links: 5, domains: 0, analyticsRetentionDays: 30, seats: 1 },
    features: { utmTemplates: false, campaignDashboard: "none", csvExport: false, bulkOps: false, geoTarget: false, abTest: false, deepLinks: false, pixels: false, roles: false, whiteLabelReports: false },
  },
  starter: {
    limits: { projects: 3, links: -1, domains: 1, analyticsRetentionDays: 365, seats: 1 },
    features: { utmTemplates: true, campaignDashboard: "basic", csvExport: false, bulkOps: false, geoTarget: false, abTest: false, deepLinks: false, pixels: false, roles: false, whiteLabelReports: false },
  },
  pro: {
    limits: { projects: -1, links: -1, domains: 3, analyticsRetentionDays: 365, seats: 3 },
    features: { utmTemplates: true, campaignDashboard: "full", csvExport: true, bulkOps: true, geoTarget: true, abTest: true, deepLinks: true, pixels: true, roles: false, whiteLabelReports: false },
  },
  team: {
    limits: { projects: -1, links: -1, domains: 25, analyticsRetentionDays: 730, seats: 10 },
    features: { utmTemplates: true, campaignDashboard: "full", csvExport: true, bulkOps: true, geoTarget: true, abTest: true, deepLinks: true, pixels: true, roles: true, whiteLabelReports: true },
  },
};

export async function getAllPlanConfigs(): Promise<Record<PlanName, PlanConfig>> {
  const raw = await getSiteSetting("plan_configs_v2");
  if (!raw) return DEFAULT_PLAN_CONFIG;
  try {
    const parsed = JSON.parse(raw);
    // Merge with defaults to ensure new fields are always present
    const result: Record<PlanName, PlanConfig> = { ...DEFAULT_PLAN_CONFIG };
    for (const plan of ["free", "starter", "pro", "team"] as PlanName[]) {
      if (parsed[plan]) {
        result[plan] = {
          limits: { ...DEFAULT_PLAN_CONFIG[plan].limits, ...parsed[plan].limits },
          features: { ...DEFAULT_PLAN_CONFIG[plan].features, ...parsed[plan].features },
        };
      }
    }
    return result;
  } catch {
    return DEFAULT_PLAN_CONFIG;
  }
}

export async function setPlanConfigs(configs: Record<PlanName, PlanConfig>): Promise<void> {
  await setSiteSetting("plan_configs_v2", JSON.stringify(configs));
}

export async function getPlanConfig(plan: PlanName): Promise<PlanConfig> {
  const all = await getAllPlanConfigs();
  return all[plan] || DEFAULT_PLAN_CONFIG.free;
}

// ============ GATING HELPERS ============

export function canUseFeature(config: PlanConfig, feature: keyof PlanFeatures): boolean {
  const val = config.features[feature];
  if (typeof val === "boolean") return val;
  // For campaignDashboard: "none" = false, "basic"/"full" = true
  return val !== "none";
}

export interface LimitCheckResult {
  allowed: boolean;
  limit: number;
  current: number;
  resource: keyof PlanLimits;
  nearLimit?: boolean; // true when 1 remaining
}

export function checkLimit(config: PlanConfig, resource: keyof PlanLimits, currentCount: number): LimitCheckResult {
  const limit = config.limits[resource];
  if (limit === -1) return { allowed: true, limit: -1, current: currentCount, resource };
  const allowed = currentCount < limit;
  const nearLimit = allowed && (limit - currentCount) <= 1;
  return { allowed, limit, current: currentCount, resource, nearLimit };
}

// ============ WORKSPACE CRUD ============

export async function createWorkspace(data: { name: string; plan?: PlanName }): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(workspaces).values({ name: data.name, plan: data.plan || "free" });
  return { id: result[0].insertId };
}

export async function getWorkspaceById(id: number): Promise<Workspace | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
  return ws;
}

/**
 * setWorkspacePlan — THE SINGLE PATH for changing a workspace's plan.
 * Called by: admin override, self-upgrade (billing), and future Stripe webhook.
 * TEMP: simulated payment until Stripe is connected.
 */
export async function setWorkspacePlan(workspaceId: number, plan: PlanName): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(workspaces).set({ plan }).where(eq(workspaces.id, workspaceId));
  // Also sync the owner's user.plan for backward compat with old queries
  const ownerMembership = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, "owner")))
    .limit(1);
  if (ownerMembership.length > 0) {
    await db.update(users).set({ plan }).where(eq(users.id, ownerMembership[0].userId));
  }
}

/** @deprecated Use setWorkspacePlan instead */
export async function updateWorkspacePlan(workspaceId: number, plan: PlanName): Promise<void> {
  return setWorkspacePlan(workspaceId, plan);
}

export async function updateWorkspaceName(workspaceId: number, name: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(workspaces).set({ name }).where(eq(workspaces.id, workspaceId));
}

// ============ MEMBERSHIP ============

export async function addWorkspaceMember(data: InsertWorkspaceMember): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(workspaceMembers).values(data);
}

export async function getWorkspaceMemberships(userId: number): Promise<Array<WorkspaceMember & { workspace: Workspace }>> {
  const db = await getDb();
  if (!db) return [];
  const memberships = await db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, userId));
  if (memberships.length === 0) return [];
  const wsIds = memberships.map(m => m.workspaceId);
  const wsList = await db.select().from(workspaces).where(inArray(workspaces.id, wsIds));
  const wsMap = Object.fromEntries(wsList.map(w => [w.id, w]));
  return memberships.map(m => ({ ...m, workspace: wsMap[m.workspaceId] })).filter(m => m.workspace);
}

export async function getWorkspaceMembers(workspaceId: number): Promise<Array<WorkspaceMember & { user: { id: number; name: string | null; email: string | null } }>> {
  const db = await getDb();
  if (!db) return [];
  const members = await db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId));
  if (members.length === 0) return [];
  const userIds = members.map(m => m.userId);
  const userList = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, userIds));
  const userMap = Object.fromEntries(userList.map(u => [u.id, u]));
  return members.map(m => ({ ...m, user: userMap[m.userId] || { id: m.userId, name: null, email: null } }));
}

export async function getMembership(workspaceId: number, userId: number): Promise<WorkspaceMember | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const [m] = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return m;
}

export async function updateMemberRole(memberId: number, role: "owner" | "admin" | "editor" | "viewer"): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(workspaceMembers).set({ role }).where(eq(workspaceMembers.id, memberId));
}

export async function removeMember(memberId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(workspaceMembers).where(eq(workspaceMembers.id, memberId));
}

export async function countWorkspaceMembers(workspaceId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [result] = await db.select({ count: sql<number>`COUNT(*)` }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId));
  return result?.count ?? 0;
}

// ============ WORKSPACE RESOURCE COUNTS ============

export async function countWorkspaceProjects(workspaceId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [result] = await db.select({ count: sql<number>`COUNT(*)` }).from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.archived, false)));
  return result?.count ?? 0;
}

export async function countWorkspaceLinks(workspaceId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [result] = await db.select({ count: sql<number>`COUNT(*)` }).from(links)
    .where(eq(links.userId, 0)); // placeholder — we need to count via projects
  // Actually count links in workspace's projects + links directly owned by workspace members
  const wsProjects = await db.select({ id: projects.id }).from(projects).where(eq(projects.workspaceId, workspaceId));
  if (wsProjects.length === 0) {
    // Count links by workspace members directly
    const members = await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId));
    if (members.length === 0) return 0;
    const memberIds = members.map(m => m.userId);
    const [r] = await db.select({ count: sql<number>`COUNT(*)` }).from(links).where(inArray(links.userId, memberIds));
    return r?.count ?? 0;
  }
  const projectIds = wsProjects.map(p => p.id);
  // Links in workspace projects OR owned by workspace members (for unassigned links)
  const members = await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId));
  const memberIds = members.map(m => m.userId);
  const [r] = await db.select({ count: sql<number>`COUNT(*)` }).from(links)
    .where(sql`(${links.projectId} IN (${sql.raw(projectIds.join(","))}) OR ${links.userId} IN (${sql.raw(memberIds.join(",") || "0")}))`);
  return r?.count ?? 0;
}

export async function countWorkspaceDomains(workspaceId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const [result] = await db.select({ count: sql<number>`COUNT(*)` }).from(domains).where(eq(domains.workspaceId, workspaceId));
  return result?.count ?? 0;
}

// ============ INVITATIONS ============

export async function createInvitation(data: { workspaceId: number; email: string; role: "admin" | "editor" | "viewer"; invitedBy: number; token: string; expiresAt: number }): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(workspaceInvitations).values(data);
  return { id: result[0].insertId };
}

export async function getInvitationByToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const [inv] = await db.select().from(workspaceInvitations).where(eq(workspaceInvitations.token, token)).limit(1);
  return inv;
}

export async function getPendingInvitations(workspaceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(workspaceInvitations)
    .where(and(eq(workspaceInvitations.workspaceId, workspaceId), eq(workspaceInvitations.status, "pending")))
    .orderBy(desc(workspaceInvitations.createdAt));
}

export async function getUserPendingInvitations(email: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(workspaceInvitations)
    .where(and(eq(workspaceInvitations.email, email), eq(workspaceInvitations.status, "pending")))
    .orderBy(desc(workspaceInvitations.createdAt));
}

export async function acceptInvitation(invitationId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(workspaceInvitations).set({ status: "accepted" }).where(eq(workspaceInvitations.id, invitationId));
}

export async function expireInvitation(invitationId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(workspaceInvitations).set({ status: "expired" }).where(eq(workspaceInvitations.id, invitationId));
}

// ============ ENSURE WORKSPACE FOR USER (called on login) ============

export async function ensurePersonalWorkspace(userId: number, userName?: string | null): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Check if user already has a workspace as owner
  const existing = await db.select().from(workspaceMembers)
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.role, "owner")))
    .limit(1);
  
  if (existing.length > 0) return existing[0].workspaceId;
  
  // Create personal workspace
  const wsName = userName ? `${userName}'s Workspace` : "My Workspace";
  const user = await db.select({ plan: users.plan }).from(users).where(eq(users.id, userId)).limit(1);
  const plan = user[0]?.plan || "free";
  
  const [wsResult] = await db.insert(workspaces).values({ name: wsName, plan: plan as PlanName });
  const workspaceId = wsResult.insertId;
  
  await db.insert(workspaceMembers).values({ workspaceId, userId, role: "owner" });
  
  // Migrate any orphaned projects/domains to this workspace
  await db.update(projects).set({ workspaceId }).where(and(eq(projects.userId, userId), sql`${projects.workspaceId} IS NULL`));
  await db.update(domains).set({ workspaceId }).where(and(eq(domains.userId, userId), sql`${domains.workspaceId} IS NULL`));
  
  return workspaceId;
}

// ============ UTM TEMPLATES ============

import { utmTemplates } from "../drizzle/schema";
import type { InsertUtmTemplate, UtmTemplate } from "../drizzle/schema";

export async function listUtmTemplates(workspaceId: number): Promise<UtmTemplate[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(utmTemplates).where(eq(utmTemplates.workspaceId, workspaceId)).orderBy(desc(utmTemplates.createdAt));
}

export async function createUtmTemplate(data: InsertUtmTemplate): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(utmTemplates).values(data);
  return { id: result.insertId };
}

export async function updateUtmTemplate(id: number, workspaceId: number, data: Partial<Pick<UtmTemplate, "name" | "utmSource" | "utmMedium" | "utmCampaign" | "utmTerm" | "utmContent">>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(utmTemplates).set(data).where(and(eq(utmTemplates.id, id), eq(utmTemplates.workspaceId, workspaceId)));
}

export async function deleteUtmTemplate(id: number, workspaceId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(utmTemplates).where(and(eq(utmTemplates.id, id), eq(utmTemplates.workspaceId, workspaceId)));
}

// ============ BULK OPERATIONS ============

export async function bulkMoveLinks(linkIds: number[], targetProjectId: number, workspaceId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  // Verify target project belongs to workspace
  const [proj] = await db.select({ id: projects.id }).from(projects)
    .where(and(eq(projects.id, targetProjectId), eq(projects.workspaceId, workspaceId)));
  if (!proj) throw new Error("Target project not found in this workspace");
  // Move links (only those in workspace's projects)
  const wsProjects = await db.select({ id: projects.id }).from(projects).where(eq(projects.workspaceId, workspaceId));
  const projectIds = wsProjects.map(p => p.id);
  if (projectIds.length === 0) return 0;
  const result = await db.update(links).set({ projectId: targetProjectId })
    .where(and(inArray(links.id, linkIds), inArray(links.projectId, projectIds)));
  return (result as any)[0]?.affectedRows ?? linkIds.length;
}

export async function bulkTagLinks(linkIds: number[], tags: string[], workspaceId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  // Get workspace project IDs for scoping
  const wsProjects = await db.select({ id: projects.id }).from(projects).where(eq(projects.workspaceId, workspaceId));
  const projectIds = wsProjects.map(p => p.id);
  if (projectIds.length === 0) return 0;
  // Get current links that belong to workspace
  const targetLinks = await db.select({ id: links.id, tags: links.tags }).from(links)
    .where(and(inArray(links.id, linkIds), inArray(links.projectId, projectIds)));
  let updated = 0;
  for (const link of targetLinks) {
    const currentTags: string[] = Array.isArray(link.tags) ? link.tags : [];
    const mergedSet = new Set([...currentTags, ...tags]);
    const merged = Array.from(mergedSet);
    await db.update(links).set({ tags: merged }).where(eq(links.id, link.id));
    updated++;
  }
  return updated;
}

export async function bulkUntagLinks(linkIds: number[], tagsToRemove: string[], workspaceId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const wsProjects = await db.select({ id: projects.id }).from(projects).where(eq(projects.workspaceId, workspaceId));
  const projectIds = wsProjects.map(p => p.id);
  if (projectIds.length === 0) return 0;
  const targetLinks = await db.select({ id: links.id, tags: links.tags }).from(links)
    .where(and(inArray(links.id, linkIds), inArray(links.projectId, projectIds)));
  let updated = 0;
  for (const link of targetLinks) {
    const currentTags: string[] = Array.isArray(link.tags) ? link.tags : [];
    const filtered = currentTags.filter(t => !tagsToRemove.includes(t));
    await db.update(links).set({ tags: filtered.length > 0 ? filtered : null }).where(eq(links.id, link.id));
    updated++;
  }
  return updated;
}

export async function archiveProject(projectId: number, workspaceId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(projects).set({ archived: true })
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)));
}

export async function unarchiveProject(projectId: number, workspaceId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(projects).set({ archived: false })
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)));
}

export async function listArchivedProjects(workspaceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.archived, true)))
    .orderBy(desc(projects.createdAt));
}

// ============ CAMPAIGN DASHBOARD (channel comparison) ============

export interface ChannelStats {
  utmSource: string | null;
  utmMedium: string | null;
  clicks: number;
  uniqueLinks: number;
}

/**
 * Aggregate clicks by utmSource/utmMedium for workspace links.
 * Supports filtering by projectId or tag.
 */
export async function getCampaignChannelStats(
  workspaceId: number,
  opts: { days?: number; projectId?: number; tag?: string } = {}
): Promise<{ channels: ChannelStats[]; totalClicks: number }> {
  const db = await getDb();
  if (!db) return { channels: [], totalClicks: 0 };

  const days = opts.days || 30;
  const since = Date.now() - days * 24 * 60 * 60 * 1000;

  // Get workspace project IDs
  const wsProjects = await db.select({ id: projects.id }).from(projects).where(eq(projects.workspaceId, workspaceId));
  const projectIds = wsProjects.map(p => p.id);
  if (projectIds.length === 0) return { channels: [], totalClicks: 0 };

  // Get links in scope
  let scopedLinks;
  if (opts.projectId) {
    if (!projectIds.includes(opts.projectId)) return { channels: [], totalClicks: 0 };
    scopedLinks = await db.select({ id: links.id, utmSource: links.utmSource, utmMedium: links.utmMedium })
      .from(links).where(eq(links.projectId, opts.projectId));
  } else if (opts.tag) {
    scopedLinks = await db.select({ id: links.id, utmSource: links.utmSource, utmMedium: links.utmMedium })
      .from(links).where(and(inArray(links.projectId, projectIds), sql`JSON_CONTAINS(${links.tags}, ${JSON.stringify(opts.tag)})`));
  } else {
    scopedLinks = await db.select({ id: links.id, utmSource: links.utmSource, utmMedium: links.utmMedium })
      .from(links).where(inArray(links.projectId, projectIds));
  }

  if (scopedLinks.length === 0) return { channels: [], totalClicks: 0 };

  const linkIds = scopedLinks.map(l => l.id);

  // Get click counts per link in time range (exclude bots)
  const clickRows = await db.select({
    linkId: clicks.linkId,
    count: sql<number>`COUNT(*)`,
  }).from(clicks)
    .where(and(inArray(clicks.linkId, linkIds), sql`${clicks.timestamp} >= ${since}`, eq(clicks.isBot, false)))
    .groupBy(clicks.linkId);

  const clickMap = Object.fromEntries(clickRows.map(r => [r.linkId, r.count]));

  // Aggregate by channel (utmSource + utmMedium)
  const channelMap = new Map<string, { utmSource: string | null; utmMedium: string | null; clicks: number; uniqueLinks: number }>();
  let totalClicks = 0;

  for (const link of scopedLinks) {
    const key = `${link.utmSource || "(none)"}|${link.utmMedium || "(none)"}`;
    const linkClicks = clickMap[link.id] || 0;
    totalClicks += linkClicks;

    if (!channelMap.has(key)) {
      channelMap.set(key, { utmSource: link.utmSource, utmMedium: link.utmMedium, clicks: 0, uniqueLinks: 0 });
    }
    const ch = channelMap.get(key)!;
    ch.clicks += linkClicks;
    ch.uniqueLinks += 1;
  }

  const channels = Array.from(channelMap.values())
    .sort((a, b) => b.clicks - a.clicks);

  return { channels, totalClicks };
}

// ============ WHITE-LABEL BRANDING ============

export interface WorkspaceBranding {
  logoUrl: string | null;
  brandColor: string; // hex
  companyName: string | null;
  contactEmail: string | null;
  website: string | null;
}

const DEFAULT_BRANDING: WorkspaceBranding = { logoUrl: null, brandColor: "#6366f1", companyName: null, contactEmail: null, website: null };

export async function getWorkspaceBranding(workspaceId: number): Promise<WorkspaceBranding> {
  const raw = await getSiteSetting(`ws_branding_${workspaceId}`);
  if (!raw) return DEFAULT_BRANDING;
  try {
    return { ...DEFAULT_BRANDING, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_BRANDING;
  }
}

export async function setWorkspaceBranding(workspaceId: number, branding: Partial<WorkspaceBranding>): Promise<void> {
  const current = await getWorkspaceBranding(workspaceId);
  const merged = { ...current, ...branding };
  await setSiteSetting(`ws_branding_${workspaceId}`, JSON.stringify(merged));
}

// ============ ADMIN: LIST WORKSPACES ============

export async function adminListWorkspaces(opts: { search?: string; plan?: string } = {}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (opts.plan) conditions.push(eq(workspaces.plan, opts.plan as any));
  if (opts.search) conditions.push(sql`${workspaces.name} LIKE ${'%' + opts.search + '%'}`);

  const rows = await db.select({
    id: workspaces.id,
    name: workspaces.name,
    plan: workspaces.plan,
    createdAt: workspaces.createdAt,
  }).from(workspaces)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${workspaces.id} DESC`)
    .limit(100);

  // Enrich with member count and project count
  const enriched = await Promise.all(rows.map(async (row) => {
    const memberCount = await countWorkspaceMembers(row.id);
    const projectCount = await countWorkspaceProjects(row.id);
    const linkCount = await countWorkspaceLinks(row.id);
    return { ...row, memberCount, projectCount, linkCount };
  }));

  return enriched;
}

// ============ PROJECT COMPARISON DASHBOARD ============

export interface ProjectComparisonResult {
  projectId: number;
  projectName: string;
  totalClicks: number;
  uniqueClicks: number;
  clicksOverTime: { day: string; count: number }[];
  topCountries: { value: string | null; count: number }[];
  topDevices: { value: string | null; count: number }[];
}

/**
 * Compare multiple projects side-by-side: total clicks, uniques, time series, top countries/devices.
 * Respects analytics retention by plan.
 */
export async function getProjectComparison(
  workspaceId: number,
  projectIds: number[],
  days: number
): Promise<ProjectComparisonResult[]> {
  const db = await getDb();
  if (!db) return [];

  // Verify all projects belong to workspace (also include projects with NULL workspaceId owned by workspace members)
  const wsProjects = await db.select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(
      or(eq(projects.workspaceId, workspaceId), isNull(projects.workspaceId)),
      inArray(projects.id, projectIds)
    ));

  if (wsProjects.length === 0) return [];

  const validProjectIds = wsProjects.map(p => p.id);
  const projectNameMap = Object.fromEntries(wsProjects.map(p => [p.id, p.name]));

  const since = Date.now() - days * 24 * 60 * 60 * 1000;

  // Get all links for these projects
  const allLinks = await db.select({ id: links.id, projectId: links.projectId })
    .from(links)
    .where(inArray(links.projectId, validProjectIds));

  if (allLinks.length === 0) {
    return validProjectIds.map(pid => ({
      projectId: pid,
      projectName: projectNameMap[pid] || "Unknown",
      totalClicks: 0,
      uniqueClicks: 0,
      clicksOverTime: [],
      topCountries: [],
      topDevices: [],
    }));
  }

  // Build linkId -> projectId map
  const linkToProject = Object.fromEntries(allLinks.map(l => [l.id, l.projectId]));
  const allLinkIds = allLinks.map(l => l.id);

  // Batch queries for all links at once, then split by project (EXCLUDE BOTS)
  const [totalRows, uniqueRows, timeRows, countryRows, deviceRows] = await Promise.all([
    // Total clicks per link (exclude bots)
    db.select({
      linkId: clicks.linkId,
      count: sql<number>`COUNT(*)`,
    }).from(clicks)
      .where(and(inArray(clicks.linkId, allLinkIds), sql`${clicks.timestamp} >= ${since}`, eq(clicks.isBot, false)))
      .groupBy(clicks.linkId),

    // Unique clicks per PROJECT (distinct ipHash across all project links, not sum per-link)
    db.select({
      projectId: links.projectId,
      count: sql<number>`COUNT(DISTINCT ${clicks.ipHash})`,
    }).from(clicks)
      .innerJoin(links, eq(clicks.linkId, links.id))
      .where(and(inArray(links.projectId, validProjectIds), sql`${clicks.timestamp} >= ${since}`, eq(clicks.isBot, false)))
      .groupBy(links.projectId),

    // Clicks over time per project (aggregate at project level directly, exclude bots)
    db.select({
      projectId: links.projectId,
      day: sql<string>`DATE(FROM_UNIXTIME(${clicks.timestamp} / 1000))`,
      count: sql<number>`COUNT(*)`,
    }).from(clicks)
      .innerJoin(links, eq(clicks.linkId, links.id))
      .where(and(inArray(links.projectId, validProjectIds), sql`${clicks.timestamp} >= ${since}`, eq(clicks.isBot, false)))
      .groupBy(links.projectId, sql`DATE(FROM_UNIXTIME(${clicks.timestamp} / 1000))`)
      .orderBy(sql`DATE(FROM_UNIXTIME(${clicks.timestamp} / 1000))`),

    // Top countries per project (exclude bots)
    db.select({
      projectId: links.projectId,
      value: clicks.country,
      count: sql<number>`COUNT(*)`,
    }).from(clicks)
      .innerJoin(links, eq(clicks.linkId, links.id))
      .where(and(inArray(links.projectId, validProjectIds), sql`${clicks.timestamp} >= ${since}`, eq(clicks.isBot, false), sql`${clicks.country} IS NOT NULL`))
      .groupBy(links.projectId, clicks.country)
      .orderBy(desc(sql`COUNT(*)`)),

    // Top devices per project (exclude bots)
    db.select({
      projectId: links.projectId,
      value: clicks.deviceType,
      count: sql<number>`COUNT(*)`,
    }).from(clicks)
      .innerJoin(links, eq(clicks.linkId, links.id))
      .where(and(inArray(links.projectId, validProjectIds), sql`${clicks.timestamp} >= ${since}`, eq(clicks.isBot, false), sql`${clicks.deviceType} IS NOT NULL`))
      .groupBy(links.projectId, clicks.deviceType)
      .orderBy(desc(sql`COUNT(*)`)),
  ]);

  // Aggregate totals per project
  const projectTotals: Record<number, number> = {};
  const projectUniques: Record<number, number> = {};
  for (const row of totalRows) {
    const pid = linkToProject[row.linkId];
    if (pid) projectTotals[pid] = (projectTotals[pid] || 0) + row.count;
  }
  // uniqueRows now grouped by projectId (not linkId) — proper cross-link dedup
  for (const row of uniqueRows) {
    const pid = (row as any).projectId as number;
    if (pid) projectUniques[pid] = row.count;
  }

  // Group time series by project
  const projectTimeSeries: Record<number, { day: string; count: number }[]> = {};
  for (const row of timeRows) {
    const pid = row.projectId!;
    if (!projectTimeSeries[pid]) projectTimeSeries[pid] = [];
    projectTimeSeries[pid].push({ day: row.day, count: row.count });
  }

  // Group countries by project (top 5 per project)
  const projectCountries: Record<number, { value: string | null; count: number }[]> = {};
  for (const row of countryRows) {
    const pid = row.projectId!;
    if (!projectCountries[pid]) projectCountries[pid] = [];
    if (projectCountries[pid].length < 5) {
      projectCountries[pid].push({ value: row.value, count: row.count });
    }
  }

  // Group devices by project (top 5 per project)
  const projectDevices: Record<number, { value: string | null; count: number }[]> = {};
  for (const row of deviceRows) {
    const pid = row.projectId!;
    if (!projectDevices[pid]) projectDevices[pid] = [];
    if (projectDevices[pid].length < 5) {
      projectDevices[pid].push({ value: row.value, count: row.count });
    }
  }

  return validProjectIds.map(pid => ({
    projectId: pid,
    projectName: projectNameMap[pid] || "Unknown",
    totalClicks: projectTotals[pid] || 0,
    uniqueClicks: projectUniques[pid] || 0,
    clicksOverTime: projectTimeSeries[pid] || [],
    topCountries: projectCountries[pid] || [],
    topDevices: projectDevices[pid] || [],
  }));
}

// ============ REPORT DATA AGGREGATION ============

export interface ReportData {
  title: string;
  period: { from: string; to: string; days: number };
  generatedAt: string;
  summary: {
    totalClicks: number;
    uniqueClicks: number;
    linkCount: number;
    topLink: { shortCode: string; destinationUrl: string; clicks: number } | null;
  };
  timeSeries: { day: string; clicks: number }[];
  channels: { source: string; medium: string; clicks: number; share: number }[];
  topLinks: { shortCode: string; destinationUrl: string; title: string | null; clicks: number; uniqueClicks: number }[];
  topCountries: { country: string; clicks: number }[];
  topDevices: { device: string; clicks: number }[];
  topReferrers: { referrer: string; clicks: number }[];
}

export async function generateReportData(
  workspaceId: number,
  opts: { projectId?: number; tag?: string; days: number }
): Promise<ReportData> {
  const db = await getDb();
  const now = Date.now();
  const since = now - opts.days * 24 * 60 * 60 * 1000;
  const fromDate = new Date(since).toISOString().split("T")[0];
  const toDate = new Date(now).toISOString().split("T")[0];

  if (!db) {
    return {
      title: "Report",
      period: { from: fromDate, to: toDate, days: opts.days },
      generatedAt: new Date().toISOString(),
      summary: { totalClicks: 0, uniqueClicks: 0, linkCount: 0, topLink: null },
      timeSeries: [],
      channels: [],
      topLinks: [],
      topCountries: [],
      topDevices: [],
      topReferrers: [],
    };
  }

  // Get workspace projects
  const wsProjects = await db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.workspaceId, workspaceId));
  const projectIds = wsProjects.map(p => p.id);
  if (projectIds.length === 0) {
    return {
      title: "Report",
      period: { from: fromDate, to: toDate, days: opts.days },
      generatedAt: new Date().toISOString(),
      summary: { totalClicks: 0, uniqueClicks: 0, linkCount: 0, topLink: null },
      timeSeries: [],
      channels: [],
      topLinks: [],
      topCountries: [],
      topDevices: [],
      topReferrers: [],
    };
  }

  // Determine title
  let title = "All Projects Report";
  let scopedLinkRows;

  if (opts.projectId) {
    const proj = wsProjects.find(p => p.id === opts.projectId);
    title = proj ? `${proj.name} — Performance Report` : "Project Report";
    scopedLinkRows = await db.select({ id: links.id, shortCode: links.shortCode, destinationUrl: links.destinationUrl, title: links.title, utmSource: links.utmSource, utmMedium: links.utmMedium })
      .from(links).where(eq(links.projectId, opts.projectId));
  } else if (opts.tag) {
    title = `#${opts.tag} — Performance Report`;
    scopedLinkRows = await db.select({ id: links.id, shortCode: links.shortCode, destinationUrl: links.destinationUrl, title: links.title, utmSource: links.utmSource, utmMedium: links.utmMedium })
      .from(links).where(and(inArray(links.projectId, projectIds), sql`JSON_CONTAINS(${links.tags}, ${JSON.stringify(opts.tag)})`));
  } else {
    scopedLinkRows = await db.select({ id: links.id, shortCode: links.shortCode, destinationUrl: links.destinationUrl, title: links.title, utmSource: links.utmSource, utmMedium: links.utmMedium })
      .from(links).where(inArray(links.projectId, projectIds));
  }

  if (scopedLinkRows.length === 0) {
    return {
      title,
      period: { from: fromDate, to: toDate, days: opts.days },
      generatedAt: new Date().toISOString(),
      summary: { totalClicks: 0, uniqueClicks: 0, linkCount: 0, topLink: null },
      timeSeries: [],
      channels: [],
      topLinks: [],
      topCountries: [],
      topDevices: [],
      topReferrers: [],
    };
  }

  const linkIds = scopedLinkRows.map(l => l.id);
  const linkCount = scopedLinkRows.length;

  // Run all aggregation queries in parallel
  const [
    totalResult,
    uniqueResult,
    timeSeriesResult,
    topLinksResult,
    countriesResult,
    devicesResult,
    referrersResult,
  ] = await Promise.all([
    // Total clicks
    db.select({ count: sql<number>`COUNT(*)` }).from(clicks)
      .where(and(inArray(clicks.linkId, linkIds), sql`${clicks.timestamp} >= ${since}`)),
    // Unique clicks (distinct IP+UA hash approximation)
    db.select({ count: sql<number>`COUNT(DISTINCT CONCAT(COALESCE(${clicks.country},''), ${clicks.deviceType}, ${clicks.browser}))` }).from(clicks)
      .where(and(inArray(clicks.linkId, linkIds), sql`${clicks.timestamp} >= ${since}`)),
    // Time series
    db.select({
      day: sql<string>`DATE(FROM_UNIXTIME(${clicks.timestamp} / 1000))`,
      count: sql<number>`COUNT(*)`,
    }).from(clicks)
      .where(and(inArray(clicks.linkId, linkIds), sql`${clicks.timestamp} >= ${since}`))
      .groupBy(sql`DATE(FROM_UNIXTIME(${clicks.timestamp} / 1000))`)
      .orderBy(sql`DATE(FROM_UNIXTIME(${clicks.timestamp} / 1000))`),
    // Top links by clicks
    db.select({
      linkId: clicks.linkId,
      count: sql<number>`COUNT(*)`,
      uniqueCount: sql<number>`COUNT(DISTINCT CONCAT(COALESCE(${clicks.country},''), ${clicks.deviceType}, ${clicks.browser}))`,
    }).from(clicks)
      .where(and(inArray(clicks.linkId, linkIds), sql`${clicks.timestamp} >= ${since}`))
      .groupBy(clicks.linkId)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(15),
    // Top countries
    db.select({
      value: clicks.country,
      count: sql<number>`COUNT(*)`,
    }).from(clicks)
      .where(and(inArray(clicks.linkId, linkIds), sql`${clicks.timestamp} >= ${since}`, sql`${clicks.country} IS NOT NULL`))
      .groupBy(clicks.country)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(10),
    // Top devices
    db.select({
      value: clicks.deviceType,
      count: sql<number>`COUNT(*)`,
    }).from(clicks)
      .where(and(inArray(clicks.linkId, linkIds), sql`${clicks.timestamp} >= ${since}`, sql`${clicks.deviceType} IS NOT NULL`))
      .groupBy(clicks.deviceType)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(10),
    // Top referrers
    db.select({
      value: clicks.referrer,
      count: sql<number>`COUNT(*)`,
    }).from(clicks)
      .where(and(inArray(clicks.linkId, linkIds), sql`${clicks.timestamp} >= ${since}`, sql`${clicks.referrer} IS NOT NULL AND ${clicks.referrer} != ''`))
      .groupBy(clicks.referrer)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(10),
  ]);

  const totalClicks = totalResult[0]?.count ?? 0;
  const uniqueClicks = uniqueResult[0]?.count ?? 0;

  // Build top links with metadata
  const linkMap = new Map(scopedLinkRows.map(l => [l.id, l]));
  const topLinks = topLinksResult.map(r => {
    const link = linkMap.get(r.linkId);
    return {
      shortCode: link?.shortCode || "unknown",
      destinationUrl: link?.destinationUrl || "",
      title: link?.title || null,
      clicks: r.count,
      uniqueClicks: r.uniqueCount,
    };
  });

  // Find top link
  const topLink = topLinks.length > 0 ? { shortCode: topLinks[0].shortCode, destinationUrl: topLinks[0].destinationUrl, clicks: topLinks[0].clicks } : null;

  // Channel breakdown
  const channelMap = new Map<string, number>();
  for (const linkRow of scopedLinkRows) {
    const linkClicks = topLinksResult.find(r => r.linkId === linkRow.id)?.count || 0;
    if (linkClicks === 0) continue;
    const key = `${linkRow.utmSource || "(direct)"}|${linkRow.utmMedium || "(none)"}`;
    channelMap.set(key, (channelMap.get(key) || 0) + linkClicks);
  }
  const channels = Array.from(channelMap.entries())
    .map(([key, clickCount]) => {
      const [source, medium] = key.split("|");
      return { source, medium, clicks: clickCount, share: totalClicks > 0 ? Math.round((clickCount / totalClicks) * 1000) / 10 : 0 };
    })
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 10);

  return {
    title,
    period: { from: fromDate, to: toDate, days: opts.days },
    generatedAt: new Date().toISOString(),
    summary: { totalClicks, uniqueClicks, linkCount, topLink },
    timeSeries: timeSeriesResult.map(r => ({ day: r.day, clicks: r.count })),
    channels,
    topLinks,
    topCountries: countriesResult.map(r => ({ country: r.value || "Unknown", clicks: r.count })),
    topDevices: devicesResult.map(r => ({ device: r.value || "Unknown", clicks: r.count })),
    topReferrers: referrersResult.map(r => ({ referrer: r.value || "Unknown", clicks: r.count })),
  };
}


// ============ TAG COMPARISON ============

export interface TagComparisonResult {
  tag: string;
  totalClicks: number;
  uniqueClicks: number;
  clicksOverTime: { day: string; count: number }[];
  topCountries: { value: string | null; count: number }[];
  topDevices: { value: string | null; count: number }[];
}

export async function getTagComparison(
  workspaceId: number,
  tags: string[],
  days: number
): Promise<TagComparisonResult[]> {
  const db = await getDb();
  if (!db) return [];

  const since = Date.now() - days * 24 * 60 * 60 * 1000;

  // Get all workspace member user IDs
  const members = await db.select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspaceId));
  const memberIds = members.map(m => m.userId);
  if (memberIds.length === 0) return [];

  // For each tag, get links, then aggregate clicks
  const results: TagComparisonResult[] = [];

  for (const tag of tags) {
    // Get links with this tag belonging to workspace members
    const tagLinks = await db.select({ id: links.id })
      .from(links)
      .where(and(
        inArray(links.userId, memberIds),
        sql`JSON_CONTAINS(${links.tags}, JSON_QUOTE(${tag}))`
      ));
    const linkIds = tagLinks.map(l => l.id);

    if (linkIds.length === 0) {
      results.push({ tag, totalClicks: 0, uniqueClicks: 0, clicksOverTime: [], topCountries: [], topDevices: [] });
      continue;
    }

    const [totalResult, uniqueResult, timeResult, countryResult, deviceResult] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` })
        .from(clicks)
        .where(and(inArray(clicks.linkId, linkIds), sql`${clicks.timestamp} >= ${since}`, eq(clicks.isBot, false))),

      db.select({ count: sql<number>`COUNT(DISTINCT ${clicks.ipHash})` })
        .from(clicks)
        .where(and(inArray(clicks.linkId, linkIds), sql`${clicks.timestamp} >= ${since}`, eq(clicks.isBot, false))),

      db.select({
        day: sql<string>`DATE(FROM_UNIXTIME(${clicks.timestamp} / 1000))`,
        count: sql<number>`COUNT(*)`,
      }).from(clicks)
        .where(and(inArray(clicks.linkId, linkIds), sql`${clicks.timestamp} >= ${since}`, eq(clicks.isBot, false)))
        .groupBy(sql`DATE(FROM_UNIXTIME(${clicks.timestamp} / 1000))`)
        .orderBy(sql`DATE(FROM_UNIXTIME(${clicks.timestamp} / 1000))`),

      db.select({
        value: clicks.country,
        count: sql<number>`COUNT(*)`,
      }).from(clicks)
        .where(and(inArray(clicks.linkId, linkIds), sql`${clicks.timestamp} >= ${since}`, eq(clicks.isBot, false), sql`${clicks.country} IS NOT NULL`))
        .groupBy(clicks.country)
        .orderBy(desc(sql`COUNT(*)`))
        .limit(5),

      db.select({
        value: clicks.deviceType,
        count: sql<number>`COUNT(*)`,
      }).from(clicks)
        .where(and(inArray(clicks.linkId, linkIds), sql`${clicks.timestamp} >= ${since}`, eq(clicks.isBot, false), sql`${clicks.deviceType} IS NOT NULL`))
        .groupBy(clicks.deviceType)
        .orderBy(desc(sql`COUNT(*)`))
        .limit(5),
    ]);

    results.push({
      tag,
      totalClicks: totalResult[0]?.count ?? 0,
      uniqueClicks: uniqueResult[0]?.count ?? 0,
      clicksOverTime: timeResult,
      topCountries: countryResult,
      topDevices: deviceResult,
    });
  }

  return results;
}
