import { createHash } from "crypto";
import { desc, like } from "drizzle-orm";
import { siteSettings } from "../drizzle/schema";
import { getDb, getSiteSetting, setSiteSetting } from "./db";

export type EmailMetricEvent = "sent" | "delivered" | "opened" | "bounced" | "complained" | "failed";

export interface EmailDeliveryRecord {
  key: string;
  emailId: string;
  recipient: string;
  category: string;
  subject: string;
  sentAt: number | null;
  deliveredAt: number | null;
  openedAt: number | null;
  bouncedAt: number | null;
  complainedAt: number | null;
  failedAt: number | null;
  bounceMessage?: string | null;
  updatedAt: number;
}

const LOG_PREFIX = "email_delivery_v1_";
const BOUNCE_ALERT_KEY = "email_bounce_alert_last_at";
const MAX_QUERY_ROWS = 2000;
const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

function recipientHash(recipient: string) {
  return createHash("sha256").update(recipient.trim().toLowerCase()).digest("hex").slice(0, 10);
}

function logKey(emailId: string, recipient: string) {
  return `${LOG_PREFIX}${emailId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50)}_${recipientHash(recipient)}`;
}

function normalizeCategory(value: unknown) {
  if (typeof value !== "string") return "unknown";
  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
  return normalized || "unknown";
}

function parseRecord(key: string, raw: string): EmailDeliveryRecord | null {
  if (!raw || raw === "null") return null;
  try {
    const value = JSON.parse(raw) as EmailDeliveryRecord;
    return value?.emailId ? { ...value, key } : null;
  } catch {
    return null;
  }
}

async function readRecord(emailId: string, recipient: string) {
  const key = logKey(emailId, recipient);
  const raw = await getSiteSetting(key);
  return { key, value: raw ? parseRecord(key, raw) : null };
}

async function writeRecord(record: EmailDeliveryRecord) {
  await setSiteSetting(record.key, JSON.stringify(record));
}

export async function recordEmailSent(input: {
  emailId: string;
  recipients: string[];
  category?: string;
  subject: string;
}) {
  const now = Date.now();
  await Promise.all(input.recipients.map(async recipient => {
    const { key, value } = await readRecord(input.emailId, recipient);
    const record: EmailDeliveryRecord = {
      key,
      emailId: input.emailId,
      recipient,
      category: normalizeCategory(input.category || "custom"),
      subject: input.subject.slice(0, 500),
      sentAt: value?.sentAt || now,
      deliveredAt: value?.deliveredAt || null,
      openedAt: value?.openedAt || null,
      bouncedAt: value?.bouncedAt || null,
      complainedAt: value?.complainedAt || null,
      failedAt: value?.failedAt || null,
      bounceMessage: value?.bounceMessage || null,
      updatedAt: now,
    };
    await writeRecord(record);
  }));
}

