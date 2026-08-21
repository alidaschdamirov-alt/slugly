import { Router, type Request, type Response } from "express";
import { getUserById } from "./db";
import { createCleanupPreviewGate } from "./cleanupPreviewGate";
import { isPrivilegedIpAllowed } from "./privilegedIp";
import { listTrash, purgeFromTrash, restoreFromTrash } from "./softDelete";
import { sdk } from "./_core/sdk";

export const dangerousActionsRouter = Router();

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

function readType(value: unknown): "user" | "link" | null {
  return value === "user" || value === "link" ? value : null;
}

function readId(value: unknown) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

dangerousActionsRouter.get("/trash", async (req, res) => {
  try {
    const actor = await requireAdmin(req, res);
    if (!actor) return;
    const items = await listTrash();
    return res.json({ items, recoveryWindowDays: 30, now: Date.now() });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to load Trash" });
  }
});

dangerousActionsRouter.post("/trash/:type/:id/restore", async (req, res) => {
  try {
    const actor = await requireAdmin(req, res);
    if (!actor) return;
    const type = readType(req.params.type);
    const id = readId(req.params.id);
    if (!type || !id) return res.status(400).json({ error: "Invalid Trash item" });
    const record = await restoreFromTrash({
      type,
      id,
      actorId: actor.id,
      actorName: actor.name || actor.email || "admin",
      req,
    });
    return res.json({ ok: true, record });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Restore failed" });
  }
});

dangerousActionsRouter.post("/trash/:type/:id/purge", async (req, res) => {
  try {
    const actor = await requireAdmin(req, res);
    if (!actor) return;
    const type = readType(req.params.type);
    const id = readId(req.params.id);
    if (!type || !id) return res.status(400).json({ error: "Invalid Trash item" });
    const confirmation = typeof req.body?.confirmation === "string" ? req.body.confirmation : "";
    const reason = typeof req.body?.reason === "string" ? req.body.reason : "";
    const record = await purgeFromTrash({
      type,
      id,
      confirmation,
      reason,
      actorId: actor.id,
      actorName: actor.name || actor.email || "admin",
      req,
    });
    return res.json({ ok: true, record });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Permanent purge failed" });
  }
});

dangerousActionsRouter.post("/cleanup-expired/preview", async (req, res) => {
  try {
    const actor = await requireAdmin(req, res);
    if (!actor) return;
    const preview = await createCleanupPreviewGate(actor.id, req);
    return res.json({
      token: preview.token,
      count: preview.count,
      items: preview.items,
      expiresAt: preview.expiresAt,
      recoveryWindowDays: 30,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Cleanup preview failed" });
  }
});

dangerousActionsRouter.get("/confirmation/user/:id", async (req, res) => {
  try {
    const actor = await requireAdmin(req, res);
    if (!actor) return;
    const id = readId(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid user id" });
    const user = await getUserById(id);
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({ confirmation: user.email || user.name || `user-${user.id}` });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to load confirmation value" });
  }
});
