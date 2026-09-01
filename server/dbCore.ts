import {
  eq,
  and,
  desc,
  sql,
  inArray,
  like,
  or,
  gte,
  lte,
  isNull,
  count,
  asc,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  projects,
  links,
  clicks,
  domains,
  retiredCodes,
  reports,
  blockedDomains,
  siteSettings,
  auditLog,
  workspaces,
  workspaceMembers,
  rateLimits,
  notifications,
  notificationRecipients,
  deepLinkEvents,
  productQrs,
} from "../drizzle/schema";
import type {
  InsertProject,
  InsertLink,
  InsertClick,
  InsertReport,
  InsertAuditLogEntry,
  InsertNotification,
  InsertNotificationRecipient,
  InsertDeepLinkEvent,
  InsertProductQr,
} from "../drizzle/schema";
import { ENV, isProtectedAdminEmail } from "./_core/env";
import { getDatabaseUrl } from "./_core/databaseUrl";
import { getLinkStatus } from "../shared/link-status";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  const databaseUrl = getDatabaseUrl();
  if (!_db && databaseUrl) {
    try {
      _db = drizzle(databaseUrl);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============ USER HELPERS ============

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.clerkAdminUserId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

async function assertUserIsNotProtectedAdmin(database: Awaited<ReturnType<typeof getDb>>, userId: number, action: string) {
  if (!database) return;
  const [target] = await database.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (isProtectedAdminEmail(target?.email)) throw new Error(`Protected administrator cannot be ${action}`);
}

export async function updateUserPlan(userId: number, plan: "free" | "pro", stripeCustomerId?: string, stripeSubscriptionId?: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ plan, stripeCustomerId: stripeCustomerId ?? null, stripeSubscriptionId: stripeSubscriptionId ?? null }).where(eq(users.id, userId));
}

// ============ PROJECT HELPERS ============

export async function createProject(data: InsertProject) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(projects).values(data);
  return { id: result[0].insertId };
}

export async function getProjectsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.createdAt));
}

export async function getProjectById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateProject(id: number, data: Partial<Pick<InsertProject, "name" | "description" | "color">>) {
  const db = await getDb();
  if (!db) return;
  await db.update(projects).set(data).where(eq(projects.id, id));
}

export async function deleteProject(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(projects).where(eq(projects.id, id));
}

export async function deleteProjectCascade(id: number) {
  const db = await getDb();
  if (!db) return;
  const projectLinks = await db.select({ id: links.id, shortCode: links.shortCode }).from(links).where(eq(links.projectId, id));
  const linkIds = projectLinks.map(l => l.id);
  if (linkIds.length > 0) {
    await db.delete(clicks).where(inArray(clicks.linkId, linkIds));
    await db.delete(links).where(inArray(links.id, linkIds));
    for (const pl of projectLinks) {
      await db.insert(retiredCodes).values({ shortCode: pl.shortCode }).onDuplicateKeyUpdate({ set: { shortCode: pl.shortCode } });
    }
  }
  await db.delete(projects).where(eq(projects.id, id));
}

export async function ensureSystemProject(workspaceId: number, userId: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.workspaceId, workspaceId), eq(projects.isSystem, true))).limit(1);
  if (existing.length > 0) return existing[0].id;
  const result = await db.insert(projects).values({ userId, workspaceId, name: "Other Links", description: "Links not assigned to any project", color: "#6B7280", isSystem: true });
  return result[0].insertId;
}

export async function moveProjectLinks(projectId: number, targetProjectId: number | null) {
  const db = await getDb();
  if (!db) return;
  await db.update(links).set({ projectId: targetProjectId }).where(eq(links.projectId, projectId));
}

// ============ LINK HELPERS ============

export async function createLink(data: InsertLink) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(links).values(data);
  return { id: result[0].insertId };
}

export async function createLinks(data: InsertLink[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (data.length === 0) return [];
  await db.insert(links).values(data);
  const codes = data.map(d => d.shortCode);
  return db.select().from(links).where(inArray(links.shortCode, codes));
}

export async function getLinkByShortCode(shortCode: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(links).where(eq(links.shortCode, shortCode)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getLinkById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(links).where(eq(links.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getLinksByUserId(userId: number, filters?: {
  projectId?: number;
  search?: string;
  tags?: string[];
  status?: "active" | "paused";
  startDate?: number;
  endDate?: number;
  sortBy?: "clicks" | "createdAt";
  sortOrder?: "asc" | "desc";
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(links.userId, userId)];
  if (filters?.projectId) conditions.push(eq(links.projectId, filters.projectId));
  if (filters?.status) conditions.push(eq(links.status, filters.status));
  if (filters?.search) {
    const searchTerm = `%${filters.search}%`;
    conditions.push(or(like(links.shortCode, searchTerm), like(links.destinationUrl, searchTerm), like(links.title, searchTerm))!);
  }
  return db.select().from(links).where(and(...conditions)).orderBy(desc(links.createdAt));
}

export async function getUnassignedLinks(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(links).where(and(eq(links.userId, userId), isNull(links.projectId))).orderBy(desc(links.createdAt));
}

export async function getLinksByProjectId(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(links).where(eq(links.projectId, projectId)).orderBy(desc(links.createdAt));
}

export async function getLinksByTag(userId: number, tag: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(links).where(and(eq(links.userId, userId), sql`JSON_CONTAINS(${links.tags}, JSON_QUOTE(${tag}))`)).orderBy(desc(links.createdAt));
}

export async function updateLink(id: number, data: Partial<InsertLink>) {
  const db = await getDb();
  if (!db) return;
  await db.update(links).set(data).where(eq(links.id, id));
}

export async function deleteLink(id: number) {
  const db = await getDb();
  if (!db) return;
  const link = await db.select({ shortCode: links.shortCode }).from(links).where(eq(links.id, id)).limit(1);
  await db.delete(clicks).where(eq(clicks.linkId, id));
  await db.delete(links).where(eq(links.id, id));
  if (link[0]?.shortCode) {
    await db.insert(retiredCodes).values({ shortCode: link[0].shortCode }).onDuplicateKeyUpdate({ set: { shortCode: link[0].shortCode } });
  }
}

export async function isShortCodeRetired(shortCode: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db.select({ id: retiredCodes.id }).from(retiredCodes).where(eq(retiredCodes.shortCode, shortCode)).limit(1);
  return result.length > 0;
}

export async function countLinksByUserId(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`COUNT(*)` }).from(links).where(eq(links.userId, userId));
  return result[0]?.count ?? 0;
}

export async function countProjectsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`COUNT(*)` }).from(projects).where(eq(projects.userId, userId));
  return result[0]?.count ?? 0;
}