function extractCategory(tags: unknown): string | undefined {
  if (!tags) return undefined;
  if (Array.isArray(tags)) {
    const category = tags.find((tag: any) => tag?.name === "category");
    return typeof category?.value === "string" ? category.value : undefined;
  }
  if (typeof tags === "object") {
    const value = (tags as Record<string, unknown>).category;
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

function eventField(event: EmailMetricEvent): keyof Pick<EmailDeliveryRecord, "sentAt" | "deliveredAt" | "openedAt" | "bouncedAt" | "complainedAt" | "failedAt"> {
  if (event === "delivered") return "deliveredAt";
  if (event === "opened") return "openedAt";
  if (event === "bounced") return "bouncedAt";
  if (event === "complained") return "complainedAt";
  if (event === "failed") return "failedAt";
  return "sentAt";
}

export async function recordEmailWebhookEvent(input: {
  event: EmailMetricEvent;
  emailId: string;
  recipient: string;
  subject?: string;
  tags?: unknown;
  createdAt?: string;
  bounceMessage?: string;
}) {
  const { key, value } = await readRecord(input.emailId, input.recipient);
  const at = input.createdAt ? new Date(input.createdAt).getTime() : Date.now();
  const timestamp = Number.isFinite(at) ? at : Date.now();
  const field = eventField(input.event);
  const existing = value?.[field];
  const record: EmailDeliveryRecord = {
    key,
    emailId: input.emailId,
    recipient: input.recipient,
    category: value?.category || normalizeCategory(extractCategory(input.tags) || "unknown"),
    subject: value?.subject || (input.subject || "").slice(0, 500),
    sentAt: value?.sentAt || (input.event === "sent" ? timestamp : null),
    deliveredAt: value?.deliveredAt || null,
    openedAt: value?.openedAt || null,
    bouncedAt: value?.bouncedAt || null,
    complainedAt: value?.complainedAt || null,
    failedAt: value?.failedAt || null,
    bounceMessage: value?.bounceMessage || input.bounceMessage || null,
    updatedAt: Date.now(),
  };
  if (!existing) (record as any)[field] = timestamp;
  await writeRecord(record);

  if ((input.event === "bounced" || input.event === "complained") && !existing) {
    await maybeAlertOnBounceRate().catch(error => console.error("[EmailMetrics] Bounce alert check failed:", error));
  }
  return record;
}

export async function listEmailDeliveryRecords(limit = MAX_QUERY_ROWS): Promise<EmailDeliveryRecord[]> {
  const database = await getDb();
  if (!database) return [];
  const rows = await database
    .select({ key: siteSettings.key, value: siteSettings.value })
    .from(siteSettings)
    .where(like(siteSettings.key, `${LOG_PREFIX}%`))
    .orderBy(desc(siteSettings.updatedAt))
    .limit(Math.min(MAX_QUERY_ROWS, Math.max(1, limit)));
  return rows.map(row => parseRecord(row.key, row.value)).filter((value): value is EmailDeliveryRecord => !!value);
}

function summarize(records: EmailDeliveryRecord[]) {
  const sent = records.filter(record => !!record.sentAt).length;
  const delivered = records.filter(record => !!record.deliveredAt).length;
  const opened = records.filter(record => !!record.openedAt).length;
  const bounced = records.filter(record => !!record.bouncedAt).length;
  const complained = records.filter(record => !!record.complainedAt).length;
  const failed = records.filter(record => !!record.failedAt).length;
  const pct = (value: number, base = sent) => base > 0 ? Math.round((value / base) * 10000) / 100 : 0;
  return {
    sent,
    delivered,
    opened,
    bounced,
    complained,
    failed,
    deliveryRate: pct(delivered),
    openRate: pct(opened, delivered || sent),
    bounceRate: pct(bounced),
    complaintRate: pct(complained),
  };
}

export async function getEmailDeliverabilitySnapshot(input?: { days?: number; search?: string; category?: string }) {
  const days = Math.min(365, Math.max(1, input?.days || 30));
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  const all = await listEmailDeliveryRecords();
  const inWindow = all.filter(record => (record.sentAt || record.updatedAt) >= since);
  const categories = Array.from(new Set(inWindow.map(record => record.category))).sort();
  const byCategory = categories.map(category => ({ category, ...summarize(inWindow.filter(record => record.category === category)) }));

  let logs = inWindow;
  if (input?.category) logs = logs.filter(record => record.category === input.category);
  if (input?.search?.trim()) {
    const q = input.search.trim().toLowerCase();
    logs = logs.filter(record => [record.emailId, record.recipient, record.subject, record.category].some(value => value.toLowerCase().includes(q)));
  }

  return {
    generatedAt: Date.now(),
    days,
    summary: summarize(inWindow),
    byCategory,
    categories,
    logs: logs.slice(0, 500),
  };
}

async function maybeAlertOnBounceRate() {
  const records = await listEmailDeliveryRecords();
  const now = Date.now();
  const lastDay = records.filter(record => (record.sentAt || record.updatedAt) >= now - 24 * 60 * 60 * 1000);
  const baseline = records.filter(record => {
    const at = record.sentAt || record.updatedAt;
    return at >= now - 8 * 24 * 60 * 60 * 1000 && at < now - 24 * 60 * 60 * 1000;
  });
  const current = summarize(lastDay);
  const previous = summarize(baseline);
  if (current.sent < 20) return;
  const threshold = Math.max(5, previous.bounceRate * 2);
  if (current.bounceRate < threshold) return;

  const lastAlert = Number(await getSiteSetting(BOUNCE_ALERT_KEY) || 0);
  if (Number.isFinite(lastAlert) && now - lastAlert < ALERT_COOLDOWN_MS) return;
  await setSiteSetting(BOUNCE_ALERT_KEY, String(now));
  const { notifyOwner } = await import("./_core/notification");
  await notifyOwner({
    title: "Slugly email bounce rate alert",
    content: `Bounce rate reached ${current.bounceRate}% over the last 24 hours (${current.bounced}/${current.sent}), above the alert threshold of ${threshold.toFixed(2)}%.`,
  });
}
