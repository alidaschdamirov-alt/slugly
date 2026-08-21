import { randomUUID } from "crypto";
import type { Request } from "express";
import { and, eq, inArray, like, lte } from "drizzle-orm";
import { clicks, domains, links, projects, retiredCodes, siteSettings, users, workspaceMembers } from "../drizzle/schema";
import { AUDIT_EVENTS } from "../shared/audit-events";
import { getAuditRequestContext, writeAuditEvent } from "./audit";
import { getDb, getSiteSetting, setSiteSetting } from "./db";
import { isProtectedAdminEmail } from "./_core/env";

export const SOFT_DELETE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const PREVIEW_TTL_MS = 5 * 60 * 1000;
const SOFT_PREFIX = "soft_delete_v1_";
const CLEANUP_PREVIEW_PREFIX = "cleanup_expired_preview_v1_";

type TrashType = "user" | "link";

export interface SoftDeleteRecord {
  type: TrashType;
  id: number;
  name: string;
  deletedAt: number;
  purgeAfter: number;
  previousSuspended?: boolean;
  previousStatus?: "active" | "paused";
  shortCode?: string;
  userId?: number;
}

export interface CleanupPreview {
  token: string;
  actorId: number;
  createdAt: number;
  expiresAt: number;
  count: number;
  linkIds: number[];
  items: Array<{ id: number; shortCode: string; destinationUrl: string; expiresAt: number | null }>;
}

const stateCache = new Map<string, { value: SoftDeleteRecord | null; expiresAt: number }>();
const CACHE_MS = 15_000;

function stateKey(type: TrashType, id: number) {
  return `${SOFT_PREFIX}${type}_${id}`;
}

function previewKey(token: string) {
  return `${CLEANUP_PREVIEW_PREFIX}${token}`;
}

function parseState(raw: string | null): SoftDeleteRecord | null {
  if (!raw || raw === "null") return null;
  try {
    const parsed = JSON.parse(raw) as SoftDeleteRecord;
    return parsed && (parsed.type === "user" || parsed.type === "link") && Number.isInteger(parsed.id) ? parsed : null;
  } catch {
    return null;
  }
}

export async function getSoftDeleteRecord(type: TrashType, id: number): Promise<SoftDeleteRecord | null> {
  const key = stateKey(type, id);
  const cached = stateCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = parseState(await getSiteSetting(key));
  stateCache.set(key, { value, expiresAt: Date.now() + CACHE_MS });
  return value;
}

function cacheState(record: SoftDeleteRecord | null, type: TrashType, id: number) {
  stateCache.set(stateKey(type, id), { value: record, expiresAt: Date.now() + CACHE_MS });
}

export async function isLinkSoftDeleted(linkId: number) {
  return !!(await getSoftDeleteRecord("link", linkId));
}

export async function isUserSoftDeleted(userId: number) {
  return !!(await getSoftDeleteRecord("user", userId));
}

export async function softDeleteLink(linkId: number): Promise<SoftDeleteRecord> {
  const database = await getDb();
  if (!database) throw new Error("Database unavailable");
  const [link] = await database.select().from(links).where(eq(links.id, linkId)).limit(1);
  if (!link) throw new Error("Link not found");
  const existing = await getSoftDeleteRecord("link", linkId);
  if (existing) return existing;

  const now = Date.now();
  const record: SoftDeleteRecord = {
    type: "link",
    id: link.id,
    name: link.shortCode,
    shortCode: link.shortCode,
    userId: link.userId,
    previousStatus: link.status,
    deletedAt: now,
    purgeAfter: now + SOFT_DELETE_WINDOW_MS,
  };
  await setSiteSetting(stateKey("link", link.id), JSON.stringify(record));
  await database.update(links).set({ status: "paused" }).where(eq(links.id, link.id));
  cacheState(record, "link", link.id);
  const { invalidateLinkCache } = await import("./redirect");
  invalidateLinkCache(link.shortCode);
  return record;
}

