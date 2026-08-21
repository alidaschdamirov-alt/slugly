import type { Request, Response } from "express";
import * as core from "./backupCore";
import * as db from "./db";
import { isAuthorizedCronRequest } from "./_core/cronAuth";

export * from "./backupCore";

const LAST_SCHEDULED_DATE_KEY = "backup_last_scheduled_date";

export async function backupHandler(req: Request, res: Response) {
  try {
    if (!isAuthorizedCronRequest(req)) return res.status(403).json({ error: "cron-only" });
    const today = new Date().toISOString().slice(0, 10);
    if ((await db.getSiteSetting(LAST_SCHEDULED_DATE_KEY)) === today) {
      return res.json({ ok: true, skipped: "scheduled backup already created today", date: today });
    }

    const manifest = await core.createBackupSnapshot("scheduled");
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
  } catch (error: any) {
    console.error("[Backup] Failed:", error);
    return res.status(500).json({ error: "Backup failed. Check System Health for details.", timestamp: new Date().toISOString() });
  }
}
