import type { User } from "../drizzle/schema";
import { AUDIT_EVENTS } from "../shared/audit-events";
import { getAuditRequestContext, writeAuditEvent } from "./audit";
import {
  adminGetAllUsersEnriched,
  getLinkByShortCode,
  getReports,
  getSiteSetting,
  getUserById,
  setSiteSetting,
  updateReportStatus,
} from "./db";
import { escapeHtml, sendEmail } from "./email";
import type { Request } from "express";

export type AbuseWorkflowStatus = "new" | "in_review" | "resolved" | "rejected";
export type AbusePriority = "low" | "normal" | "high" | "critical";
export type AppealStatus = "new" | "in_review" | "resolved" | "rejected";
export type LegalRequestStatus = "open" | "fulfilled" | "rejected";

export interface AbuseWorkflowMeta {
  reportId: number;
  status: AbuseWorkflowStatus;
  priority: AbusePriority;
  assigneeId: number | null;
  firstResponseAt: number | null;
  resolvedAt: number | null;
  lastResponseTemplate: string | null;
  lastResponseMessage: string | null;
  updatedAt: number;
  updatedBy: number | null;
}

export interface AppealRecord {
  id: string;
  reportId: number;
  userId: number;
  message: string;
  status: AppealStatus;
  decision: string | null;
  reviewerId: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface LegalRequestRecord {
  id: string;
  date: number;
  authority: string;
  basis: string;
  action: string;
  assigneeId: number | null;
  status: LegalRequestStatus;
  createdAt: number;
  updatedAt: number;
  createdBy: number;
}

const WORKFLOW_PREFIX = "abuse_workflow_";
const APPEALS_KEY = "abuse_appeals_v1";
const LEGAL_KEY = "legal_requests_v1";
const SLA_MS = 24 * 60 * 60 * 1000;

export const RESPONSE_TEMPLATES = [
  {
    id: "acknowledge",
    label: "Acknowledgement",
    subject: "[Slugly] We are reviewing your abuse report",
    body: "Thank you for reporting this Slugly link. Our Trust & Safety team has started a review and will update you when a decision is made.",
  },
  {
    id: "more_info",
    label: "Request more information",
    subject: "[Slugly] More information needed for your abuse report",
    body: "We are reviewing your report but need additional information or evidence before we can complete the investigation. Please reply with any relevant details.",
  },
  {
    id: "resolved",
    label: "Report resolved",
    subject: "[Slugly] Your abuse report has been resolved",
    body: "We completed our review and took the appropriate action under Slugly's policies. Thank you for helping us keep redirects safe.",
  },
  {
    id: "rejected",
    label: "Report rejected",
    subject: "[Slugly] Review completed — no policy violation found",
    body: "We completed our review and did not find sufficient evidence of a policy violation. If you are the affected link owner, you may submit an appeal from your account.",
  },
] as const;

function workflowKey(reportId: number) {
  return `${WORKFLOW_PREFIX}${reportId}`;
}

function legacyToWorkflow(status: string): AbuseWorkflowStatus {
  if (status === "reviewed") return "in_review";
  if (status === "actioned") return "resolved";
  if (status === "dismissed") return "rejected";
  return "new";
}

function workflowToLegacy(status: AbuseWorkflowStatus): "pending" | "reviewed" | "actioned" | "dismissed" {
  if (status === "in_review") return "reviewed";
  if (status === "resolved") return "actioned";
  if (status === "rejected") return "dismissed";
  return "pending";
}

async function readWorkflow(report: any): Promise<AbuseWorkflowMeta> {
  const raw = await getSiteSetting(workflowKey(report.id));
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as AbuseWorkflowMeta;
      if (parsed?.reportId === report.id) return parsed;
    } catch {
      // fallback below
    }
  }
  return {
    reportId: report.id,
    status: legacyToWorkflow(report.status),
    priority: "normal",
    assigneeId: null,
    firstResponseAt: report.status === "pending" ? null : new Date(report.createdAt).getTime(),
    resolvedAt: report.status === "actioned" || report.status === "dismissed" ? new Date(report.createdAt).getTime() : null,
    lastResponseTemplate: null,
    lastResponseMessage: null,
    updatedAt: new Date(report.createdAt).getTime(),
    updatedBy: null,
  };
}

async function writeWorkflow(meta: AbuseWorkflowMeta) {
  await setSiteSetting(workflowKey(meta.reportId), JSON.stringify(meta));
}

function enrichSla(report: any, meta: AbuseWorkflowMeta, staffMap: Map<number, any>) {
  const createdAt = new Date(report.createdAt).getTime();
  const dueAt = createdAt + SLA_MS;
  const closed = meta.status === "resolved" || meta.status === "rejected";
  const overdue = !closed && Date.now() > dueAt;
  return {
    ...report,
    workflow: meta,
    assignee: meta.assigneeId ? staffMap.get(meta.assigneeId) || null : null,
    sla: {
      dueAt,
      overdue,
      firstResponseAt: meta.firstResponseAt,
      responseTimeMs: meta.firstResponseAt ? Math.max(0, meta.firstResponseAt - createdAt) : null,
    },
  };
}

