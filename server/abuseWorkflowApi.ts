import { Router, type Request, type Response } from "express";
import { isPrivilegedRole } from "./adminAccess";
import {
  RESPONSE_TEMPLATES,
  createLegalRequest,
  decideAppeal,
  listAbuseWorkflowReports,
  listAppeals,
  listLegalRequests,
  sendAbuseReportResponse,
  submitAppeal,
  updateAbuseWorkflow,
  updateLegalRequest,
  type AbusePriority,
  type AbuseWorkflowStatus,
  type AppealStatus,
  type LegalRequestStatus,
} from "./abuseWorkflow";
import { getLinksByUserId, getReports } from "./db";
import { resolveImpersonation } from "./impersonation";
import { isPrivilegedIpAllowed } from "./privilegedIp";
import { sdk } from "./_core/sdk";

export const abuseWorkflowRouter = Router();

type PrivilegedRole = "support" | "admin";

async function requirePrivileged(
  req: Request,
  res: Response,
  roles: readonly PrivilegedRole[] = ["support", "admin"]
) {
  const actor = await sdk.authenticateRequest(req);
  if (!isPrivilegedRole(actor.role) || !roles.includes(actor.role as PrivilegedRole)) {
    res.status(403).json({ error: "Forbidden" });
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

function asWorkflowStatus(value: unknown): AbuseWorkflowStatus | undefined {
  return value === "new" || value === "in_review" || value === "resolved" || value === "rejected" ? value : undefined;
}

function asPriority(value: unknown): AbusePriority | undefined {
  return value === "low" || value === "normal" || value === "high" || value === "critical" ? value : undefined;
}

function asAppealStatus(value: unknown): AppealStatus | undefined {
  return value === "new" || value === "in_review" || value === "resolved" || value === "rejected" ? value : undefined;
}

function asLegalStatus(value: unknown): LegalRequestStatus | undefined {
  return value === "open" || value === "fulfilled" || value === "rejected" ? value : undefined;
}

abuseWorkflowRouter.get("/queue", async (req, res) => {
  try {
    const actor = await requirePrivileged(req, res);
    if (!actor) return;
    return res.json({ ...(await listAbuseWorkflowReports()), role: actor.role, responseTemplates: RESPONSE_TEMPLATES });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to load abuse workflow" });
  }
});

abuseWorkflowRouter.patch("/reports/:id", async (req, res) => {
  try {
    const actor = await requirePrivileged(req, res);
    if (!actor) return;
    const reportId = Number(req.params.id);
    if (!Number.isInteger(reportId) || reportId <= 0) return res.status(400).json({ error: "Invalid report id" });

    const status = req.body?.status === undefined ? undefined : asWorkflowStatus(req.body.status);
    const priority = req.body?.priority === undefined ? undefined : asPriority(req.body.priority);
    if (req.body?.status !== undefined && !status) return res.status(400).json({ error: "Invalid workflow status" });
    if (req.body?.priority !== undefined && !priority) return res.status(400).json({ error: "Invalid priority" });
    const assigneeId = req.body?.assigneeId === undefined
      ? undefined
      : req.body.assigneeId === null || req.body.assigneeId === ""
        ? null
        : Number(req.body.assigneeId);
    if (assigneeId !== undefined && assigneeId !== null && (!Number.isInteger(assigneeId) || assigneeId <= 0)) {
      return res.status(400).json({ error: "Invalid assignee" });
    }

    const workflow = await updateAbuseWorkflow({ reportId, actor, req, status, priority, assigneeId });
    return res.json({ ok: true, workflow });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Failed to update abuse workflow" });
  }
});

abuseWorkflowRouter.post("/reports/:id/respond", async (req, res) => {
  try {
    const actor = await requirePrivileged(req, res);
    if (!actor) return;
    const reportId = Number(req.params.id);
    if (!Number.isInteger(reportId) || reportId <= 0) return res.status(400).json({ error: "Invalid report id" });
    const templateId = typeof req.body?.templateId === "string" ? req.body.templateId : "";
    const message = typeof req.body?.message === "string" ? req.body.message : undefined;
    return res.json(await sendAbuseReportResponse({ reportId, actor, req, templateId, message }));
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Failed to send abuse response" });
  }
});

abuseWorkflowRouter.get("/appeals", async (req, res) => {
  try {
    const actor = await requirePrivileged(req, res);
    if (!actor) return;
    return res.json({ appeals: await listAppeals(), role: actor.role });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to load appeals" });
  }
});

abuseWorkflowRouter.patch("/appeals/:id", async (req, res) => {
  try {
    const actor = await requirePrivileged(req, res);
    if (!actor) return;
    const status = asAppealStatus(req.body?.status);
    if (!status) return res.status(400).json({ error: "Invalid appeal status" });
    const decision = typeof req.body?.decision === "string" ? req.body.decision : undefined;
    const appeal = await decideAppeal({ appealId: req.params.id, actor, req, status, decision });
    return res.json({ ok: true, appeal });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Failed to update appeal" });
  }
});

abuseWorkflowRouter.get("/mine", async (req, res) => {
  try {
    const actor = await sdk.authenticateRequest(req);
    const impersonation = await resolveImpersonation(req, actor);
    const user = impersonation?.target || actor;
    const [reports, ownedLinks, appeals] = await Promise.all([getReports(), getLinksByUserId(user.id), listAppeals()]);
    const ownedCodes = new Set(ownedLinks.map(link => link.shortCode));
    const mine = reports
      .filter(report => ownedCodes.has(report.shortCode))
      .map(report => ({
        id: report.id,
        shortCode: report.shortCode,
        reason: report.reason,
        status: report.status,
        createdAt: report.createdAt,
        appeal: appeals.find(appeal => appeal.reportId === report.id && appeal.userId === user.id) || null,
        appealAllowed: report.status === "actioned" || report.status === "dismissed",
      }));
    return res.json({ reports: mine, readOnly: !!impersonation });
  } catch (error: any) {
    const status = error?.code === "FORBIDDEN" ? 401 : 500;
    return res.status(status).json({ error: status === 401 ? "Unauthorized" : "Failed to load appeals" });
  }
});

abuseWorkflowRouter.post("/appeals", async (req, res) => {
  try {
    const actor = await sdk.authenticateRequest(req);
    const impersonation = await resolveImpersonation(req, actor);
    if (impersonation) return res.status(403).json({ error: "Read-only support view cannot submit appeals." });
    const reportId = Number(req.body?.reportId);
    const message = typeof req.body?.message === "string" ? req.body.message : "";
    if (!Number.isInteger(reportId) || reportId <= 0) return res.status(400).json({ error: "Invalid report id" });
    const appeal = await submitAppeal({ reportId, actor, req, message });
    return res.json({ ok: true, appeal });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Failed to submit appeal" });
  }
});

abuseWorkflowRouter.get("/legal", async (req, res) => {
  try {
    const actor = await requirePrivileged(req, res);
    if (!actor) return;
    return res.json({ requests: await listLegalRequests(), role: actor.role });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to load legal requests" });
  }
});

abuseWorkflowRouter.post("/legal", async (req, res) => {
  try {
    const actor = await requirePrivileged(req, res, ["admin"]);
    if (!actor) return;
    const date = Number(req.body?.date || Date.now());
    const authority = typeof req.body?.authority === "string" ? req.body.authority : "";
    const basis = typeof req.body?.basis === "string" ? req.body.basis : "";
    const action = typeof req.body?.action === "string" ? req.body.action : "";
    const assigneeId = req.body?.assigneeId === undefined || req.body?.assigneeId === null || req.body?.assigneeId === ""
      ? null
      : Number(req.body.assigneeId);
    if (!Number.isFinite(date)) return res.status(400).json({ error: "Invalid request date" });
    if (assigneeId !== null && (!Number.isInteger(assigneeId) || assigneeId <= 0)) return res.status(400).json({ error: "Invalid assignee" });
    const request = await createLegalRequest({ actor, req, date, authority, basis, action, assigneeId });
    return res.json({ ok: true, request });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Failed to create legal request" });
  }
});

abuseWorkflowRouter.patch("/legal/:id", async (req, res) => {
  try {
    const actor = await requirePrivileged(req, res, ["admin"]);
    if (!actor) return;
    const status = req.body?.status === undefined ? undefined : asLegalStatus(req.body.status);
    if (req.body?.status !== undefined && !status) return res.status(400).json({ error: "Invalid legal request status" });
    const assigneeId = req.body?.assigneeId === undefined
      ? undefined
      : req.body.assigneeId === null || req.body.assigneeId === ""
        ? null
        : Number(req.body.assigneeId);
    if (assigneeId !== undefined && assigneeId !== null && (!Number.isInteger(assigneeId) || assigneeId <= 0)) return res.status(400).json({ error: "Invalid assignee" });
    const action = typeof req.body?.action === "string" ? req.body.action : undefined;
    const request = await updateLegalRequest({ requestId: req.params.id, actor, req, status, assigneeId, action });
    return res.json({ ok: true, request });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Failed to update legal request" });
  }
});