export async function getAllTagsByUserId(userId: number): Promise<Array<{ tag: string; linkCount: number }>> {
  const db = await getDb();
  if (!db) return [];
  const userLinks = await db.select({ id: links.id, tags: links.tags }).from(links).where(eq(links.userId, userId));
  const tagMap: Record<string, number> = {};
  for (const link of userLinks) {
    if (link.tags && Array.isArray(link.tags)) {
      for (const tag of link.tags) tagMap[tag] = (tagMap[tag] || 0) + 1;
    }
  }
  return Object.entries(tagMap).map(([tag, linkCount]) => ({ tag, linkCount })).sort((a, b) => b.linkCount - a.linkCount);
}

export async function getTagClickStats(userId: number, tag: string, days: number = 30) {
  const db = await getDb();
  if (!db) return { totalClicks: 0, clicksOverTime: [], topLinks: [], countries: [], devices: [], referrers: [] };
  const tagLinks = await db.select({ id: links.id }).from(links).where(and(eq(links.userId, userId), sql`JSON_CONTAINS(${links.tags}, JSON_QUOTE(${tag}))`));
  const linkIds = tagLinks.map(l => l.id);
  if (linkIds.length === 0) return { totalClicks: 0, clicksOverTime: [], topLinks: [], countries: [], devices: [], referrers: [] };
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const [totalResult, timeResult, topLinksResult, countriesResult, devicesResult, referrersResult] = await Promise.all([
    db.select({ count: sql<number>`COUNT(*)` }).from(clicks).where(inArray(clicks.linkId, linkIds)),
    db.select({ day: sql<string>`DATE(FROM_UNIXTIME(timestamp / 1000))`, count: sql<number>`COUNT(*)` }).from(clicks).where(and(inArray(clicks.linkId, linkIds), gte(clicks.timestamp, since))).groupBy(sql`DATE(FROM_UNIXTIME(timestamp / 1000))`).orderBy(sql`DATE(FROM_UNIXTIME(timestamp / 1000))`),
    db.select({ linkId: clicks.linkId, count: sql<number>`COUNT(*)` }).from(clicks).where(inArray(clicks.linkId, linkIds)).groupBy(clicks.linkId).orderBy(desc(sql`COUNT(*)`)).limit(10),
    db.select({ value: clicks.country, count: sql<number>`COUNT(*)` }).from(clicks).where(and(inArray(clicks.linkId, linkIds), sql`${clicks.country} IS NOT NULL`)).groupBy(clicks.country).orderBy(desc(sql`COUNT(*)`)).limit(10),
    db.select({ value: clicks.deviceType, count: sql<number>`COUNT(*)` }).from(clicks).where(and(inArray(clicks.linkId, linkIds), sql`${clicks.deviceType} IS NOT NULL`)).groupBy(clicks.deviceType).orderBy(desc(sql`COUNT(*)`)).limit(10),
    db.select({ value: clicks.referrer, count: sql<number>`COUNT(*)` }).from(clicks).where(and(inArray(clicks.linkId, linkIds), sql`${clicks.referrer} IS NOT NULL AND ${clicks.referrer} != ''`)).groupBy(clicks.referrer).orderBy(desc(sql`COUNT(*)`)).limit(10),
  ]);
  return { totalClicks: totalResult[0]?.count ?? 0, clicksOverTime: timeResult, topLinks: topLinksResult, countries: countriesResult, devices: devicesResult, referrers: referrersResult };
}

// ============ CLICK HELPERS ============

export async function recordClick(data: InsertClick) {
  const db = await getDb();
  if (!db) return;
  await db.insert(clicks).values(data);
}

export async function getClicksByLinkId(linkId: number, limit = 1000) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(clicks).where(eq(clicks.linkId, linkId)).orderBy(desc(clicks.timestamp)).limit(limit);
}

export async function getClickCountByLinkId(linkId: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ count: sql<number>`COUNT(*)` }).from(clicks).where(eq(clicks.linkId, linkId));
  return result[0]?.count ?? 0;
}

export async function getClickCountsByLinkIds(linkIds: number[]) {
  const db = await getDb();
  if (!db || linkIds.length === 0) return {};
  const result = await db.select({ linkId: clicks.linkId, count: sql<number>`COUNT(*)` }).from(clicks).where(inArray(clicks.linkId, linkIds)).groupBy(clicks.linkId);
  const map: Record<number, number> = {};
  for (const row of result) map[row.linkId] = row.count;
  return map;
}

export async function getClicksOverTime(linkId: number, days: number = 30) {
  const db = await getDb();
  if (!db) return [];
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  return db.select({ day: sql<string>`DATE(FROM_UNIXTIME(timestamp / 1000))`, count: sql<number>`COUNT(*)` }).from(clicks).where(and(eq(clicks.linkId, linkId), gte(clicks.timestamp, since))).groupBy(sql`DATE(FROM_UNIXTIME(timestamp / 1000))`).orderBy(sql`DATE(FROM_UNIXTIME(timestamp / 1000))`);
}

export async function getClicksOverTimeForLinks(linkIds: number[], days: number = 7) {
  const db = await getDb();
  if (!db || linkIds.length === 0) return {};
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const result = await db.select({ linkId: clicks.linkId, day: sql<string>`DATE(FROM_UNIXTIME(timestamp / 1000))`, count: sql<number>`COUNT(*)` }).from(clicks).where(and(inArray(clicks.linkId, linkIds), gte(clicks.timestamp, since))).groupBy(clicks.linkId, sql`DATE(FROM_UNIXTIME(timestamp / 1000))`).orderBy(sql`DATE(FROM_UNIXTIME(timestamp / 1000))`);
  const map: Record<number, Array<{ day: string; count: number }>> = {};
  for (const row of result) {
    if (!map[row.linkId]) map[row.linkId] = [];
    map[row.linkId].push({ day: row.day, count: row.count });
  }
  return map;
}