export async function listAbuseWorkflowReports() {
  const [reports, users] = await Promise.all([
    getReports(),
    adminGetAllUsersEnriched({}),
  ]);
  const staff = users.filter((user: any) => user.role === "admin" || user.role === "support");
  const staffMap = new Map<number, any>(staff.map((user: any) => [user.id, { id: user.id, name: user.name, email: user.email, role: user.role }]));
  const enriched = await Promise.all(reports.map(async report => enrichSla(report, await readWorkflow(report), staffMap)));
  return {
    reports: enriched,
    staff: Array.from(staffMap.values()),
    slaHours: 24,
  };
}

export async function updateAbuseWorkflow(input: {
  reportId: number;
  actor: User;
  req: Request;
  status?: AbuseWorkflowStatus;
  priority?: AbusePriority;
  assigneeId?: number | null;
}) {
  const reports = await getReports();
  const report = reports.find(item => item.id === input.reportId);
  if (!report) throw new Error("Report not found");
  const current = await readWorkflow(report);
  const next: AbuseWorkflowMeta = { ...current, updatedAt: Date.now(), updatedBy: input.actor.id };

  if (input.priority) next.priority = input.priority;
  if (input.assigneeId !== undefined) {
    if (input.assigneeId !== null) {
      const assignee = await getUserById(input.assigneeId);
      if (!assignee || (assignee.role !== "admin" && assignee.role !== "support")) {
        throw new Error("Assignee must be an admin or support user");
      }
    }
    next.assigneeId = input.assigneeId;
  }
  if (input.status) {
    next.status = input.status;
    if (input.status === "in_review" && !next.firstResponseAt) next.firstResponseAt = Date.now();
    if ((input.status === "resolved" || input.status === "rejected") && !next.firstResponseAt) next.firstResponseAt = Date.now();
    next.resolvedAt = input.status === "resolved" || input.status === "rejected" ? Date.now() : null;
    await updateReportStatus(report.id, workflowToLegacy(input.status));
  }

  await writeWorkflow(next);
  const request = getAuditRequestContext(input.req);
  if (input.assigneeId !== undefined && input.assigneeId !== current.assigneeId) {
    await writeAuditEvent({
      event: AUDIT_EVENTS.REPORT_ASSIGN,
      actorId: input.actor.id,
      actorName: input.actor.name || input.actor.email || input.actor.role,
      targetType: "report",
      targetId: report.id,
      payload: { from: current.assigneeId, to: input.assigneeId },
      ...request,
    });
  }
  if (input.status && input.status !== current.status) {
    await writeAuditEvent({
      event: AUDIT_EVENTS.REPORT_STATUS_CHANGE,
      actorId: input.actor.id,
      actorName: input.actor.name || input.actor.email || input.actor.role,
      targetType: "report",
      targetId: report.id,
      payload: { from: current.status, to: input.status, priority: next.priority },
      ...request,
    });
  }
  return next;
}

export async function sendAbuseReportResponse(input: {
  reportId: number;
  actor: User;
  req: Request;
  templateId: string;
  message?: string;
}) {
  const reports = await getReports();
  const report = reports.find(item => item.id === input.reportId);
  if (!report) throw new Error("Report not found");
  if (!report.reporterEmail) throw new Error("This report has no reporter email");
  const template = RESPONSE_TEMPLATES.find(item => item.id === input.templateId);
  if (!template) throw new Error("Unknown response template");
  const message = input.message?.trim() || template.body;

  const result = await sendEmail({
    to: report.reporterEmail,
    subject: template.subject,
    html: `<p>${escapeHtml(message).replace(/\n/g, "<br>")}</p><p style="color:#6b7280;font-size:12px">Report #${report.id} · /r/${escapeHtml(report.shortCode)}</p>`,
  });
  if (!result.success) throw new Error(result.error || "Failed to send response");

  const current = await readWorkflow(report);
  const next: AbuseWorkflowMeta = {
    ...current,
    firstResponseAt: current.firstResponseAt || Date.now(),
    lastResponseTemplate: template.id,
    lastResponseMessage: message,
    updatedAt: Date.now(),
    updatedBy: input.actor.id,
  };
  await writeWorkflow(next);
  await writeAuditEvent({
    event: AUDIT_EVENTS.REPORT_RESPONSE,
    actorId: input.actor.id,
    actorName: input.actor.name || input.actor.email || input.actor.role,
    targetType: "report",
    targetId: report.id,
    payload: { templateId: template.id, reporterEmail: report.reporterEmail, messageLength: message.length },
    ...getAuditRequestContext(input.req),
  });
  return { success: true, id: result.id, workflow: next };
}

