import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import * as db from "./db";
import {
  storageDelete,
  storageGetSignedUrl,
  storagePutExact,
  storageRead,
  storageStat,
} from "./storage";
import { isAuthorizedCronRequest } from "./_core/cronAuth";

export const BACKUP_FORMAT_VERSION = "2.0";
const HISTORY_KEY = "backup_history_v2";
const CONFIG_KEY = "backup_config_v2";
const LAST_SCHEDULED_DATE_KEY = "backup_last_scheduled_date";
const DEFAULT_RETENTION_COUNT = 30;
const DEFAULT_RETENTION_DAYS = 90;

export interface BackupConfig {
  enabled: boolean;
  hourUtc: number;
  minuteUtc: number;
  retentionCount: number;
  retentionDays: number;
}

export interface BackupManifest {
  id: string;
  key: string;
  createdAt: string;
  source: "scheduled" | "manual";
  version: string;
  encrypted: true;
  encryption: "aes-256-gcm";
  encryptionKeySource: "dedicated" | "storage-signing" | "clerk-secret";
  checksumSha256: string;
  sizeBytes: number;
  plaintextBytes: number;
  summary: Record<string, number>;
  integrityStatus: "verified" | "failed" | "pending";
  lastVerifiedAt?: string | null;
  lastRestoreTestAt?: string | null;
  restoreTestStatus?: "passed" | "failed" | null;
  restoreTestDetail?: string | null;
}

interface EncryptedBackupEnvelope {
  format: "slugly-backup-encrypted-v2";
  algorithm: "aes-256-gcm";
  iv: string;
  authTag: string;
  checksumSha256: string;
  ciphertext: string;
}

interface BackupPayload {
  exportedAt: string;
  version: string;
  summary: Record<string, number>;
  data: Record<string, unknown[]>;
}

const DEFAULT_CONFIG: BackupConfig = {
  enabled: true,
  hourUtc: 2,
  minuteUtc: 0,
  retentionCount: DEFAULT_RETENTION_COUNT,
  retentionDays: DEFAULT_RETENTION_DAYS,
};

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function getEncryptionMaterial(): { key: Buffer; source: BackupManifest["encryptionKeySource"] } {
  const dedicated = process.env.BACKUP_ENCRYPTION_KEY?.trim();
  if (dedicated) return { key: createHash("sha256").update(dedicated).digest(), source: "dedicated" };
  const storageSecret = process.env.STORAGE_SIGNING_SECRET?.trim();
  if (storageSecret) return { key: createHash("sha256").update(storageSecret).digest(), source: "storage-signing" };
  const clerkSecret = process.env.CLERK_SECRET_KEY?.trim();
  if (clerkSecret) return { key: createHash("sha256").update(clerkSecret).digest(), source: "clerk-secret" };
  throw new Error("BACKUP_ENCRYPTION_KEY, STORAGE_SIGNING_SECRET, or CLERK_SECRET_KEY is required to encrypt backups");
}

function encryptPayload(plaintext: Buffer) {
  const { key, source } = getEncryptionMaterial();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const checksumSha256 = sha256(plaintext);
  const envelope: EncryptedBackupEnvelope = {
    format: "slugly-backup-encrypted-v2",
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    checksumSha256,
    ciphertext: ciphertext.toString("base64"),
  };
  return {
    encoded: Buffer.from(JSON.stringify(envelope), "utf8"),
    checksumSha256,
    source,
  };
}

function decryptEnvelope(raw: Buffer): { plaintext: Buffer; checksumSha256: string } {
  let envelope: EncryptedBackupEnvelope;
  try {
    envelope = JSON.parse(raw.toString("utf8")) as EncryptedBackupEnvelope;
  } catch {
    throw new Error("Backup envelope is not valid JSON");
  }
  if (envelope.format !== "slugly-backup-encrypted-v2" || envelope.algorithm !== "aes-256-gcm") {
    throw new Error("Unsupported backup envelope format");
  }
  const { key } = getEncryptionMaterial();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64"));
  decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]);
  const actualChecksum = sha256(plaintext);
  if (actualChecksum !== envelope.checksumSha256) throw new Error("Backup checksum mismatch");
  return { plaintext, checksumSha256: actualChecksum };
}

