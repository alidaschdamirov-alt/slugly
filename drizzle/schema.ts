import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, bigint, json, boolean, index } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "support", "admin"]).default("user").notNull(),
  plan: mysqlEnum("plan", ["free", "starter", "pro", "team"]).default("free").notNull(),
  suspended: boolean("suspended").default(false).notNull(),
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }),
  subscriptionStatus: mysqlEnum("subscriptionStatus", ["active", "trialing", "past_due", "canceled"]),
  currentPeriodEnd: bigint("currentPeriodEnd", { mode: "number" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============ WORKSPACES ============

export const workspaces = mysqlTable("workspaces", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  plan: mysqlEnum("plan", ["free", "starter", "pro", "team"]).default("free").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Workspace = typeof workspaces.$inferSelect;
export type InsertWorkspace = typeof workspaces.$inferInsert;

export const workspaceMembers = mysqlTable("workspace_members", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["owner", "admin", "editor", "viewer"]).default("editor").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  workspaceUserIdx: index("wm_workspace_user_idx").on(table.workspaceId, table.userId),
  userIdx: index("wm_user_idx").on(table.userId),
}));

export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type InsertWorkspaceMember = typeof workspaceMembers.$inferInsert;

export const workspaceInvitations = mysqlTable("workspace_invitations", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  role: mysqlEnum("role", ["admin", "editor", "viewer"]).default("editor").notNull(),
  token: varchar("token", { length: 64 }).notNull().unique(),
  invitedBy: int("invitedBy").notNull(),
  status: mysqlEnum("status", ["pending", "accepted", "expired"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  expiresAt: bigint("expiresAt", { mode: "number" }).notNull(),
});

export type WorkspaceInvitation = typeof workspaceInvitations.$inferSelect;
export type InsertWorkspaceInvitation = typeof workspaceInvitations.$inferInsert;

// ============ PROJECTS ============

export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  workspaceId: int("workspaceId"),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 7 }).default("#6366f1").notNull(),
  archived: boolean("archived").default(false).notNull(),
  isSystem: boolean("isSystem").default(false).notNull(),
  createdBy: int("createdBy"),
  updatedBy: int("updatedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

// ============ LINKS ============

export const links = mysqlTable("links", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  projectId: int("projectId"),
  destinationUrl: text("destinationUrl").notNull(),
  shortCode: varchar("shortCode", { length: 32 }).notNull().unique(),
  title: varchar("title", { length: 500 }),
  tags: json("tags").$type<string[]>(),
  utmSource: varchar("utmSource", { length: 255 }),
  utmMedium: varchar("utmMedium", { length: 255 }),
  utmCampaign: varchar("utmCampaign", { length: 255 }),
  utmTerm: varchar("utmTerm", { length: 255 }),
  utmContent: varchar("utmContent", { length: 255 }),
  domainId: int("domainId"),
  status: mysqlEnum("status", ["active", "paused"]).default("active").notNull(),
  activeFrom: bigint("activeFrom", { mode: "number" }),
  expiresAt: bigint("expiresAt", { mode: "number" }),
  createdBy: int("createdBy"),
  updatedBy: int("updatedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdIdx: index("links_userId_idx").on(table.userId),
  projectIdIdx: index("links_projectId_idx").on(table.projectId),
}));

export type Link = typeof links.$inferSelect;
export type InsertLink = typeof links.$inferInsert;

// ============ CLICKS ============

export const clicks = mysqlTable("clicks", {
  id: int("id").autoincrement().primaryKey(),
  linkId: int("linkId").notNull(),
  timestamp: bigint("timestamp", { mode: "number" }).notNull(),
  country: varchar("country", { length: 100 }),
  city: varchar("city", { length: 255 }),
  deviceType: varchar("deviceType", { length: 50 }),
  browser: varchar("browser", { length: 100 }),
  os: varchar("os", { length: 100 }),
  referrer: text("referrer"),
  isBot: boolean("isBot").default(false).notNull(),
  ipHash: varchar("ipHash", { length: 64 }),
  variant: varchar("variant", { length: 64 }),
}, (table) => ({
  linkIdTimestampIdx: index("clicks_linkId_timestamp_idx").on(table.linkId, table.timestamp),
}));

export type Click = typeof clicks.$inferSelect;
export type InsertClick = typeof clicks.$inferInsert;

// ============ DOMAINS ============

