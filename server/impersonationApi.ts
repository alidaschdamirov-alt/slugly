import { Router, type Request, type Response } from "express";
import {
  clearImpersonationCookies,
  endImpersonation,
  getImpersonationStatus,
  listActiveImpersonationSessions,
  revokeImpersonationSession,
  startImpersonation,
} from "./impersonation";
import { sdk } from "./_core/sdk";
import { isPrivilegedRole } from "./adminAccess";
import { isPrivilegedIpAllowed } from "./privilegedIp";

export const impersonationRouter = Router();

async function getActor(req: Request) {
  return sdk.authenticateRequest(req);
}

async function requirePrivilegedNetwork(req: Request, res: Response) {
  if (!sdk.hasVerifiedSecondFactor(req)) {
    res.status(403).json({
      error: "Two-factor authentication is required for admin and support tools.",
      code: "MFA_REQUIRED",
    });
    return false;
  }
  if (!(await isPrivilegedIpAllowed(req))) {
    res.status(403).json({
      error: "This IP address is not allowed to use admin and support tools.",
      code: "IP_NOT_ALLOWED",
    });
    return false;
  }
  return true;
}

impersonationRouter.get("/status", async (req: Request, res: Response) => {
  try {
    const actor = await getActor(req);
    if (!isPrivilegedRole(actor.role)) {
      clearImpersonationCookies(res);
      return res.json({ active: false });
    }
    const session = await getImpersonationStatus(req, actor);
    if (!session) {
      clearImpersonationCookies(res);
      return res.json({ active: false });
    }
    return res.json({ active: true, session });
  } catch {
    clearImpersonationCookies(res);
    return res.status(401).json({ error: "Unauthorized" });
  }
});

impersonationRouter.post("/start", async (req: Request, res: Response) => {
  try {
    const actor = await getActor(req);
    if (!isPrivilegedRole(actor.role)) return res.status(403).json({ error: "Support or admin access required" });
    if (!(await requirePrivilegedNetwork(req, res))) return;

    const targetUserId = Number(req.body?.targetUserId);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({ error: "Invalid target user" });
    }

    const session = await startImpersonation({ actor, targetUserId, reason: req.body?.reason, req, res });
    return res.json({ ok: true, session });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Could not start View as user" });
  }
});

// Exit intentionally remains available even if MFA/IP state changes so a privileged
// operator can never become trapped in an impersonation session.
impersonationRouter.post("/exit", async (req: Request, res: Response) => {
  try {
    const actor = await getActor(req);
    await endImpersonation({ req, res, actor, reason: "manual-exit" });
    return res.json({ ok: true });
  } catch {
    clearImpersonationCookies(res);
    return res.json({ ok: true });
  }
});

impersonationRouter.get("/admin/sessions", async (req: Request, res: Response) => {
  try {
    const actor = await getActor(req);
    if (!isPrivilegedRole(actor.role)) return res.status(403).json({ error: "Forbidden" });
    if (!(await requirePrivilegedNetwork(req, res))) return;
    const sessions = await listActiveImpersonationSessions();
    return res.json({
      sessions: actor.role === "admin" ? sessions : sessions.filter(session => session.actorId === actor.id),
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to load active support sessions" });
  }
});

impersonationRouter.post("/admin/sessions/:id/revoke", async (req: Request, res: Response) => {
  try {
    const actor = await getActor(req);
    if (!isPrivilegedRole(actor.role)) return res.status(403).json({ error: "Forbidden" });
    if (!(await requirePrivilegedNetwork(req, res))) return;

    const sessions = await listActiveImpersonationSessions();
    const session = sessions.find(item => item.id === req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (actor.role !== "admin" && session.actorId !== actor.id) {
      return res.status(403).json({ error: "Support can revoke only its own sessions" });
    }

    await revokeImpersonationSession({ sessionId: session.id, actor, reason: req.body?.reason, req });
    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Failed to revoke support session" });
  }
});