export async function getProjectSparkline(linkIds: number[], days: number = 7): Promise<Array<{ day: string; count: number }>> {
  const db = await getDb();
  if (!db || linkIds.length === 0) return [];
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  return db.select({ day: sql<string>`DATE(FROM_UNIXTIME(timestamp / 1000))`, count: sql<number>`COUNT(*)` }).from(clicks).where(and(inArray(clicks.linkId, linkIds), gte(clicks.timestamp, since))).groupBy(sql`DATE(FROM_UNIXTIME(timestamp / 1000))`).orderBy(sql`DATE(FROM_UNIXTIME(timestamp / 1000))`);
}

export async function getClickStats(linkId: number) {
  const db = await getDb();
  if (!db) return { countries: [], devices: [], browsers: [], referrers: [] };
  const [countriesResult, devicesResult, browsersResult, referrersResult] = await Promise.all([
    db.select({ value: clicks.country, count: sql<number>`COUNT(*)` }).from(clicks).where(and(eq(clicks.linkId, linkId), sql`${clicks.country} IS NOT NULL`)).groupBy(clicks.country).orderBy(desc(sql`COUNT(*)`)).limit(10),
    db.select({ value: clicks.deviceType, count: sql<number>`COUNT(*)` }).from(clicks).where(and(eq(clicks.linkId, linkId), sql`${clicks.deviceType} IS NOT NULL`)).groupBy(clicks.deviceType).orderBy(desc(sql`COUNT(*)`)).limit(10),
    db.select({ value: clicks.browser, count: sql<number>`COUNT(*)` }).from(clicks).where(and(eq(clicks.linkId, linkId), sql`${clicks.browser} IS NOT NULL`)).groupBy(clicks.browser).orderBy(desc(sql`COUNT(*)`)).limit(10),
    db.select({ value: clicks.referrer, count: sql<number>`COUNT(*)` }).from(clicks).where(and(eq(clicks.linkId, linkId), sql`${clicks.referrer} IS NOT NULL AND ${clicks.referrer} != ''`)).groupBy(clicks.referrer).orderBy(desc(sql`COUNT(*)`)).limit(10),
  ]);
  return { countries: countriesResult, devices: devicesResult, browsers: browsersResult, referrers: referrersResult };
}

export async function recordDeepLinkEvent(data: InsertDeepLinkEvent) {
  const db = await getDb();
  if (!db) return;

  const existing = await db
    .select({ id: deepLinkEvents.id })
    .from(deepLinkEvents)
    .where(and(
      eq(deepLinkEvents.linkId, data.linkId),
      eq(deepLinkEvents.sessionId, data.sessionId),
      eq(deepLinkEvents.eventType, data.eventType)
    ))
    .limit(1);

  if (existing.length > 0) return;
  await db.insert(deepLinkEvents).values(data);
}

export async function getDeepLinkEventStats(linkId: number, days: number = 30) {
  const db = await getDb();
  if (!db) {
    return {
      attempts: 0,
      appOpens: 0,
      storeFallbacks: 0,
      webFallbacks: 0,
      iosEvents: 0,
      androidEvents: 0,
    };
  }

  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const baseFilter = and(
    eq(deepLinkEvents.linkId, linkId),
    gte(deepLinkEvents.timestamp, since)
  );

  const [events, platforms] = await Promise.all([
    db
      .select({
        value: deepLinkEvents.eventType,
        count: sql<number>`COUNT(*)`,
      })
      .from(deepLinkEvents)
      .where(baseFilter)
      .groupBy(deepLinkEvents.eventType),
    db
      .select({
        value: deepLinkEvents.platform,
        count: sql<number>`COUNT(*)`,
      })
      .from(deepLinkEvents)
      .where(baseFilter)
      .groupBy(deepLinkEvents.platform),
  ]);

  const byEvent = Object.fromEntries(events.map(row => [row.value, Number(row.count || 0)]));
  const byPlatform = Object.fromEntries(platforms.map(row => [row.value, Number(row.count || 0)]));

  return {
    attempts: byEvent.attempt || 0,
    appOpens: byEvent.app_open || 0,
    storeFallbacks: byEvent.store_fallback || 0,
    webFallbacks: byEvent.web_fallback || 0,
    iosEvents: byPlatform.ios || 0,
    androidEvents: byPlatform.android || 0,
  };
}

export async function getRoutingClickStats(linkId: number, days: number = 30) {
  const db = await getDb();
  if (!db) {
    return { totalHumanClicks: 0, countries: [], devices: [], variants: [] };
  }

  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const baseFilter = and(
    eq(clicks.linkId, linkId),
    gte(clicks.timestamp, since),
    eq(clicks.isBot, false)
  );

  const [totalResult, countriesResult, devicesResult, variantsResult] =
    await Promise.all([
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(clicks)
        .where(baseFilter),
      db
        .select({
          value: clicks.country,
          count: sql<number>`COUNT(*)`,
        })
        .from(clicks)
        .where(and(baseFilter, sql`${clicks.country} IS NOT NULL`))
        .groupBy(clicks.country)
        .orderBy(desc(sql`COUNT(*)`)),
      db
        .select({
          value: clicks.deviceType,
          count: sql<number>`COUNT(*)`,
        })
        .from(clicks)
        .where(and(baseFilter, sql`${clicks.deviceType} IS NOT NULL`))
        .groupBy(clicks.deviceType)
        .orderBy(desc(sql`COUNT(*)`)),
      db
        .select({
          value: clicks.variant,
          count: sql<number>`COUNT(*)`,
        })
        .from(clicks)
        .where(and(baseFilter, sql`${clicks.variant} IS NOT NULL AND ${clicks.variant} != ''`))
        .groupBy(clicks.variant)
        .orderBy(desc(sql`COUNT(*)`)),
    ]);

  const deepLinks = await getDeepLinkEventStats(linkId, days);

  return {
    totalHumanClicks: totalResult[0]?.count ?? 0,
    countries: countriesResult,
    devices: devicesResult,
    variants: variantsResult,
    deepLinks,
  };
}