export async function softDeleteUser(userId: number): Promise<SoftDeleteRecord> {
  const database = await getDb();
  if (!database) throw new Error("Database unavailable");
  const [user] = await database.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("User not found");
  if (isProtectedAdminEmail(user.email)) throw new Error("Protected administrator cannot be deleted");
  const existing = await getSoftDeleteRecord("user", userId);
  if (existing) return existing;

  const now = Date.now();
  const record: SoftDeleteRecord = {
    type: "user",
    id: user.id,
    name: user.email || user.name || `user-${user.id}`,
    previousSuspended: user.suspended,
    deletedAt: now,
    purgeAfter: now + SOFT_DELETE_WINDOW_MS,
  };
  await setSiteSetting(stateKey("user", user.id), JSON.stringify(record));
  await database.update(users).set({ suspended: true }).where(eq(users.id, user.id));
  cacheState(record, "user", user.id);
  return record;
}

export async function previewExpiredAnonymous(): Promise<Array<{ id: number; shortCode: string; destinationUrl: string; expiresAt: number | null }>> {
  const database = await getDb();
  if (!database) throw new Error("Database unavailable");
  const rows = await database
    .select({ id: links.id, shortCode: links.shortCode, destinationUrl: links.destinationUrl, expiresAt: links.expiresAt })
    .from(links)
    .where(and(eq(links.userId, 0), lte(links.expiresAt, Date.now())));
  const result = [] as typeof rows;
  for (const row of rows) {
    if (!(await isLinkSoftDeleted(row.id))) result.push(row);
  }
  return result;
}

export async function softDeleteExpiredAnonymous(): Promise<number> {
  const items = await previewExpiredAnonymous();
  for (const item of items) await softDeleteLink(item.id);
  return items.length;
}

export async function createCleanupPreview(actorId: number, req: Request): Promise<CleanupPreview> {
  const items = await previewExpiredAnonymous();
  const now = Date.now();
  const preview: CleanupPreview = {
    token: randomUUID(),
    actorId,
    createdAt: now,
    expiresAt: now + PREVIEW_TTL_MS,
    count: items.length,
    linkIds: items.map(item => item.id),
    items: items.slice(0, 200),
  };
  await setSiteSetting(previewKey(preview.token), JSON.stringify(preview));
  await writeAuditEvent({
    event: AUDIT_EVENTS.LINK_BULK_CLEANUP_PREVIEW,
    actorId,
    actorName: "admin",
    targetType: "system",
    targetId: "expired-anonymous-links",
    payload: { count: preview.count, previewToken: preview.token.slice(0, 8) },
    ...getAuditRequestContext(req),
  });
  return preview;
}

export async function consumeCleanupPreview(token: string | undefined, actorId: number): Promise<CleanupPreview> {
  if (!token) throw new Error("Cleanup preview is required before execution.");
  const raw = await getSiteSetting(previewKey(token));
  if (!raw || raw === "null") throw new Error("Cleanup preview is missing or already used.");
  let preview: CleanupPreview;
  try { preview = JSON.parse(raw) as CleanupPreview; } catch { throw new Error("Cleanup preview is invalid."); }
  if (preview.actorId !== actorId) throw new Error("Cleanup preview belongs to another administrator.");
  if (Date.now() > preview.expiresAt) {
    await setSiteSetting(previewKey(token), "null");
    throw new Error("Cleanup preview expired. Refresh the preview and try again.");
  }

  const current = await previewExpiredAnonymous();
  const currentIds = current.map(item => item.id).sort((a, b) => a - b);
  const previewIds = [...preview.linkIds].sort((a, b) => a - b);
  if (currentIds.length !== previewIds.length || currentIds.some((id, index) => id !== previewIds[index])) {
    await setSiteSetting(previewKey(token), "null");
    throw new Error("Expired-link set changed after preview. Refresh the preview before cleanup.");
  }
  await setSiteSetting(previewKey(token), "null");
  return preview;
}

export async function listTrash(): Promise<SoftDeleteRecord[]> {
  const database = await getDb();
  if (!database) throw new Error("Database unavailable");
  const rows = await database
    .select({ key: siteSettings.key, value: siteSettings.value })
    .from(siteSettings)
    .where(like(siteSettings.key, `${SOFT_PREFIX}%`));
  return rows
    .map(row => parseState(row.value))
    .filter((value): value is SoftDeleteRecord => !!value)
    .sort((a, b) => b.deletedAt - a.deletedAt);
}

