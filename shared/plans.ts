/**
 * Plan configuration types shared between client and server.
 */

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

export type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";

export const PLAN_DISPLAY_NAMES: Record<PlanName, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  team: "Team",
};

export const ROLE_DISPLAY_NAMES: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  editor: "Editor",
  viewer: "Viewer",
};

export const PLAN_ORDER: PlanName[] = ["free", "starter", "pro", "team"];

/**
 * Get the next plan above the current one (for upsell).
 * Returns null if already on the highest plan.
 */
export function getNextPlan(current: PlanName): PlanName | null {
  const idx = PLAN_ORDER.indexOf(current);
  if (idx === -1 || idx >= PLAN_ORDER.length - 1) return null;
  return PLAN_ORDER[idx + 1];
}

/**
 * Can a given role perform write operations (create/edit links/projects)?
 */
export function canWrite(role: WorkspaceRole): boolean {
  return role === "owner" || role === "admin" || role === "editor";
}

/**
 * Can a given role manage workspace settings and members?
 */
export function canManage(role: WorkspaceRole): boolean {
  return role === "owner" || role === "admin";
}
