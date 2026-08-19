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