export async function restoreFromTrash(input: { type: TrashType; id: number; actorId: number; actorName: string; req: Request }) {
  const record = await getSoftDeleteRecord(input.type, input.id);
  if (!record) throw new Error("Trash item not found");
  if (Date.now() > record.purgeAfter) throw new Error("The 30-day recovery window has expired.");
  const database = await getDb();
  if (!database) throw new Error("Database unavailable");

  if (record.type === "link") {
    await database.update(links).set({ status: record.previousStatus || "active" }).where(eq(links.id, record.id));
    if (record.shortCode) {
      const { invalidateLinkCache } = await import("./redirect");
      invalidateLinkCache(record.shortCode);
    }
  } else {
    await database.update(users).set({ suspended: record.previousSuspended ?? false }).where(eq(users.id, record.id));
  }

  await setSiteSetting(stateKey(record.type, record.id), "null");
  cacheState(null, record.type, record.id);
  await writeAuditEvent({
    event: record.type === "link" ? AUDIT_EVENTS.LINK_RESTORE : AUDIT_EVENTS.USER_RESTORE,
    actorId: input.actorId,
    actorName: input.actorName,
    targetType: record.type,
    targetId: record.id,
    payload: { deletedAt: record.deletedAt, restoredWithinDays: Math.round((Date.now() - record.deletedAt) / 86400000) },
    ...getAuditRequestContext(input.req),
  });
  return record;
}

async function hardPurgeLink(record: SoftDeleteRecord) {
  const database = await getDb();
  if (!database) throw new Error("Database unavailable");
  const [link] = await database.select({ id: links.id, shortCode: links.shortCode }).from(links).where(eq(links.id, record.id)).limit(1);
  if (link) {
    await database.insert(retiredCodes).values({ shortCode: link.shortCode }).onDuplicateKeyUpdate({ set: { shortCode: link.shortCode } });
    await database.delete(clicks).where(eq(clicks.linkId, link.id));
    await database.delete(links).where(eq(links.id, link.id));
    const { invalidateLinkCache } = await import("./redirect");
    invalidateLinkCache(link.shortCode);
  }
}

async function hardPurgeUser(record: SoftDeleteRecord) {
  const database = await getDb();
  if (!database) throw new Error("Database unavailable");
  const [user] = await database.select().from(users).where(eq(users.id, record.id)).limit(1);
  if (!user) return;
  if (isProtectedAdminEmail(user.email)) throw new Error("Protected administrator cannot be purged");
  const userLinks = await database.select({ id: links.id, shortCode: links.shortCode }).from(links).where(eq(links.userId, user.id));
  const linkIds = userLinks.map(link => link.id);
  if (linkIds.length > 0) {
    await database.delete(clicks).where(inArray(clicks.linkId, linkIds));
    for (const link of userLinks) {
      await database.insert(retiredCodes).values({ shortCode: link.shortCode }).onDuplicateKeyUpdate({ set: { shortCode: link.shortCode } });
    }
    await database.delete(links).where(inArray(links.id, linkIds));
  }
  await database.delete(domains).where(eq(domains.userId, user.id));
  await database.delete(projects).where(eq(projects.userId, user.id));
  await database.delete(workspaceMembers).where(eq(workspaceMembers.userId, user.id));
  await database.delete(users).where(eq(users.id, user.id));
}

export async function purgeFromTrash(input: {
  type: TrashType;
  id: number;
  confirmation: string;
  reason: string;
  actorId: number;
  actorName: string;
  req: Request;
}) {
  const record = await getSoftDeleteRecord(input.type, input.id);
  if (!record) throw new Error("Trash item not found");
  if (Date.now() < record.purgeAfter) throw new Error("Permanent purge is blocked until the 30-day recovery window expires.");
  if (input.confirmation.trim() !== record.name) throw new Error(`Type exactly “${record.name}” to permanently purge this item.`);
  if (input.reason.trim().length < 3) throw new Error("A purge reason is required.");

  if (record.type === "link") await hardPurgeLink(record);
  else await hardPurgeUser(record);

  await setSiteSetting(stateKey(record.type, record.id), "null");
  cacheState(null, record.type, record.id);
  await writeAuditEvent({
    event: record.type === "link" ? AUDIT_EVENTS.LINK_PURGE : AUDIT_EVENTS.USER_PURGE,
    actorId: input.actorId,
    actorName: input.actorName,
    targetType: record.type,
    targetId: record.id,
    reason: input.reason,
    payload: { deletedAt: record.deletedAt, purgeAfter: record.purgeAfter, confirmationMatched: true },
    ...getAuditRequestContext(input.req),
  });
  return record;
}
