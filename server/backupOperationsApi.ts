import { Router, type Request, type Response } from "express";
import { AUDIT_EVENTS } from "../shared/audit-events";
import { getAuditRequestContext, writeAuditEvent } from "./audit";
import {
  applyBackupRetention,
  createBackupSnapshot,
  getBackupConfig,
  getBackupDownloadUrl,
  getBackupHistory,
  setBackupConfig,
  testRestoreBackup,
  verifyBackup,
  type BackupConfig,
} from "./backup";
import { isPrivilegedIpAllowed } from "./privilegedIp";
import { sdk } from "./_core/sdk";

export const backupOperationsRouter = Router();

async function requireAdmin(req: Request, res: Response) {
  const actor = await sdk.authenticateRequest(req);
  if (actor.role !== "admin") {
    res.status(403).json({ error: "Administrator access required." });
    return null;
  }
  if (!sdk.hasVerifiedSecondFactor(req)) {
    res.status(403).json({ error: "Two-factor authentication is required.", code: "MFA_REQUIRED" });
    return null;
  }
  if (!(await isPrivilegedIpAllowed(req))) {
    res.status(403).json({ error: "This IP address is not allowed to use privileged tools.", code: "IP_NOT_ALLOWED" });
    return null;
  }
  return actor;
}

function actorName(actor: { name?: string | null; email?: string | null }) {
  return actor.name || actor.email || "admin";
}

backupOperationsRouter.get("/", async (req, res) => {
  try {
    const actor = await requireAdmin(req, res);
    if (!actor) return;
    const [config, history] = await Promise.all([getBackupConfig(), getBackupHistory()]);
    return res.json({
      config,
      history,
      encryptionConfigured: !!(process.env.BACKUP_ENCRYPTION_KEY || process.env.STORAGE_SIGNING_SECRET || process.env.CLERK_SECRET_KEY),
      dedicatedEncryptionKey: !!process.env.BACKUP_ENCRYPTION_KEY,
      restoreProcedure: "/docs/BACKUP_RESTORE.md",
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to load backup state" });
  }
});

backupOperationsRouter.post("/run", async (req, res) => {
  try {
    const actor = await requireAdmin(req, res);
    if (!actor) return;
    const manifest = await createBackupSnapshot("manual");
    await writeAuditEvent({
      event: AUDIT_EVENTS.BACKUP_EXPORT,
      actorId: actor.id,
      actorName: actorName(actor),
      targetType: "system",
      targetId: manifest.id,
      payload: { source: "manual", encrypted: true, key: manifest.key, checksumSha256: manifest.checksumSha256 },
      ...getAuditRequestContext(req),
    });
    return res.json({ ok: true, manifest });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Backup creation failed" });
  }
});

backupOperationsRouter.put("/config", async (req, res) => {
  try {
    const actor = await requireAdmin(req, res);
    if (!actor) return;
    const current = await getBackupConfig();
    const next: BackupConfig = {
      enabled: typeof req.body?.enabled === "boolean" ? req.body.enabled : current.enabled,
      hourUtc: Number.isFinite(Number(req.body?.hourUtc)) ? Number(req.body.hourUtc) : current.hourUtc,
      minuteUtc: Number.isFinite(Number(req.body?.minuteUtc)) ? Number(req.body.minuteUtc) : current.minuteUtc,
      retentionCount: Number.isFinite(Number(req.body?.retentionCount)) ? Number(req.body.retentionCount) : current.retentionCount,
      retentionDays: Number.isFinite(Number(req.body?.retentionDays)) ? Number(req.body.retentionDays) : current.retentionDays,
    };
    const config = await setBackupConfig(next);
    const retention = await applyBackupRetention();
    await writeAuditEvent({
      event: AUDIT_EVENTS.BACKUP_CONFIG_UPDATE,
      actorId: actor.id,
      actorName: actorName(actor),
      targetType: "system",
      targetId: "backup-config",
      payload: { previous: current, next: config, retention },
      ...getAuditRequestContext(req),
    });
    return res.json({ ok: true, config, retention });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Backup configuration update failed" });
  }
});

backupOperationsRouter.post("/:id/verify", async (req, res) => {
  try {
    const actor = await requireAdmin(req, res);
    if (!actor) return;
    const result = await verifyBackup(req.params.id);
    await writeAuditEvent({
      event: AUDIT_EVENTS.BACKUP_VERIFY,
      actorId: actor.id,
      actorName: actorName(actor),
      targetType: "system",
      targetId: req.params.id,
      payload: { ok: result.ok, checksumSha256: result.checksumSha256 },
      ...getAuditRequestContext(req),
    });
    return res.json(result);
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Backup verification failed" });
  }
});

backupOperationsRouter.post("/:id/test-restore", async (req, res) => {
  try {
    const actor = await requireAdmin(req, res);
    if (!actor) return;
    const result = await testRestoreBackup(req.params.id);
    await writeAuditEvent({
      event: AUDIT_EVENTS.BACKUP_RESTORE_TEST,
      actorId: actor.id,
      actorName: actorName(actor),
      targetType: "system",
      targetId: req.params.id,
      payload: { ok: result.ok, rowCount: result.rowCount, tableCount: result.tableCount },
      ...getAuditRequestContext(req),
    });
    return res.json(result);
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Restore test failed" });
  }
});

backupOperationsRouter.get("/:id/download", async (req, res) => {
  try {
    const actor = await requireAdmin(req, res);
    if (!actor) return;
    const url = await getBackupDownloadUrl(req.params.id);
    await writeAuditEvent({
      event: AUDIT_EVENTS.BACKUP_DOWNLOAD,
      actorId: actor.id,
      actorName: actorName(actor),
      targetType: "system",
      targetId: req.params.id,
      payload: { signedUrlIssued: true },
      ...getAuditRequestContext(req),
    });
    return res.json({ url, expiresInSeconds: 900 });
  } catch (error: any) {
    return res.status(404).json({ error: error?.message || "Backup version not found" });
  }
});