export async function getProjectClickStats(projectId: number, days: number = 30) {
  const db = await getDb();
  if (!db) return { totalClicks: 0, uniqueClicks: 0, clicksOverTime: [], topLinks: [] };
  const projectLinks = await db.select({ id: links.id }).from(links).where(eq(links.projectId, projectId));
  const linkIds = projectLinks.map(l => l.id);
  if (linkIds.length === 0) return { totalClicks: 0, uniqueClicks: 0, clicksOverTime: [], topLinks: [] };
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const notBot = eq(clicks.isBot, false);
  const [totalResult, uniqueResult, timeResult, topLinksResult] = await Promise.all([
    db.select({ count: sql<number>`COUNT(*)` }).from(clicks).where(and(inArray(clicks.linkId, linkIds), gte(clicks.timestamp, since), notBot)),
    db.select({ count: sql<number>`COUNT(DISTINCT ${clicks.ipHash})` }).from(clicks).where(and(inArray(clicks.linkId, linkIds), gte(clicks.timestamp, since), notBot)),
    db.select({ day: sql<string>`DATE(FROM_UNIXTIME(timestamp / 1000))`, count: sql<number>`COUNT(*)` }).from(clicks).where(and(inArray(clicks.linkId, linkIds), gte(clicks.timestamp, since), notBot)).groupBy(sql`DATE(FROM_UNIXTIME(timestamp / 1000))`).orderBy(sql`DATE(FROM_UNIXTIME(timestamp / 1000))`),
    db.select({ linkId: clicks.linkId, count: sql<number>`COUNT(*)` }).from(clicks).where(and(inArray(clicks.linkId, linkIds), gte(clicks.timestamp, since), notBot)).groupBy(clicks.linkId).orderBy(desc(sql`COUNT(*)`)).limit(10),
  ]);
  return { totalClicks: totalResult[0]?.count ?? 0, uniqueClicks: uniqueResult[0]?.count ?? 0, clicksOverTime: timeResult, topLinks: topLinksResult };
}

// ============ DOMAIN HELPERS ============

export async function createDomain(data: { userId: number; hostname: string; verificationToken?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(domains).values(data);
  return { id: result[0].insertId };
}

export async function getDomainsByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(domains).where(eq(domains.userId, userId)).orderBy(desc(domains.createdAt));
}

export async function getDomainById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(domains).where(eq(domains.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateDomainVerified(id: number, verified: boolean) {
  const db = await getDb();
  if (!db) return;
  await db.update(domains).set({ verified }).where(eq(domains.id, id));
}

export async function deleteDomain(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(domains).where(eq(domains.id, id));
}

// ============ GS1 PRODUCT QR HELPERS ============

export async function createProductQr(data: InsertProductQr) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(productQrs).values(data);
  return { id: result[0].insertId };
}

export async function getProductQrsByWorkspace(workspaceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(productQrs)
    .where(eq(productQrs.workspaceId, workspaceId))
    .orderBy(desc(productQrs.createdAt));
}

export async function getProductQrById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db.select().from(productQrs).where(eq(productQrs.id, id)).limit(1);
  return row;
}

export async function getProductQrByWorkspaceAndGtin(workspaceId: number, gtin: string) {
  const db = await getDb();
  if (!db) return undefined;
  const [row] = await db
    .select()
    .from(productQrs)
    .where(and(eq(productQrs.workspaceId, workspaceId), eq(productQrs.gtin, gtin)))
    .limit(1);
  return row;
}

export async function getProductQrByDomainAndGtin(domainId: number | null, gtin: string) {
  const db = await getDb();
  if (!db) return undefined;
  const condition = domainId == null
    ? and(isNull(productQrs.domainId), eq(productQrs.gtin, gtin))
    : and(eq(productQrs.domainId, domainId), eq(productQrs.gtin, gtin));
  const [row] = await db.select().from(productQrs).where(condition).orderBy(desc(productQrs.createdAt)).limit(1);
  return row;
}

export async function updateProductQr(id: number, data: Partial<InsertProductQr>) {
  const db = await getDb();
  if (!db) return;
  await db.update(productQrs).set(data).where(eq(productQrs.id, id));
}

export async function deleteProductQr(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(productQrs).where(eq(productQrs.id, id));
}

// ============ SITE SETTINGS ============

export async function getSiteSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select({ value: siteSettings.value }).from(siteSettings).where(eq(siteSettings.key, key)).limit(1);
  return result[0]?.value ?? null;
}

export async function setSiteSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(siteSettings).values({ key, value }).onDuplicateKeyUpdate({ set: { value } });
}

// ============ REPORTS ============

export async function createReport(data: { shortCode: string; reason?: string; reporterEmail?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(reports).values(data);
}

export async function getReports(status?: "pending" | "reviewed" | "actioned" | "dismissed") {
  const db = await getDb();
  if (!db) return [];
  const baseQuery = db.select({ id: reports.id, shortCode: reports.shortCode, reason: reports.reason, reporterEmail: reports.reporterEmail, status: reports.status, createdAt: reports.createdAt, linkId: links.id, userId: links.userId, destinationDomain: links.destinationUrl }).from(reports).leftJoin(links, eq(links.shortCode, reports.shortCode)).orderBy(desc(reports.createdAt));
  if (status) return baseQuery.where(eq(reports.status, status));
  return baseQuery;
}

export async function updateReportStatus(id: number, status: "pending" | "reviewed" | "actioned" | "dismissed") {
  const db = await getDb();
  if (!db) return;
  await db.update(reports).set({ status }).where(eq(reports.id, id));
}

// ============ BLOCKED DOMAINS ============

export async function getBlockedDomains() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(blockedDomains).orderBy(desc(blockedDomains.createdAt));
}

export async function addBlockedDomain(hostname: string, reason?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(blockedDomains).values({ hostname: hostname.toLowerCase(), reason }).onDuplicateKeyUpdate({ set: { reason } });
}

export async function removeBlockedDomain(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(blockedDomains).where(eq(blockedDomains.id, id));
}

