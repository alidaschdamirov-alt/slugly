export type PlatformRole = "user" | "support" | "admin";

const SUPPORT_ALLOWED_MUTATIONS = new Set([
  "admin.updateReport",
  "admin.disableLink",
  "admin.suspendUser",
  "admin.unsuspendUser",
  "admin.banUser",
  "admin.addBlockedDomain",
  "admin.removeBlockedDomain",
  // Preview does not persist or send anything.
  "admin.previewTemplate",
]);

/**
 * All adminProcedure queries are visible to support. Mutations are deny-by-default
 * and only trust/safety operations from the documented matrix are allowed.
 */
export function canAccessAdminProcedure(
  role: PlatformRole,
  path: string,
  type: string | undefined
): boolean {
  if (role === "admin") return true;
  if (role !== "support") return false;
  if (type !== "mutation") return true;
  return SUPPORT_ALLOWED_MUTATIONS.has(path);
}

export function isPrivilegedRole(role: string | null | undefined): role is "support" | "admin" {
  return role === "support" || role === "admin";
}
