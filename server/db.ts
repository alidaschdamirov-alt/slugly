// Stable database core. Dangerous admin delete helpers are intentionally
// overridden in this facade so legacy admin UI cannot bypass 30-day recovery.
import * as core from "./dbCore";
export * from "./dbCore";

async function filterTrashLinks<T extends { id: number }>(rows: T[]): Promise<T[]> {
  const { isLinkSoftDeleted } = await import("./softDelete");
  const deleted = await Promise.all(rows.map(row => isLinkSoftDeleted(row.id)));
  return rows.filter((_row, index) => !deleted[index]);
}

export async function getLinksByUserId(...args: Parameters<typeof core.getLinksByUserId>) {
  return filterTrashLinks(await core.getLinksByUserId(...args));
}

export async function getUnassignedLinks(...args: Parameters<typeof core.getUnassignedLinks>) {
  return filterTrashLinks(await core.getUnassignedLinks(...args));
}

export async function getLinksByProjectId(...args: Parameters<typeof core.getLinksByProjectId>) {
  return filterTrashLinks(await core.getLinksByProjectId(...args));
}

export async function getLinksByTag(...args: Parameters<typeof core.getLinksByTag>) {
  return filterTrashLinks(await core.getLinksByTag(...args));
}

export async function getClickStats(linkId: number) {
  const [stats, counts] = await Promise.all([
    core.getClickStats(linkId),
    core.getClickCountByLinkIdFiltered(linkId, true),
  ]);
  return { ...stats, uniqueClicks: counts.unique };
}

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