export async function isHostnameBlocked(hostname: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db.select({ id: blockedDomains.id }).from(blockedDomains).where(eq(blockedDomains.hostname, hostname.toLowerCase())).limit(1);
  return result.length > 0;
}

// ============ ANALYTICS V4: BOT-FILTERED + UNIQUE CLICKS ============

export async function getClickCountByLinkIdFiltered(linkId: number, excludeBots: boolean = true) {
  const db = await getDb();
  if (!db) return { total: 0, unique: 0 };
  const conditions = [eq(clicks.linkId, linkId)];
  if (excludeBots) conditions.push(eq(clicks.isBot, false));
  const [totalResult, uniqueResult] = await Promise.all([
    db.select({ count: sql<number>`COUNT(*)` }).from(clicks).where(and(...conditions)),
    db.select({ count: sql<number>`COUNT(DISTINCT ${clicks.ipHash})` }).from(clicks).where(and(...conditions)),
  ]);
  return { total: totalResult[0]?.count ?? 0, unique: uniqueResult[0]?.count ?? 0 };
}

export async function getClicksOverTimeFiltered(linkId: number, days: number = 30, excludeBots: boolean = true) {
  const db = await getDb();
  if (!db) return [];
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const conditions = [eq(clicks.linkId, linkId), gte(clicks.timestamp, since)];
  if (excludeBots) conditions.push(eq(clicks.isBot, false));
  return db.select({ day: sql<string>`DATE(FROM_UNIXTIME(timestamp / 1000))`, total: sql<number>`COUNT(*)`, unique: sql<number>`COUNT(DISTINCT ${clicks.ipHash})` }).from(clicks).where(and(...conditions)).groupBy(sql`DATE(FROM_UNIXTIME(timestamp / 1000))`).orderBy(sql`DATE(FROM_UNIXTIME(timestamp / 1000))`);
}

export async function getClicksForExport(linkId: number, days?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [eq(clicks.linkId, linkId), eq(clicks.isBot, false)];
  if (days) conditions.push(gte(clicks.timestamp, Date.now() - days * 24 * 60 * 60 * 1000));
  const link = await db.select({ shortCode: links.shortCode, destinationUrl: links.destinationUrl, utmSource: links.utmSource, utmMedium: links.utmMedium, utmCampaign: links.utmCampaign, utmTerm: links.utmTerm, utmContent: links.utmContent }).from(links).where(eq(links.id, linkId)).limit(1);
  const linkData = link[0];
  const rows = await db.select({ timestamp: clicks.timestamp, country: clicks.country, city: clicks.city, deviceType: clicks.deviceType, browser: clicks.browser, os: clicks.os, referrer: clicks.referrer }).from(clicks).where(and(...conditions)).orderBy(desc(clicks.timestamp)).limit(10000);
  return rows.map(r => ({ Date: new Date(Number(r.timestamp)).toISOString().replace("T", " ").slice(0, 16), "Short URL": linkData?.shortCode || "", Destination: linkData?.destinationUrl || "", Country: r.country || "", City: r.city || "", Device: r.deviceType || "", Browser: r.browser || "", OS: r.os || "", Referrer: r.referrer || "", "UTM Source": linkData?.utmSource || "", "UTM Medium": linkData?.utmMedium || "", "UTM Campaign": linkData?.utmCampaign || "", "UTM Term": linkData?.utmTerm || "", "UTM Content": linkData?.utmContent || "" }));
}

export async function getProjectClicksForExport(projectId: number, days?: number) {
  const db = await getDb();
  if (!db) return [];
  const proj = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, projectId)).limit(1);
  const projectName = proj[0]?.name || "";
  const projectLinks = await db.select({ id: links.id, shortCode: links.shortCode, destinationUrl: links.destinationUrl, utmSource: links.utmSource, utmMedium: links.utmMedium, utmCampaign: links.utmCampaign, utmTerm: links.utmTerm, utmContent: links.utmContent }).from(links).where(eq(links.projectId, projectId));
  if (projectLinks.length === 0) return [];
  const linkIds = projectLinks.map(l => l.id);
  const linkMap = Object.fromEntries(projectLinks.map(l => [l.id, l]));
  const conditions: any[] = [inArray(clicks.linkId, linkIds), eq(clicks.isBot, false)];
  if (days) conditions.push(gte(clicks.timestamp, Date.now() - days * 24 * 60 * 60 * 1000));
  const clickRows = await db.select({ linkId: clicks.linkId, timestamp: clicks.timestamp, country: clicks.country, deviceType: clicks.deviceType, browser: clicks.browser, os: clicks.os, referrer: clicks.referrer }).from(clicks).where(and(...conditions)).orderBy(desc(clicks.timestamp)).limit(50000);
  return clickRows.map(c => ({ Date: new Date(Number(c.timestamp)).toISOString().replace("T", " ").slice(0, 16), "Short URL": linkMap[c.linkId]?.shortCode || "", Destination: linkMap[c.linkId]?.destinationUrl || "", Project: projectName, Country: c.country || "", Device: c.deviceType || "", Browser: c.browser || "", OS: c.os || "", Referrer: c.referrer || "", "UTM Source": linkMap[c.linkId]?.utmSource || "", "UTM Medium": linkMap[c.linkId]?.utmMedium || "", "UTM Campaign": linkMap[c.linkId]?.utmCampaign || "", "UTM Term": linkMap[c.linkId]?.utmTerm || "", "UTM Content": linkMap[c.linkId]?.utmContent || "" }));
}

// ============ USER DATA EXPORT (GDPR) ============

export async function exportUserData(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const [userData, userProjects, userLinks, userDomains] = await Promise.all([
    db.select().from(users).where(eq(users.id, userId)).limit(1),
    db.select().from(projects).where(eq(projects.userId, userId)),
    db.select().from(links).where(eq(links.userId, userId)),
    db.select().from(domains).where(eq(domains.userId, userId)),
  ]);
  const linkIds = userLinks.map(l => l.id);
  let userClicks: any[] = [];
  if (linkIds.length > 0) userClicks = await db.select().from(clicks).where(inArray(clicks.linkId, linkIds)).limit(100000);
  return { user: userData[0] || null, projects: userProjects, links: userLinks, domains: userDomains, clicks: userClicks };
}

