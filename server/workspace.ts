/**
 * Workspace helpers: gating, plan config, membership, invitations
 */
import { eq, and, or, desc, sql, inArray, isNull } from "drizzle-orm";
import { getDb } from "./db";
import { workspaces, workspaceMembers, workspaceInvitations, projects, links, domains, users, clicks } from "../drizzle/schema";
import type { Workspace, WorkspaceMember, InsertWorkspace, InsertWorkspaceMember } from "../drizzle/schema";
import { getSiteSetting, setSiteSetting } from "./db";
import { normalizeDestinationUrl } from "../shared/validation/destination-url";

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
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.archived, false), eq(projects.isSystem, false)));
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

export async function adminListWorkspaces(input: { search?: string; plan?: PlanName } = {}) {
  const db = await getDb();
  if (!db) return [];

  const all = await db.select().from(workspaces).orderBy(desc(workspaces.createdAt));
  const search = input.search?.trim().toLowerCase();
  const filtered = all.filter(workspace => {
    if (input.plan && workspace.plan !== input.plan) return false;
    if (search && !workspace.name.toLowerCase().includes(search)) return false;
    return true;
  });

  return Promise.all(
    filtered.map(async workspace => {
      const [memberCount, projectCount, linkCount, domainCount] = await Promise.all([
        countWorkspaceMembers(workspace.id),
        countWorkspaceProjects(workspace.id),
        countWorkspaceLinks(workspace.id),
        countWorkspaceDomains(workspace.id),
      ]);

      return {
        ...workspace,
        memberCount,
        projectCount,
        linkCount,
        domainCount,
      };
    })
  );
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

// ============ CAMPAIGN ANALYTICS + REPORT DATA ============

export interface WorkspaceBranding {
  logoUrl?: string | null;
  brandColor?: string | null;
  companyName?: string | null;
  contactEmail?: string | null;
  website?: string | null;
}

export interface ReportData {
  title: string;
  generatedAt: number;
  period: { from: string; to: string; days: number };
  summary: {
    totalClicks: number;
    uniqueClicks: number;
    linkCount: number;
    topLink: { shortCode: string } | null;
  };
  timeSeries: Array<{ day: string; clicks: number }>;
  channels: Array<{ source: string; medium: string; clicks: number; share: number }>;
  topLinks: Array<{ shortCode: string; destinationUrl: string; clicks: number; uniqueClicks: number }>;
  topCountries: Array<{ country: string; clicks: number }>;
  topDevices: Array<{ device: string; clicks: number }>;
  topReferrers: Array<{ referrer: string; clicks: number }>;
}

type LinkRow = typeof links.$inferSelect;

function isReportActiveLink(link: LinkRow, now = Date.now()) {
  if (normalizeDestinationUrl(link.destinationUrl) === null) return false;
  if (link.status === "paused") return false;
  const activeFrom = link.activeFrom ? new Date(link.activeFrom).getTime() : null;
  const expiresAt = link.expiresAt ? new Date(link.expiresAt).getTime() : null;
  if (expiresAt && expiresAt <= now) return false;
  if (activeFrom && activeFrom > now) return false;
  return true;
}

function periodStart(days: number) {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function fmtDay(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function scopeSql(projectIds: number[], memberIds: number[]) {
  return sql`(${projectIds.length ? sql`${links.projectId} IN (${sql.raw(projectIds.join(","))})` : sql`1 = 0`} OR ${memberIds.length ? sql`${links.userId} IN (${sql.raw(memberIds.join(","))})` : sql`1 = 0`})`;
}

async function getWorkspaceScope(workspaceId: number) {
  const db = await getDb();
  if (!db) return { projectIds: [] as number[], memberIds: [] as number[] };
  const [workspaceProjects, members] = await Promise.all([
    db.select({ id: projects.id }).from(projects).where(eq(projects.workspaceId, workspaceId)),
    db.select({ userId: workspaceMembers.userId }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId)),
  ]);
  return {
    projectIds: workspaceProjects.map(p => p.id),
    memberIds: members.map(m => m.userId),
  };
}

async function getScopedLinks(workspaceId: number, options: { projectId?: number; tag?: string } = {}): Promise<LinkRow[]> {
  const db = await getDb();
  if (!db) return [];
  const scope = await getWorkspaceScope(workspaceId);
  const conditions = [scopeSql(scope.projectIds, scope.memberIds)];
  if (options.projectId) conditions.push(eq(links.projectId, options.projectId));
  if (options.tag) conditions.push(sql`JSON_CONTAINS(${links.tags}, JSON_QUOTE(${options.tag}))`);
  return db.select().from(links).where(and(...conditions)).orderBy(desc(links.createdAt));
}

async function getClickSummary(linkIds: number[], days: number) {
  const db = await getDb();
  if (!db || linkIds.length === 0) {
    return { totalClicks: 0, uniqueClicks: 0, clicksOverTime: [], topCountries: [], topDevices: [] };
  }
  const since = periodStart(days);
  const notBot = eq(clicks.isBot, false);
  const [total, unique, time, countries, devices] = await Promise.all([
    db.select({ count: sql<number>`COUNT(*)` }).from(clicks).where(and(inArray(clicks.linkId, linkIds), sql`${clicks.timestamp} >= ${since}`, notBot)),
    db.select({ count: sql<number>`COUNT(DISTINCT ${clicks.ipHash})` }).from(clicks).where(and(inArray(clicks.linkId, linkIds), sql`${clicks.timestamp} >= ${since}`, notBot)),
    db.select({ day: sql<string>`DATE(FROM_UNIXTIME(${clicks.timestamp} / 1000))`, count: sql<number>`COUNT(*)` })
      .from(clicks)
      .where(and(inArray(clicks.linkId, linkIds), sql`${clicks.timestamp} >= ${since}`, notBot))
      .groupBy(sql`DATE(FROM_UNIXTIME(${clicks.timestamp} / 1000))`)
      .orderBy(sql`DATE(FROM_UNIXTIME(${clicks.timestamp} / 1000))`),
    db.select({ value: clicks.country, count: sql<number>`COUNT(*)` })
      .from(clicks)
      .where(and(inArray(clicks.linkId, linkIds), sql`${clicks.timestamp} >= ${since}`, notBot, sql`${clicks.country} IS NOT NULL`))
      .groupBy(clicks.country)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(10),
    db.select({ value: clicks.deviceType, count: sql<number>`COUNT(*)` })
      .from(clicks)
      .where(and(inArray(clicks.linkId, linkIds), sql`${clicks.timestamp} >= ${since}`, notBot, sql`${clicks.deviceType} IS NOT NULL`))
      .groupBy(clicks.deviceType)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(10),
  ]);
  return {
    totalClicks: total[0]?.count ?? 0,
    uniqueClicks: unique[0]?.count ?? 0,
    clicksOverTime: time,
    topCountries: countries,
    topDevices: devices,
  };
}

export async function getCampaignChannelStats(workspaceId: number, input: { days?: number; projectId?: number; tag?: string } = {}) {
  const days = input.days ?? 30;
  const scopedLinks = await getScopedLinks(workspaceId, { projectId: input.projectId, tag: input.tag });
  const linkIds = scopedLinks.map(l => l.id);
  const db = await getDb();
  if (!db || linkIds.length === 0) return { totalClicks: 0, channels: [] };
  const since = periodStart(days);
  const clickCounts = await db.select({ linkId: clicks.linkId, count: sql<number>`COUNT(*)` })
    .from(clicks)
    .where(and(inArray(clicks.linkId, linkIds), sql`${clicks.timestamp} >= ${since}`, eq(clicks.isBot, false)))
    .groupBy(clicks.linkId);
  const clickCountByLinkId = new Map(clickCounts.map(row => [row.linkId, row.count]));
  const channelMap = new Map<string, { utmSource: string | null; utmMedium: string | null; clicks: number; uniqueLinks: number }>();
  let totalClicks = 0;
  for (const link of scopedLinks) {
    const count = clickCountByLinkId.get(link.id) ?? 0;
    if (count === 0) continue;
    totalClicks += count;
    const key = `${link.utmSource || ""}::${link.utmMedium || ""}`;
    const current = channelMap.get(key) || { utmSource: link.utmSource, utmMedium: link.utmMedium, clicks: 0, uniqueLinks: 0 };
    current.clicks += count;
    current.uniqueLinks += 1;
    channelMap.set(key, current);
  }
  return { totalClicks, channels: Array.from(channelMap.values()).sort((a, b) => b.clicks - a.clicks) };
}

export async function getProjectComparison(workspaceId: number, projectIds: number[], days: number) {
  const db = await getDb();
  if (!db) return [];
  const scopedProjects = await db.select().from(projects).where(and(eq(projects.workspaceId, workspaceId), inArray(projects.id, projectIds)));
  return Promise.all(scopedProjects.map(async project => {
    const projectLinks = await db.select({ id: links.id }).from(links).where(eq(links.projectId, project.id));
    const summary = await getClickSummary(projectLinks.map(l => l.id), days);
    return {
      projectId: project.id,
      projectName: project.name,
      totalClicks: summary.totalClicks,
      uniqueClicks: summary.uniqueClicks,
      clicksOverTime: summary.clicksOverTime,
      topCountries: summary.topCountries,
      topDevices: summary.topDevices,
    };
  }));
}

export async function getTagComparison(workspaceId: number, tags: string[], days: number) {
  return Promise.all(tags.map(async tag => {
    const taggedLinks = await getScopedLinks(workspaceId, { tag });
    const summary = await getClickSummary(taggedLinks.map(l => l.id), days);
    return {
      tag,
      totalClicks: summary.totalClicks,
      uniqueClicks: summary.uniqueClicks,
      clicksOverTime: summary.clicksOverTime,
      topCountries: summary.topCountries,
      topDevices: summary.topDevices,
    };
  }));
}

export async function getWorkspaceBranding(workspaceId: number): Promise<WorkspaceBranding> {
  const raw = await getSiteSetting(`workspace_branding_${workspaceId}`);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as WorkspaceBranding;
  } catch {
    return {};
  }
}

export async function setWorkspaceBranding(workspaceId: number, input: WorkspaceBranding): Promise<void> {
  const current = await getWorkspaceBranding(workspaceId);
  await setSiteSetting(`workspace_branding_${workspaceId}`, JSON.stringify({ ...current, ...input }));
}

export async function generateReportData(workspaceId: number, input: { projectId?: number; tag?: string; days?: number }): Promise<ReportData> {
  const db = await getDb();
  const days = input.days ?? 30;
  const since = periodStart(days);
  const scopedLinks = await getScopedLinks(workspaceId, { projectId: input.projectId, tag: input.tag });
  const activeLinks = scopedLinks.filter(link => isReportActiveLink(link));
  const linkIds = scopedLinks.map(l => l.id);
  const summary = await getClickSummary(linkIds, days);
  const clickCounts = db && linkIds.length > 0
    ? await db.select({ linkId: clicks.linkId, count: sql<number>`COUNT(*)`, unique: sql<number>`COUNT(DISTINCT ${clicks.ipHash})` })
        .from(clicks)
        .where(and(inArray(clicks.linkId, linkIds), sql`${clicks.timestamp} >= ${since}`, eq(clicks.isBot, false)))
        .groupBy(clicks.linkId)
    : [];
  const countByLink = new Map(clickCounts.map(row => [row.linkId, row]));
  const topLinks = scopedLinks
    .map(link => ({
      shortCode: link.shortCode,
      destinationUrl: link.destinationUrl,
      clicks: countByLink.get(link.id)?.count ?? 0,
      uniqueClicks: countByLink.get(link.id)?.unique ?? 0,
    }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 10);
  const channels = (await getCampaignChannelStats(workspaceId, { days, projectId: input.projectId, tag: input.tag })).channels.map(channel => ({
    source: channel.utmSource || "none",
    medium: channel.utmMedium || "none",
    clicks: channel.clicks,
    share: summary.totalClicks > 0 ? Math.round((channel.clicks / summary.totalClicks) * 1000) / 10 : 0,
  }));
  const topReferrers = db && linkIds.length > 0
    ? await db.select({ referrer: clicks.referrer, clicks: sql<number>`COUNT(*)` })
        .from(clicks)
        .where(and(inArray(clicks.linkId, linkIds), sql`${clicks.timestamp} >= ${since}`, eq(clicks.isBot, false), sql`${clicks.referrer} IS NOT NULL AND ${clicks.referrer} != ''`))
        .groupBy(clicks.referrer)
        .orderBy(desc(sql`COUNT(*)`))
        .limit(10)
    : [];
  const from = fmtDay(since);
  const to = fmtDay(Date.now());
  return {
    title: input.projectId ? "Project Performance Report" : input.tag ? `Tag Performance Report: ${input.tag}` : "Workspace Performance Report",
    generatedAt: Date.now(),
    period: { from, to, days },
    summary: {
      totalClicks: summary.totalClicks,
      uniqueClicks: summary.uniqueClicks,
      linkCount: activeLinks.length,
      topLink: topLinks[0] ? { shortCode: topLinks[0].shortCode } : null,
    },
    timeSeries: summary.clicksOverTime.map(row => ({ day: row.day, clicks: row.count })),
    channels,
    topLinks,
    topCountries: summary.topCountries.map(row => ({ country: row.value || "Unknown", clicks: row.count })),
    topDevices: summary.topDevices.map(row => ({ device: row.value || "Unknown", clicks: row.count })),
    topReferrers: topReferrers.map(row => ({ referrer: row.referrer || "Direct", clicks: row.clicks })),
  };
}