async function readList<T>(key: string): Promise<T[]> {
  const raw = await getSiteSetting(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeList<T>(key: string, values: T[]) {
  await setSiteSetting(key, JSON.stringify(values.slice(-500)));
}

export async function submitAppeal(input: { reportId: number; actor: User; req: Request; message: string }) {
  const message = input.message.trim();
  if (message.length < 10 || message.length > 5000) throw new Error("Appeal must be 10-5000 characters");
  const reports = await getReports();
  const report = reports.find(item => item.id === input.reportId);
  if (!report) throw new Error("Report not found");
  const link = await getLinkByShortCode(report.shortCode);
  if (!link || link.userId !== input.actor.id) throw new Error("Only the affected link owner may appeal this report");

  const appeals = await readList<AppealRecord>(APPEALS_KEY);
  const openExisting = appeals.find(item => item.reportId === report.id && item.userId === input.actor.id && (item.status === "new" || item.status === "in_review"));
  if (openExisting) throw new Error("An appeal for this report is already open");
  const now = Date.now();
  const appeal: AppealRecord = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    reportId: report.id,
    userId: input.actor.id,
    message,
    status: "new",
    decision: null,
    reviewerId: null,
    createdAt: now,
    updatedAt: now,
  };
  appeals.push(appeal);
  await writeList(APPEALS_KEY, appeals);
  await writeAuditEvent({
    event: AUDIT_EVENTS.APPEAL_SUBMIT,
    actorId: input.actor.id,
    actorName: input.actor.name || input.actor.email || "user",
    targetType: "appeal",
    targetId: appeal.id,
    payload: { reportId: report.id, linkId: link.id },
    ...getAuditRequestContext(input.req),
  });
  return appeal;
}

export async function listAppeals() {
  return (await readList<AppealRecord>(APPEALS_KEY)).slice().reverse();
}

export async function decideAppeal(input: {
  appealId: string;
  actor: User;
  req: Request;
  status: AppealStatus;
  decision?: string;
}) {
  const appeals = await readList<AppealRecord>(APPEALS_KEY);
  const index = appeals.findIndex(item => item.id === input.appealId);
  if (index < 0) throw new Error("Appeal not found");
  const current = appeals[index];
  const next: AppealRecord = {
    ...current,
    status: input.status,
    decision: input.decision?.trim() || current.decision,
    reviewerId: input.actor.id,
    updatedAt: Date.now(),
  };
  appeals[index] = next;
  await writeList(APPEALS_KEY, appeals);
  await writeAuditEvent({
    event: AUDIT_EVENTS.APPEAL_DECIDE,
    actorId: input.actor.id,
    actorName: input.actor.name || input.actor.email || input.actor.role,
    targetType: "appeal",
    targetId: next.id,
    payload: { from: current.status, to: next.status, reportId: next.reportId },
    ...getAuditRequestContext(input.req),
  });
  return next;
}

export async function listLegalRequests() {
  return (await readList<LegalRequestRecord>(LEGAL_KEY)).slice().reverse();
}

export async function createLegalRequest(input: {
  actor: User;
  req: Request;
  date: number;
  authority: string;
  basis: string;
  action: string;
  assigneeId?: number | null;
}) {
  const authority = input.authority.trim();
  const basis = input.basis.trim();
  const action = input.action.trim();
  if (!authority || !basis || !action) throw new Error("Authority, legal basis and action are required");
  const requests = await readList<LegalRequestRecord>(LEGAL_KEY);
  const now = Date.now();
  const request: LegalRequestRecord = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    date: input.date,
    authority,
    basis,
    action,
    assigneeId: input.assigneeId ?? null,
    status: "open",
    createdAt: now,
    updatedAt: now,
    createdBy: input.actor.id,
  };
  requests.push(request);
  await writeList(LEGAL_KEY, requests);
  await writeAuditEvent({
    event: AUDIT_EVENTS.LEGAL_REQUEST_CREATE,
    actorId: input.actor.id,
    actorName: input.actor.name || input.actor.email || input.actor.role,
    targetType: "legal_request",
    targetId: request.id,
    payload: { authority, date: input.date, assigneeId: request.assigneeId },
    ...getAuditRequestContext(input.req),
  });
  return request;
}

export async function updateLegalRequest(input: {
  requestId: string;
  actor: User;
  req: Request;
  status?: LegalRequestStatus;
  assigneeId?: number | null;
  action?: string;
}) {
  const requests = await readList<LegalRequestRecord>(LEGAL_KEY);
  const index = requests.findIndex(item => item.id === input.requestId);
  if (index < 0) throw new Error("Legal request not found");
  const current = requests[index];
  const next: LegalRequestRecord = {
    ...current,
    status: input.status || current.status,
    assigneeId: input.assigneeId !== undefined ? input.assigneeId : current.assigneeId,
    action: input.action?.trim() || current.action,
    updatedAt: Date.now(),
  };
  requests[index] = next;
  await writeList(LEGAL_KEY, requests);
  await writeAuditEvent({
    event: AUDIT_EVENTS.LEGAL_REQUEST_UPDATE,
    actorId: input.actor.id,
    actorName: input.actor.name || input.actor.email || input.actor.role,
    targetType: "legal_request",
    targetId: next.id,
    payload: { fromStatus: current.status, toStatus: next.status, assigneeId: next.assigneeId },
    ...getAuditRequestContext(input.req),
  });
  return next;
}
