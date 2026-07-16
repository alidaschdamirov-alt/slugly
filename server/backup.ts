import { Request, Response } from "express";
import * as db from "./db";
import { storagePutExact, storageGetSignedUrl } from "./storage";
import { isAuthorizedCronRequest } from "./_core/cronAuth";

/**
 * Backup system:
 * 1. Cron (POST /api/scheduled/backup): generates full dump, writes to S3, keeps last 30.
 * 2. Admin tRPC (admin.exportBackupNow): generates dump and returns JSON for immediate download.
 */

const BACKUP_RETENTION = 30;

export async function backupHandler(req: Request, res: Response) {
  try {
    if (!isAuthorizedCronRequest(req)) {
      return res.status(403).json({ error: "cron-only" });
    }

    const backup = await generateBackup();
    const jsonStr = JSON.stringify(backup);

    // Write to persistent storage with a date-based key
    const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const s3Key = `backups/slugly-${dateStr}.json`;

    const { key, url } = await storagePutExact(
      s3Key,
      jsonStr,
      "application/json"
    );

    // Track this backup in site_settings
    await db.setSiteSetting("last_backup_at", new Date().toISOString());
    await db.setSiteSetting("last_backup_size", String(jsonStr.length));
    await db.setSiteSetting("last_backup_key", key);
    await db.setSiteSetting("last_backup_url", url);

    // Maintain backup history (keep last 30)
    await rotateBackupHistory(key);

    res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      recordCount: backup.summary,
      storageKey: key,
    });
  } catch (err: any) {
    console.error("[Backup] Failed:", err);
    // Don't leak stack traces to HTTP response
    res.status(500).json({
      error: "Backup failed. Check server logs for details.",
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Generate a full backup for admin download (tRPC procedure).
 * Returns the backup object directly for the client to save as JSON.
 */
export async function exportBackupForDownload() {
  const backup = await generateBackup();
  const jsonStr = JSON.stringify(backup);

  // Also write to persistent storage as a snapshot
  const dateStr = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const s3Key = `backups/slugly-manual-${dateStr}.json`;

  try {
    await storagePutExact(s3Key, jsonStr, "application/json");
  } catch (e) {
    console.error(
      "[Backup] Storage write failed during manual export, returning data anyway:",
      e
    );
  }

  await db.setSiteSetting("last_backup_at", new Date().toISOString());
  await db.setSiteSetting("last_backup_size", String(jsonStr.length));

  return backup;
}

/**
 * Get a signed download URL for the latest backup.
 */
export async function getLatestBackupDownloadUrl(): Promise<string | null> {
  const lastKey = await db.getSiteSetting("last_backup_key");
  if (!lastKey) return null;
  try {
    return await storageGetSignedUrl(lastKey);
  } catch {
    return null;
  }
}

export async function generateBackup() {
  const database = await db.getDb();
  if (!database) throw new Error("Database not available");

  const {
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
  } = await import("../drizzle/schema");

  const [
    allUsers,
    allProjects,
    allLinks,
    allDomains,
    allRetiredCodes,
    allReports,
    allBlockedDomains,
    allSettings,
    allAuditLog,
  ] = await Promise.all([
    database.select().from(users),
    database.select().from(projects),
    database.select().from(links),
    database.select().from(domains),
    database.select().from(retiredCodes),
    database.select().from(reports),
    database.select().from(blockedDomains),
    database.select().from(siteSettings),
    database.select().from(auditLog),
  ]);

  // Get recent clicks (last 90 days to keep size manageable)
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const { gte } = await import("drizzle-orm");
  const recentClicks = await database
    .select()
    .from(clicks)
    .where(gte(clicks.timestamp, ninetyDaysAgo));

  return {
    exportedAt: new Date().toISOString(),
    version: "1.1",
    summary: {
      users: allUsers.length,
      projects: allProjects.length,
      links: allLinks.length,
      clicks: recentClicks.length,
      domains: allDomains.length,
      auditLog: allAuditLog.length,
    },
    data: {
      users: allUsers,
      projects: allProjects,
      links: allLinks, // Full link map: shortCode → destinationUrl (main asset)
      clicks: recentClicks,
      domains: allDomains,
      retiredCodes: allRetiredCodes,
      reports: allReports,
      blockedDomains: allBlockedDomains,
      siteSettings: allSettings,
      auditLog: allAuditLog,
    },
  };
}

/**
 * Keep only the last N backups in the history.
 * Since we can't list/delete S3 objects directly, we track keys in site_settings.
 */
async function rotateBackupHistory(newKey: string) {
  const historyRaw = await db.getSiteSetting("backup_history");
  let history: string[] = [];
  try {
    history = historyRaw ? JSON.parse(historyRaw) : [];
  } catch {
    history = [];
  }

  history.push(newKey);

  // Keep only last BACKUP_RETENTION entries
  if (history.length > BACKUP_RETENTION) {
    // Old keys are removed from history. Disk cleanup can be added independently.
    history = history.slice(-BACKUP_RETENTION);
  }

  await db.setSiteSetting("backup_history", JSON.stringify(history));
}