export const domains = mysqlTable("domains", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  workspaceId: int("workspaceId"),
  hostname: varchar("hostname", { length: 255 }).notNull().unique(),
  verified: boolean("verified").default(false).notNull(),
  verificationToken: varchar("verificationToken", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Domain = typeof domains.$inferSelect;
export type InsertDomain = typeof domains.$inferInsert;

// ============ LINK RULES (Phase 3: geo, device, A/B, deep links, pixels) ============

export const linkRules = mysqlTable("link_rules", {
  id: int("id").autoincrement().primaryKey(),
  linkId: int("linkId").notNull(),
  type: mysqlEnum("type", ["geo", "device", "ab", "deeplink", "pixel"]).notNull(),
  config: json("config").$type<Record<string, any>>().notNull(),
  priority: int("priority").default(0).notNull(),
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  linkIdIdx: index("link_rules_linkId_idx").on(table.linkId),
}));

export type LinkRule = typeof linkRules.$inferSelect;
export type InsertLinkRule = typeof linkRules.$inferInsert;

// ============ DEEP LINK EVENTS ============

export const deepLinkEvents = mysqlTable("deep_link_events", {
  id: int("id").autoincrement().primaryKey(),
  linkId: int("linkId").notNull(),
  sessionId: varchar("sessionId", { length: 64 }).notNull(),
  eventType: mysqlEnum("eventType", ["attempt", "app_open", "store_fallback", "web_fallback"]).notNull(),
  platform: mysqlEnum("platform", ["ios", "android", "other"]).default("other").notNull(),
  source: varchar("source", { length: 32 }).default("web").notNull(),
  timestamp: bigint("timestamp", { mode: "number" }).notNull(),
}, (table) => ({
  linkTimestampIdx: index("deep_link_events_link_ts_idx").on(table.linkId, table.timestamp),
  sessionIdx: index("deep_link_events_session_idx").on(table.sessionId),
}));

export type DeepLinkEvent = typeof deepLinkEvents.$inferSelect;
export type InsertDeepLinkEvent = typeof deepLinkEvents.$inferInsert;

// ============ GS1 PRODUCT QR ============

export const productQrs = mysqlTable("product_qrs", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  userId: int("userId").notNull(),
  linkId: int("linkId").notNull(),
  domainId: int("domainId"),
  gtin: varchar("gtin", { length: 14 }).notNull(),
  sourceGtin: varchar("sourceGtin", { length: 14 }).notNull(),
  productName: varchar("productName", { length: 255 }).notNull(),
  brand: varchar("brand", { length: 255 }),
  batchLot: varchar("batchLot", { length: 20 }),
  serialNumber: varchar("serialNumber", { length: 20 }),
  expiryDate: varchar("expiryDate", { length: 10 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  workspaceIdx: index("product_qrs_workspace_idx").on(table.workspaceId),
  gtinIdx: index("product_qrs_gtin_idx").on(table.gtin),
  linkIdx: index("product_qrs_link_idx").on(table.linkId),
}));

export type ProductQr = typeof productQrs.$inferSelect;
export type InsertProductQr = typeof productQrs.$inferInsert;

// ============ UTM TEMPLATES ============

export const utmTemplates = mysqlTable("utm_templates", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  utmSource: varchar("utmSource", { length: 255 }),
  utmMedium: varchar("utmMedium", { length: 255 }),
  utmCampaign: varchar("utmCampaign", { length: 255 }),
  utmTerm: varchar("utmTerm", { length: 255 }),
  utmContent: varchar("utmContent", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UtmTemplate = typeof utmTemplates.$inferSelect;
export type InsertUtmTemplate = typeof utmTemplates.$inferInsert;

// ============ RETARGETING PIXELS ============

export const retargetingPixels = mysqlTable("retargeting_pixels", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["facebook", "google", "tiktok", "linkedin", "custom"]).notNull(),
  pixelId: varchar("pixelId", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type RetargetingPixel = typeof retargetingPixels.$inferSelect;
export type InsertRetargetingPixel = typeof retargetingPixels.$inferInsert;

// ============ TOMBSTONES ============

// Tombstone table to prevent reuse of deleted short codes
export const retiredCodes = mysqlTable("retired_codes", {
  id: int("id").autoincrement().primaryKey(),
  shortCode: varchar("shortCode", { length: 32 }).notNull().unique(),
  retiredAt: timestamp("retiredAt").defaultNow().notNull(),
});

// Reports table for abuse reporting
export const reports = mysqlTable("reports", {
  id: int("id").autoincrement().primaryKey(),
  shortCode: varchar("shortCode", { length: 32 }).notNull(),
  reason: text("reason"),
  reporterEmail: varchar("reporterEmail", { length: 320 }),
  status: mysqlEnum("status", ["pending", "reviewed", "actioned", "dismissed"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Report = typeof reports.$inferSelect;
export type InsertReport = typeof reports.$inferInsert;

// Blocked domains list (admin-managed)
export const blockedDomains = mysqlTable("blocked_domains", {
  id: int("id").autoincrement().primaryKey(),
  hostname: varchar("hostname", { length: 255 }).notNull().unique(),
  reason: text("reason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type BlockedDomain = typeof blockedDomains.$inferSelect;

// Site settings (key-value store for global toggles)
export const siteSettings = mysqlTable("site_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Audit log for admin actions
export const auditLog = mysqlTable("audit_log", {
  id: int("id").autoincrement().primaryKey(),
  actorId: int("actorId").notNull(),
  actorName: varchar("actorName", { length: 255 }),
  action: varchar("action", { length: 100 }).notNull(),
  targetType: varchar("targetType", { length: 50 }),
  targetId: varchar("targetId", { length: 255 }),
  metadata: json("metadata").$type<Record<string, any>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type InsertAuditLogEntry = typeof auditLog.$inferInsert;

// Persistent rate limiting
export const rateLimits = mysqlTable("rate_limits", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 255 }).notNull().unique(),
  windowStart: bigint("windowStart", { mode: "number" }).notNull(),
  count: int("count").notNull().default(0),
});

export type RateLimit = typeof rateLimits.$inferSelect;

// ============ NOTIFICATIONS ============

export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  category: mysqlEnum("category", ["system", "update", "promo", "alert"]).default("system").notNull(),
  audience: json("audience").$type<{ type: "all" | "plan" | "role" | "workspace" | "users"; value?: string; userIds?: number[] }>(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

export const notificationRecipients = mysqlTable("notification_recipients", {
  id: int("id").autoincrement().primaryKey(),
  notificationId: int("notificationId").notNull(),
  userId: int("userId").notNull(),
  read: boolean("read").default(false).notNull(),
  readAt: timestamp("readAt"),
}, (table) => [
  index("idx_notif_recipient_user").on(table.userId),
  index("idx_notif_recipient_notif").on(table.notificationId),
]);
export type NotificationRecipient = typeof notificationRecipients.$inferSelect;
export type InsertNotificationRecipient = typeof notificationRecipients.$inferInsert;
