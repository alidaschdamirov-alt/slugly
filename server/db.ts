// Stable database core. Dangerous admin delete helpers are intentionally
// overridden in this facade so legacy admin UI cannot bypass 30-day recovery.
import { desc, inArray } from "drizzle-orm";
import { links } from "../drizzle/schema";
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

type ProjectLinks = Awaited<ReturnType<typeof core.getLinksByProjectId>>;
type ProjectLinksWaiter = { resolve: (value: ProjectLinks) => void; reject: (reason?: unknown) => void };
const projectLinksQueue = new Map<number, ProjectLinksWaiter[]>();
let projectLinksScheduled = false;

function scheduleProjectLinksFlush() {
  if (projectLinksScheduled) return;
  projectLinksScheduled = true;
  queueMicrotask(async () => {
    projectLinksScheduled = false;
    const batch = new Map(projectLinksQueue);
    projectLinksQueue.clear();
    const projectIds = Array.from(batch.keys());
    try {
      const database = await core.getDb();
      if (!database || projectIds.length === 0) {
        for (const waiters of Array.from(batch.values())) {
          waiters.forEach((waiter: ProjectLinksWaiter) => waiter.resolve([]));
        }
        return;
      }
      const rows = await database
        .select()
        .from(links)
        .where(inArray(links.projectId, projectIds))
        .orderBy(desc(links.createdAt));
      const visibleRows = await filterTrashLinks(rows);
      const grouped = new Map<number, ProjectLinks>();
      for (const row of visibleRows) {
        if (row.projectId == null) continue;
        const list = grouped.get(row.projectId) || [];
        list.push(row);
        grouped.set(row.projectId, list);
      }
      for (const [projectId, waiters] of Array.from(batch.entries())) {
        const value = grouped.get(projectId) || [];
        waiters.forEach((waiter: ProjectLinksWaiter) => waiter.resolve(value));
      }
    } catch (error) {
      for (const waiters of Array.from(batch.values())) {
        waiters.forEach((waiter: ProjectLinksWaiter) => waiter.reject(error));
      }
    }
  });
}

export function getLinksByProjectId(projectId: number): Promise<ProjectLinks> {
  return new Promise((resolve, reject) => {
    const waiters = projectLinksQueue.get(projectId) || [];
    waiters.push({ resolve, reject });
    projectLinksQueue.set(projectId, waiters);
    scheduleProjectLinksFlush();
  });
}

export async function getLinksByTag(...args: Parameters<typeof core.getLinksByTag>) {
  return filterTrashLinks(await core.getLinksByTag(...args));
}

type ClickCountMap = Awaited<ReturnType<typeof core.getClickCountsByLinkIds>>;
type ClickCountRequest = { ids: number[]; resolve: (value: ClickCountMap) => void; reject: (reason?: unknown) => void };
let clickCountQueue: ClickCountRequest[] = [];
let clickCountScheduled = false;

function scheduleClickCountFlush() {
  if (clickCountScheduled) return;
  clickCountScheduled = true;
  queueMicrotask(async () => {
    clickCountScheduled = false;
    const batch = clickCountQueue;
    clickCountQueue = [];
    const union = Array.from(new Set<number>(batch.flatMap(request => request.ids)));
    try {
      const counts = union.length > 0 ? await core.getClickCountsByLinkIds(union) : {};
      for (const request of batch) {
        const subset: ClickCountMap = {};
        for (const id of request.ids) if (counts[id] !== undefined) subset[id] = counts[id];
        request.resolve(subset);
      }
    } catch (error) {
      batch.forEach(request => request.reject(error));
    }
  });
}

export function getClickCountsByLinkIds(linkIds: number[]): Promise<ClickCountMap> {
  return new Promise((resolve, reject) => {
    clickCountQueue.push({ ids: [...linkIds], resolve, reject });
    scheduleClickCountFlush();
  });
}

type ProjectSparkline = Awaited<ReturnType<typeof core.getProjectSparkline>>;
type SparklineRequest = { ids: number[]; days: number; resolve: (value: ProjectSparkline) => void; reject: (reason?: unknown) => void };
let sparklineQueue: SparklineRequest[] = [];
let sparklineScheduled = false;

function scheduleSparklineFlush() {
  if (sparklineScheduled) return;
  sparklineScheduled = true;
  queueMicrotask(async () => {
    sparklineScheduled = false;
    const batch = sparklineQueue;
    sparklineQueue = [];
    const groups = new Map<number, SparklineRequest[]>();
    for (const request of batch) {
      const group = groups.get(request.days) || [];
      group.push(request);
      groups.set(request.days, group);
    }

    await Promise.all(Array.from(groups.entries()).map(async ([days, requests]: [number, SparklineRequest[]]) => {
      try {
        const union = Array.from(new Set<number>(requests.flatMap((request: SparklineRequest) => request.ids)));
        const perLink = union.length > 0 ? await core.getClicksOverTimeForLinks(union, days) : {};
        for (const request of requests) {
          const totals = new Map<string, number>();
          for (const id of request.ids) {
            for (const point of perLink[id] || []) {
              totals.set(point.day, (totals.get(point.day) || 0) + Number(point.count || 0));
            }
          }
          request.resolve(
            Array.from(totals.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([day, count]) => ({ day, count }))
          );
        }
      } catch (error) {
        requests.forEach((request: SparklineRequest) => request.reject(error));
      }
    }));
  });
}

export function getProjectSparkline(linkIds: number[], days = 7): Promise<ProjectSparkline> {
  return new Promise((resolve, reject) => {
    sparklineQueue.push({ ids: [...linkIds], days, resolve, reject });
    scheduleSparklineFlush();
  });
}

export async function getClickStats(linkId: number) {
  const [stats, counts] = await Promise.all([
    core.getClickStats(linkId),
    core.getClickCountByLinkIdFiltered(linkId, true),
  ]);
  return { ...stats, uniqueClicks: counts.unique };
}

// User-facing deletion follows the same 30-day Trash contract as admin deletion.
// Permanent removal remains an internal purge/cascade concern in dbCore/softDelete.
export async function deleteLink(linkId: number) {
  const { softDeleteLink } = await import("./softDelete");
  await softDeleteLink(linkId);
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
