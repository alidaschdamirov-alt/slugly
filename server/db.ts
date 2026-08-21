// Stable database core. Dangerous admin delete helpers are intentionally
// overridden in this facade so legacy admin UI cannot bypass 30-day recovery.
import * as core from "./dbCore";
export * from "./dbCore";

export async function adminDeleteLink(linkId: number) {
  const { softDeleteLink } = await import("./softDelete");
  await softDeleteLink(linkId);
}

export async function adminDeleteUser(userId: number) {
  const { softDeleteUser } = await import("./softDelete");
  await softDeleteUser(userId);
}

export async function adminCleanupExpiredAnonymous() {
  const { consumeCleanupPreviewGate } = await import("./cleanupPreviewGate");
  const { softDeleteExpiredAnonymous } = await import("./softDelete");
  await consumeCleanupPreviewGate();
  return softDeleteExpiredAnonymous();
}

export async function writeAuditLog(entry: Parameters<typeof core.writeAuditLog>[0]) {
  if (entry.action === "user.delete" || entry.action === "link.delete" || entry.action === "links.cleanup_expired") {
    return;
  }
  return core.writeAuditLog(entry);
}