export async function getBackupConfig(): Promise<BackupConfig> {
  const raw = await db.getSiteSetting(CONFIG_KEY);
  if (!raw) return DEFAULT_CONFIG;
  try {
    const parsed = JSON.parse(raw) as Partial<BackupConfig>;
    return normalizeBackupConfig({ ...DEFAULT_CONFIG, ...parsed });
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function normalizeBackupConfig(input: BackupConfig): BackupConfig {
  return {
    enabled: !!input.enabled,
    hourUtc: Math.min(23, Math.max(0, Math.floor(Number(input.hourUtc) || 0))),
    minuteUtc: Math.min(59, Math.max(0, Math.floor(Number(input.minuteUtc) || 0))),
    retentionCount: Math.min(365, Math.max(1, Math.floor(Number(input.retentionCount) || DEFAULT_RETENTION_COUNT))),
    retentionDays: Math.min(3650, Math.max(1, Math.floor(Number(input.retentionDays) || DEFAULT_RETENTION_DAYS))),
  };
}

export async function setBackupConfig(config: BackupConfig) {
  const normalized = normalizeBackupConfig(config);
  await db.setSiteSetting(CONFIG_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function getBackupHistory(): Promise<BackupManifest[]> {
  const raw = await db.getSiteSetting(HISTORY_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is BackupManifest => !!item && typeof item.id === "string" && typeof item.key === "string");
  } catch {
    return [];
  }
}

async function saveBackupHistory(history: BackupManifest[]) {
  await db.setSiteSetting(HISTORY_KEY, JSON.stringify(history));
}

export async function generateBackup(): Promise<BackupPayload> {
  const database = await db.getDb();
  if (!database) throw new Error("Database not available");

  const schema = await import("../drizzle/schema");
  const [
    users,
    workspaces,
    workspaceMembers,
    workspaceInvitations,
    projects,
    links,
    clicks,
    domains,
    linkRules,
    utmTemplates,
    retargetingPixels,
    retiredCodes,
    reports,
    blockedDomains,
    siteSettings,
    auditLog,
    rateLimits,
    notifications,
    notificationRecipients,
  ] = await Promise.all([
    database.select().from(schema.users),
    database.select().from(schema.workspaces),
    database.select().from(schema.workspaceMembers),
    database.select().from(schema.workspaceInvitations),
    database.select().from(schema.projects),
    database.select().from(schema.links),
    database.select().from(schema.clicks),
    database.select().from(schema.domains),
    database.select().from(schema.linkRules),
    database.select().from(schema.utmTemplates),
    database.select().from(schema.retargetingPixels),
    database.select().from(schema.retiredCodes),
    database.select().from(schema.reports),
    database.select().from(schema.blockedDomains),
    database.select().from(schema.siteSettings),
    database.select().from(schema.auditLog),
    database.select().from(schema.rateLimits),
    database.select().from(schema.notifications),
    database.select().from(schema.notificationRecipients),
  ]);

  const data: Record<string, unknown[]> = {
    users,
    workspaces,
    workspaceMembers,
    workspaceInvitations,
    projects,
    links,
    clicks,
    domains,
    linkRules,
    utmTemplates,
    retargetingPixels,
    retiredCodes,
    reports,
    blockedDomains,
    siteSettings,
    auditLog,
    rateLimits,
    notifications,
    notificationRecipients,
  };
  const summary = Object.fromEntries(Object.entries(data).map(([name, rows]) => [name, rows.length]));
  return {
    exportedAt: new Date().toISOString(),
    version: BACKUP_FORMAT_VERSION,
    summary,
    data,
  };
}

function backupKey(source: BackupManifest["source"], id: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `backups/v2/slugly-${source}-${stamp}-${id}.json.enc`;
}

export async function createBackupSnapshot(source: BackupManifest["source"]): Promise<BackupManifest> {
  const payload = await generateBackup();
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = encryptPayload(plaintext);
  const id = randomUUID().replaceAll("-", "").slice(0, 12);
  const key = backupKey(source, id);
  await storagePutExact(key, encrypted.encoded, "application/octet-stream");
  const stat = await storageStat(key);

  const manifest: BackupManifest = {
    id,
    key,
    createdAt: payload.exportedAt,
    source,
    version: payload.version,
    encrypted: true,
    encryption: "aes-256-gcm",
    encryptionKeySource: encrypted.source,
    checksumSha256: encrypted.checksumSha256,
    sizeBytes: stat.size,
    plaintextBytes: plaintext.length,
    summary: payload.summary,
    integrityStatus: "verified",
    lastVerifiedAt: new Date().toISOString(),
    lastRestoreTestAt: null,
    restoreTestStatus: null,
    restoreTestDetail: null,
  };

  const history = [manifest, ...(await getBackupHistory()).filter(item => item.id !== id)];
  await saveBackupHistory(history);
  await db.setSiteSetting("last_backup_at", manifest.createdAt);
  await db.setSiteSetting("last_backup_size", String(manifest.sizeBytes));
  await db.setSiteSetting("last_backup_key", manifest.key);
  await db.setSiteSetting("last_backup_url", await storageGetSignedUrl(manifest.key));
  await applyBackupRetention();
  return manifest;
}

async function loadBackupPayload(manifest: BackupManifest): Promise<{ payload: BackupPayload; checksumSha256: string; sizeBytes: number }> {
  const raw = await storageRead(manifest.key);
  const { plaintext, checksumSha256 } = decryptEnvelope(raw);
  if (checksumSha256 !== manifest.checksumSha256) throw new Error("Manifest checksum does not match encrypted backup");
  let payload: BackupPayload;
  try {
    payload = JSON.parse(plaintext.toString("utf8")) as BackupPayload;
  } catch {
    throw new Error("Decrypted backup payload is not valid JSON");
  }
  if (payload.version !== manifest.version) throw new Error("Backup version does not match manifest");
  if (!payload.data || !payload.summary) throw new Error("Backup payload is missing required sections");
  for (const [name, count] of Object.entries(payload.summary)) {
    const rows = payload.data[name];
    if (!Array.isArray(rows) || rows.length !== count) throw new Error(`Backup summary mismatch for ${name}`);
  }
  return { payload, checksumSha256, sizeBytes: raw.length };
}

export async function verifyBackup(id: string) {
  const history = await getBackupHistory();
  const manifest = history.find(item => item.id === id);
  if (!manifest) throw new Error("Backup version not found");
  try {
    const loaded = await loadBackupPayload(manifest);
    manifest.integrityStatus = "verified";
    manifest.lastVerifiedAt = new Date().toISOString();
    manifest.sizeBytes = loaded.sizeBytes;
    await saveBackupHistory(history);
    return { ok: true, checksumSha256: loaded.checksumSha256, summary: loaded.payload.summary };
  } catch (error: any) {
    manifest.integrityStatus = "failed";
    manifest.lastVerifiedAt = new Date().toISOString();
    await saveBackupHistory(history);
    throw error;
  }
}

export function validateRestorePayload(payload: BackupPayload) {
  const required = ["users", "workspaces", "projects", "links", "clicks", "domains", "auditLog"];
  for (const name of required) {
    if (!Array.isArray(payload.data[name])) throw new Error(`Restore test failed: missing table ${name}`);
  }

  const users = payload.data.users as Array<any>;
  const projects = payload.data.projects as Array<any>;
  const links = payload.data.links as Array<any>;
  const clicks = payload.data.clicks as Array<any>;
  const userIds = new Set(users.map(row => Number(row.id)));
  const projectIds = new Set(projects.map(row => Number(row.id)));
  const linkIds = new Set(links.map(row => Number(row.id)));
  const warnings: string[] = [];

  for (const project of projects) {
    if (!userIds.has(Number(project.userId))) warnings.push(`Project ${project.id} references missing user ${project.userId}`);
  }
  for (const link of links) {
    if (Number(link.userId) !== 0 && !userIds.has(Number(link.userId))) warnings.push(`Link ${link.id} references missing user ${link.userId}`);
    if (link.projectId != null && !projectIds.has(Number(link.projectId))) warnings.push(`Link ${link.id} references missing project ${link.projectId}`);
  }
  for (const click of clicks) {
    if (!linkIds.has(Number(click.linkId))) warnings.push(`Click ${click.id} references missing link ${click.linkId}`);
    if (warnings.length >= 100) break;
  }

  return {
    ok: warnings.length === 0,
    warnings,
    tableCount: Object.keys(payload.data).length,
    rowCount: Object.values(payload.data).reduce((sum, rows) => sum + rows.length, 0),
  };
}

export async function testRestoreBackup(id: string) {
  const history = await getBackupHistory();
  const manifest = history.find(item => item.id === id);
  if (!manifest) throw new Error("Backup version not found");
  try {
    const { payload } = await loadBackupPayload(manifest);
    const result = validateRestorePayload(payload);
    manifest.lastRestoreTestAt = new Date().toISOString();
    manifest.restoreTestStatus = result.ok ? "passed" : "failed";
    manifest.restoreTestDetail = result.ok
      ? `Validated ${result.rowCount} rows across ${result.tableCount} tables without writing to production.`
      : result.warnings.slice(0, 3).join("; ");
    await saveBackupHistory(history);
    if (!result.ok) throw new Error(manifest.restoreTestDetail || "Restore validation failed");
    return result;
  } catch (error: any) {
    manifest.lastRestoreTestAt = new Date().toISOString();
    manifest.restoreTestStatus = "failed";
    manifest.restoreTestDetail = error?.message || "Restore validation failed";
    await saveBackupHistory(history);
    throw error;
  }
}

export async function getBackupDownloadUrl(id: string) {
  const manifest = (await getBackupHistory()).find(item => item.id === id);
  if (!manifest) throw new Error("Backup version not found");
  return storageGetSignedUrl(manifest.key);
}

export async function applyBackupRetention() {
  const config = await getBackupConfig();
  const history = (await getBackupHistory()).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const cutoff = Date.now() - config.retentionDays * 24 * 60 * 60 * 1000;
  const keep: BackupManifest[] = [];
  const remove: BackupManifest[] = [];
  for (const manifest of history) {
    if (keep.length < config.retentionCount && Date.parse(manifest.createdAt) >= cutoff) keep.push(manifest);
    else remove.push(manifest);
  }
  for (const manifest of remove) {
    await storageDelete(manifest.key).catch(error => console.error(`[Backup] Failed to delete expired backup ${manifest.key}:`, error));
  }
  if (remove.length > 0) await saveBackupHistory(keep);
  return { kept: keep.length, removed: remove.length };
}

export async function exportBackupForDownload() {
  const manifest = await createBackupSnapshot("manual");
  return {
    encrypted: true,
    manifest,
    downloadUrl: await storageGetSignedUrl(manifest.key),
    message: "Encrypted backup created. Use the signed URL or Backups panel to download the encrypted archive.",
  };
}

export async function getLatestBackupDownloadUrl(): Promise<string | null> {
  const history = await getBackupHistory();
  if (history.length === 0) return null;
  return storageGetSignedUrl(history[0].key);
}

export async function backupHandler(req: Request, res: Response) {
  try {
    if (!isAuthorizedCronRequest(req)) return res.status(403).json({ error: "cron-only" });
    const today = new Date().toISOString().slice(0, 10);
    if ((await db.getSiteSetting(LAST_SCHEDULED_DATE_KEY)) === today) {
      return res.json({ ok: true, skipped: "scheduled backup already created today", date: today });
    }
    const manifest = await createBackupSnapshot("scheduled");
    await db.setSiteSetting(LAST_SCHEDULED_DATE_KEY, today);
    await db.writeAuditLog({
      actorId: 0,
      actorName: "system",
      action: "backup.export",
      targetType: "system",
      targetId: manifest.id,
      metadata: { source: "external_cron", encrypted: true, checksumSha256: manifest.checksumSha256, key: manifest.key },
    });
    return res.json({ ok: true, manifest });
  } catch (err: any) {
    console.error("[Backup] Failed:", err);
    return res.status(500).json({ error: "Backup failed. Check server logs for details.", timestamp: new Date().toISOString() });
  }
}

export async function runScheduledBackupIfDue(now = new Date()) {
  const config = await getBackupConfig();
  if (!config.enabled) return { ran: false, reason: "disabled" } as const;
  const today = now.toISOString().slice(0, 10);
  const targetMinutes = config.hourUtc * 60 + config.minuteUtc;
  const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (currentMinutes < targetMinutes) return { ran: false, reason: "not_due" } as const;
  if ((await db.getSiteSetting(LAST_SCHEDULED_DATE_KEY)) === today) return { ran: false, reason: "already_ran" } as const;

  const manifest = await createBackupSnapshot("scheduled");
  await db.setSiteSetting(LAST_SCHEDULED_DATE_KEY, today);
  await db.writeAuditLog({
    actorId: 0,
    actorName: "system",
    action: "backup.export",
    targetType: "system",
    targetId: manifest.id,
    metadata: { source: "in_process_scheduler", encrypted: true, checksumSha256: manifest.checksumSha256, key: manifest.key },
  });
  return { ran: true, manifest } as const;
}

let schedulerStarted = false;
export function startBackupScheduler() {
  if (schedulerStarted || process.env.NODE_ENV === "test") return;
  schedulerStarted = true;
  const tick = () => runScheduledBackupIfDue().catch(error => console.error("[BackupScheduler]", error));
  const initial = setTimeout(tick, 15_000);
  initial.unref?.();
  const interval = setInterval(tick, 60_000);
  interval.unref?.();
}