export async function deleteUserAccount(userId: number) {
  const db = await getDb();
  if (!db) return;
  await assertUserIsNotProtectedAdmin(db, userId, "deleted");
  const userLinks = await db.select({ id: links.id, shortCode: links.shortCode }).from(links).where(eq(links.userId, userId));
  const linkIds = userLinks.map(l => l.id);
  if (linkIds.length > 0) {
    await db.delete(clicks).where(inArray(clicks.linkId, linkIds));
    for (const l of userLinks) await db.insert(retiredCodes).values({ shortCode: l.shortCode }).onDuplicateKeyUpdate({ set: { shortCode: l.shortCode } });
    await db.delete(links).where(inArray(links.id, linkIds));
  }
  await db.delete(domains).where(eq(domains.userId, userId));
  await db.delete(projects).where(eq(projects.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

// ============ ADMIN: SEARCH ============

export async function adminSearchLinks(query: string) {
  const db = await getDb();
  if (!db) return [];
  const searchTerm = `%${query}%`;
  return db.select().from(links).where(or(like(links.shortCode, searchTerm), like(links.destinationUrl, searchTerm), like(links.title, searchTerm))).orderBy(desc(links.createdAt)).limit(50);
}

export async function adminSearchUsers(query: string) {
  const db = await getDb();
  if (!db) return [];
  const searchTerm = `%${query}%`;
  return db.select({ id: users.id, name: users.name, email: users.email, role: users.role, plan: users.plan, createdAt: users.createdAt }).from(users).where(or(like(users.name, searchTerm), like(users.email, searchTerm))).orderBy(desc(users.createdAt)).limit(50);
}

export async function banLink(linkId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(links).set({ status: "paused" }).where(eq(links.id, linkId));
}

export async function banUser(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(links).set({ status: "paused" }).where(eq(links.userId, userId));
}

export async function getAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: users.id, name: users.name, email: users.email, role: users.role, plan: users.plan, createdAt: users.createdAt }).from(users).orderBy(desc(users.createdAt)).limit(100);
}

export async function getTagClicksForExport(userId: number, tag: string, days?: number) {
  const db = await getDb();
  if (!db) return [];
  const userLinks = await db.select({ id: links.id, shortCode: links.shortCode, destinationUrl: links.destinationUrl, tags: links.tags }).from(links).where(eq(links.userId, userId));
  const taggedLinks = userLinks.filter(l => {
    const t = l.tags ? typeof l.tags === "string" ? JSON.parse(l.tags) : l.tags : [];
    return t.includes(tag);
  });
  if (taggedLinks.length === 0) return [];
  const linkIds = taggedLinks.map(l => l.id);
  const linkMap = Object.fromEntries(taggedLinks.map(l => [l.id, l]));
  const conditions: any[] = [inArray(clicks.linkId, linkIds), eq(clicks.isBot, false)];
  if (days) conditions.push(gte(clicks.timestamp, Date.now() - days * 24 * 60 * 60 * 1000));
  const clickRows = await db.select({ linkId: clicks.linkId, timestamp: clicks.timestamp, country: clicks.country, deviceType: clicks.deviceType, browser: clicks.browser, os: clicks.os, referrer: clicks.referrer }).from(clicks).where(and(...conditions)).orderBy(desc(clicks.timestamp)).limit(50000);
  return clickRows.map(c => ({ Date: new Date(Number(c.timestamp)).toISOString().replace("T", " ").slice(0, 16), "Short URL": linkMap[c.linkId]?.shortCode || "", Destination: linkMap[c.linkId]?.destinationUrl || "", Tag: tag, Country: c.country || "", Device: c.deviceType || "", Browser: c.browser || "", OS: c.os || "", Referrer: c.referrer || "" }));
}

export async function claimAnonymousLinks(shortCodes: string[], userId: number) {
  const db = await getDb();
  if (!db) return;
  for (const code of shortCodes) {
    await db.update(links).set({ userId, expiresAt: null }).where(and(eq(links.shortCode, code), or(eq(links.userId, 0), isNull(links.userId))));
  }
}

// ============ AUDIT LOG ============

export async function writeAuditLog(entry: Omit<InsertAuditLogEntry, "id" | "createdAt">) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLog).values(entry);
}

export async function getAuditLogs(opts?: { limit?: number; action?: string; actorId?: number }) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (opts?.action) conditions.push(eq(auditLog.action, opts.action));
  if (opts?.actorId) conditions.push(eq(auditLog.actorId, opts.actorId));
  const query = db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(opts?.limit || 100);
  if (conditions.length > 0) return query.where(and(...conditions));
  return query;
}

// ============ ADMIN USER MANAGEMENT ============

export async function adminGetUserById(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  const [linkCountResult] = await db.select({ count: count() }).from(links).where(eq(links.userId, userId));
  const [projectCountResult] = await db.select({ count: count() }).from(projects).where(eq(projects.userId, userId));
  const violations = await db.select().from(auditLog).where(and(eq(auditLog.targetType, "user"), eq(auditLog.targetId, String(userId)))).orderBy(desc(auditLog.createdAt)).limit(20);
  return { ...user, linkCount: linkCountResult?.count || 0, projectCount: projectCountResult?.count || 0, violations };
}

export async function suspendUser(userId: number) {
  const db = await getDb();
  if (!db) return;
  await assertUserIsNotProtectedAdmin(db, userId, "suspended");
  await db.update(users).set({ suspended: true }).where(eq(users.id, userId));
  await db.update(links).set({ status: "paused" }).where(eq(links.userId, userId));
}

export async function unsuspendUser(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ suspended: false }).where(eq(users.id, userId));
  await db.update(links).set({ status: "active" }).where(eq(links.userId, userId));
}

export async function adminOverridePlan(userId: number, plan: "free" | "starter" | "pro" | "team") {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ plan }).where(eq(users.id, userId));
}

export async function adminSetRole(userId: number, role: "user" | "support" | "admin") {
  const db = await getDb();
  if (!db) return;
  if (role !== "admin") await assertUserIsNotProtectedAdmin(db, userId, "demoted");
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function adminDeleteUser(userId: number) {
  const db = await getDb();
  if (!db) return;
  await assertUserIsNotProtectedAdmin(db, userId, "deleted");
  const userLinks = await db.select({ id: links.id, shortCode: links.shortCode }).from(links).where(eq(links.userId, userId));
  for (const link of userLinks) await db.insert(retiredCodes).values({ shortCode: link.shortCode });
  const linkIds = userLinks.map(l => l.id);
  if (linkIds.length > 0) await db.delete(clicks).where(inArray(clicks.linkId, linkIds));
  await db.delete(links).where(eq(links.userId, userId));
  await db.delete(projects).where(eq(projects.userId, userId));
  await db.delete(domains).where(eq(domains.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

// ============ ADMIN LINK MANAGEMENT ============

export async function adminDisableLink(linkId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(links).set({ status: "paused" }).where(eq(links.id, linkId));
}

export async function adminDeleteLink(linkId: number) {
  const db = await getDb();
  if (!db) return;
  const [link] = await db.select({ shortCode: links.shortCode }).from(links).where(eq(links.id, linkId)).limit(1);
  if (link) {
    await db.insert(retiredCodes).values({ shortCode: link.shortCode });
    await db.delete(clicks).where(eq(clicks.linkId, linkId));
    await db.delete(links).where(eq(links.id, linkId));
  }
}

export async function adminSearchLinksAdvanced(opts: { query?: string; ownerId?: number; status?: string; anonymous?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (opts.query) {
    const term = `%${opts.query}%`;
    conditions.push(or(like(links.shortCode, term), like(links.destinationUrl, term), like(links.title, term)));
  }
  if (opts.ownerId) conditions.push(eq(links.userId, opts.ownerId));
  if (opts.anonymous) conditions.push(eq(links.userId, 0));

  const baseQuery = db.select({
    id: links.id,
    shortCode: links.shortCode,
    destinationUrl: links.destinationUrl,
    title: links.title,
    status: links.status,
    userId: links.userId,
    createdAt: links.createdAt,
    activeFrom: links.activeFrom,
    expiresAt: links.expiresAt,
    tags: links.tags,
    ownerName: users.name,
  }).from(links).leftJoin(users, eq(links.userId, users.id)).orderBy(desc(links.createdAt)).limit(500);

  const rows = conditions.length > 0 ? await baseQuery.where(and(...conditions)) : await baseQuery;
  const enriched = rows.map(row => ({ ...row, status: getLinkStatus(row) }));
  return opts.status ? enriched.filter(row => row.status === opts.status) : enriched;
}

export async function adminCleanupExpiredAnonymous() {
  const db = await getDb();
  if (!db) return 0;
  const now = Date.now();
  const expired = await db.select({ id: links.id, shortCode: links.shortCode }).from(links).where(and(eq(links.userId, 0), lte(links.expiresAt, now)));
  for (const link of expired) {
    await db.insert(retiredCodes).values({ shortCode: link.shortCode });
    await db.delete(clicks).where(eq(clicks.linkId, link.id));
    await db.delete(links).where(eq(links.id, link.id));
  }
  return expired.length;
}

// ============ ADMIN METRICS ============

export async function adminGetMetrics() {
  const db = await getDb();
  if (!db) return null;
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const [totalUsersResult] = await db.select({ count: count() }).from(users);
  const [regsTodayResult] = await db.select({ count: count() }).from(users).where(gte(users.createdAt, new Date(oneDayAgo)));
  const [regsWeekResult] = await db.select({ count: count() }).from(users).where(gte(users.createdAt, new Date(oneWeekAgo)));
  const [proUsersResult] = await db.select({ count: count() }).from(users).where(eq(users.plan, "pro"));
  const [activeSubsResult] = await db.select({ count: count() }).from(users).where(eq(users.subscriptionStatus, "active"));
  const [trialingSubsResult] = await db.select({ count: count() }).from(users).where(eq(users.subscriptionStatus, "trialing"));
  const [pastDueSubsResult] = await db.select({ count: count() }).from(users).where(eq(users.subscriptionStatus, "past_due"));
  const [canceledSubsResult] = await db.select({ count: count() }).from(users).where(eq(users.subscriptionStatus, "canceled"));

  const linkHealthRows = await db.select({
    status: links.status,
    destinationUrl: links.destinationUrl,
    activeFrom: links.activeFrom,
    expiresAt: links.expiresAt,
  }).from(links);
  const linkHealth = { active: 0, paused: 0, scheduled: 0, expired: 0, broken: 0 };
  for (const link of linkHealthRows) linkHealth[getLinkStatus(link)] += 1;

  const [clicksTodayResult] = await db.select({ count: count() }).from(clicks).where(gte(clicks.timestamp, oneDayAgo));
  const [clicksWeekResult] = await db.select({ count: count() }).from(clicks).where(gte(clicks.timestamp, oneWeekAgo));
  const [openReportsResult] = await db.select({ count: count() }).from(reports).where(eq(reports.status, "pending"));
  const [disabledTodayResult] = await db.select({ count: count() }).from(auditLog).where(and(eq(auditLog.action, "link.disable"), gte(auditLog.createdAt, new Date(oneDayAgo))));
  const [suspendedUsersResult] = await db.select({ count: count() }).from(users).where(eq(users.suspended, true));

  return {
    totalUsers: totalUsersResult?.count || 0,
    registrationsToday: regsTodayResult?.count || 0,
    registrationsWeek: regsWeekResult?.count || 0,
    proUsers: proUsersResult?.count || 0,
    subscriptions: {
      active: activeSubsResult?.count || 0,
      trialing: trialingSubsResult?.count || 0,
      pastDue: pastDueSubsResult?.count || 0,
      canceled: canceledSubsResult?.count || 0,
    },
    totalLinks: linkHealthRows.length,
    activeLinks: linkHealth.active,
    brokenLinks: linkHealth.broken,
    expiredLinks: linkHealth.expired,
    scheduledLinks: linkHealth.scheduled,
    pausedLinks: linkHealth.paused,
    clicksToday: clicksTodayResult?.count || 0,
    clicksWeek: clicksWeekResult?.count || 0,
    openReports: openReportsResult?.count || 0,
    linksDisabledToday: disabledTodayResult?.count || 0,
    suspendedUsers: suspendedUsersResult?.count || 0,
  };
}

// ============ ADMIN CONFIG (PLAN LIMITS) ============

export async function getPlanLimits() {
  const { getAllPlanConfigs } = await import("./workspace");
  const configs = await getAllPlanConfigs();
  return {
    free: { ...configs.free.limits, features: configs.free.features },
    starter: { ...configs.starter.limits, features: configs.starter.features },
    pro: { ...configs.pro.limits, features: configs.pro.features },
    team: { ...configs.team.limits, features: configs.team.features },
  };
}

export async function setPlanLimits(plan: "free" | "starter" | "pro" | "team", limits: {
  projects: number;
  links: number;
  domains?: number;
  seats?: number;
  analyticsRetentionDays?: number;
  features?: Partial<{
    utmTemplates: boolean;
    campaignDashboard: "none" | "basic" | "full";
    csvExport: boolean;
    bulkOps: boolean;
    geoTarget: boolean;
    abTest: boolean;
    deepLinks: boolean;
    pixels: boolean;
    roles: boolean;
    whiteLabelReports: boolean;
  }>;
}) {
  const { getAllPlanConfigs, setPlanConfigs } = await import("./workspace");
  const configs = await getAllPlanConfigs();
  configs[plan].limits.projects = limits.projects;
  configs[plan].limits.links = limits.links;
  if (limits.domains !== undefined) configs[plan].limits.domains = limits.domains;
  if (limits.seats !== undefined) configs[plan].limits.seats = limits.seats;
  if (limits.analyticsRetentionDays !== undefined) configs[plan].limits.analyticsRetentionDays = limits.analyticsRetentionDays;
  if (limits.features) Object.assign(configs[plan].features, limits.features);
  await setPlanConfigs(configs);
}

export async function getReservedSlugs(): Promise<string[]> {
  const custom = await getSiteSetting("reserved_slugs_custom");
  return custom ? JSON.parse(custom) : [];
}

export async function setReservedSlugs(slugs: string[]) {
  await setSiteSetting("reserved_slugs_custom", JSON.stringify(slugs));
}

// ============ STRIPE HELPERS ============

export async function updateUserStripeInfo(userId: number, data: {
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus?: "active" | "trialing" | "past_due" | "canceled" | null;
  currentPeriodEnd?: number | null;
  plan?: "free" | "pro";
}) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set(data as any).where(eq(users.id, userId));
}

export async function getUserByStripeCustomerId(stripeCustomerId: string) {
  const db = await getDb();
  if (!db) return null;
  const [user] = await db.select().from(users).where(eq(users.stripeCustomerId, stripeCustomerId)).limit(1);
  return user || null;
}

export async function adminGetAllUsersEnriched(opts?: { search?: string; plan?: string; suspended?: boolean }) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (opts?.search) {
    const term = `%${opts.search}%`;
    conditions.push(or(like(users.name, term), like(users.email, term)));
  }
  if (opts?.plan) conditions.push(eq(users.plan, opts.plan as any));
  if (opts?.suspended !== undefined) conditions.push(eq(users.suspended, opts.suspended));
  const query = db.select({ id: users.id, name: users.name, email: users.email, role: users.role, plan: users.plan, suspended: users.suspended, subscriptionStatus: users.subscriptionStatus, stripeCustomerId: users.stripeCustomerId, createdAt: users.createdAt, lastSignedIn: users.lastSignedIn }).from(users).orderBy(desc(users.createdAt)).limit(200);
  if (conditions.length > 0) return query.where(and(...conditions));
  return query;
}

// ============ NOTIFICATIONS ============

export async function createNotification(data: InsertNotification) {
  const db = await getDb();
  if (!db) return null;
  const [result] = await db.insert(notifications).values(data).$returningId();
  return result.id;
}

export async function createNotificationRecipients(recipients: InsertNotificationRecipient[]) {
  const db = await getDb();
  if (!db || recipients.length === 0) return;
  await db.insert(notificationRecipients).values(recipients);
}

export async function getNotificationsForUser(userId: number, limit = 30) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: notificationRecipients.id,
    notificationId: notificationRecipients.notificationId,
    read: notificationRecipients.read,
    readAt: notificationRecipients.readAt,
    title: notifications.title,
    body: notifications.body,
    category: notifications.category,
    createdAt: notifications.createdAt,
  }).from(notificationRecipients).innerJoin(notifications, eq(notificationRecipients.notificationId, notifications.id)).where(eq(notificationRecipients.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function getUnreadNotificationCount(userId: number) {
  const db = await getDb();
  if (!db) return 0;
  const [result] = await db.select({ count: sql<number>`COUNT(*)` }).from(notificationRecipients).where(and(eq(notificationRecipients.userId, userId), eq(notificationRecipients.read, false)));
  return result?.count ?? 0;
}

export async function markNotificationRead(recipientId: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notificationRecipients).set({ read: true, readAt: new Date() }).where(and(eq(notificationRecipients.id, recipientId), eq(notificationRecipients.userId, userId)));
}

export async function markAllNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(notificationRecipients).set({ read: true, readAt: new Date() }).where(and(eq(notificationRecipients.userId, userId), eq(notificationRecipients.read, false)));
}

export async function getAllNotifications(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function getUserIdsByAudience(audience: { type: string; value?: string; userIds?: number[] }): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  switch (audience.type) {
    case "all": {
      const rows = await db.select({ id: users.id }).from(users).where(eq(users.suspended, false));
      return rows.map(r => r.id);
    }
    case "plan": {
      const rows = await db.select({ id: users.id }).from(users).where(and(eq(users.plan, audience.value as any), eq(users.suspended, false)));
      return rows.map(r => r.id);
    }
    case "role": {
      const rows = await db.select({ id: users.id }).from(users).where(and(eq(users.role, audience.value as any), eq(users.suspended, false)));
      return rows.map(r => r.id);
    }
    case "workspace": {
      const wsId = parseInt(audience.value || "0");
      const rows = await db.select({ userId: workspaceMembers.userId }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, wsId));
      return rows.map(r => r.userId);
    }
    case "users":
      return audience.userIds || [];
    default:
      return [];
  }
}
