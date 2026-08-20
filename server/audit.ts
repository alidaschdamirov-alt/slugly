import type { Request } from "express";
import { TRPCError } from "@trpc/server";
import { writeAuditLog } from "./db";
import {
  AUDIT_EVENTS,
  auditEventRequiresReason,
  type AuditEntry,
  type AuditEvent,
  type AuditTargetType,
} from "../shared/audit-events";

export interface AuditRequestContext {
  ip?: string;
  userAgent?: string;
}

export function getAuditRequestContext(req?: Request | null): AuditRequestContext {
  if (!req) return {};
  const forwarded = req.headers["x-forwarded-for"];
  const ip = Array.isArray(forwarded)
    ? forwarded[0]
    : typeof forwarded === "string"
      ? forwarded.split(",")[0]?.trim()
      : req.ip;
  const userAgent = req.get?.("user-agent") || req.headers["user-agent"];
  return {
    ip: ip || undefined,
    userAgent: typeof userAgent === "string" ? userAgent.slice(0, 1000) : undefined,
  };
}

export function requireAuditReason(event: AuditEvent, reason?: string | null): string | undefined {
  const normalized = reason?.trim();
  if (auditEventRequiresReason(event) && !normalized) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A reason is required for this administrative action.",
    });
  }
  return normalized || undefined;
}

export async function writeAuditEvent(entry: AuditEntry): Promise<void> {
  const reason = requireAuditReason(entry.event, entry.reason);
  await writeAuditLog({
    actorId: entry.actorId,
    actorName: entry.actorName || null,
    action: entry.event,
    targetType: entry.targetType,
    targetId: entry.targetId === null ? null : String(entry.targetId),
    metadata: {
      ...(entry.payload || {}),
      ...(reason ? { reason } : {}),
      ...(entry.ip ? { ip: entry.ip } : {}),
      ...(entry.userAgent ? { userAgent: entry.userAgent } : {}),
    },
  });
}

export interface AdminAuditDescriptor {
  event: AuditEvent;
  targetType: AuditTargetType;
  targetId?: (input: Record<string, unknown>, result: unknown) => string | number | null;
  payload?: (input: Record<string, unknown>, result: unknown) => Record<string, unknown> | undefined;
  reasonField?: string;
}

/**
 * Legacy admin mutations already write their own audit record inside the router
 * or service layer. The central middleware skips these to avoid duplicate rows.
 * Any new admin mutation that is not listed here gets a generic admin.mutation
 * record automatically, so an unaudited admin write cannot be added silently.
 */
export const MANUALLY_AUDITED_ADMIN_PATHS = new Set([
  "admin.updateReport",
  "admin.disableLink",
  "admin.deleteLink",
  "admin.cleanupExpiredAnonymous",
  "admin.suspendUser",
  "admin.unsuspendUser",
  "admin.banUser",
  "admin.overridePlan",
  "admin.setRole",
  "admin.deleteUser",
  "admin.addBlockedDomain",
  "admin.removeBlockedDomain",
  "admin.updateSiteSettings",
  "admin.updatePlanConfigs",
  "admin.updatePlanLimits",
  "admin.overrideWorkspacePlan",
  "admin.updateReservedSlugs",
  "admin.exportBackup",
  "admin.updateEmailConfig",
  "admin.saveTemplate",
]);

const SPECIFIC_AUTO_AUDIT: Record<string, AdminAuditDescriptor> = {
  "admin.previewTemplate": {
    event: AUDIT_EVENTS.EMAIL_TEMPLATE_PREVIEW,
    targetType: "email_template",
    targetId: input => (typeof input.type === "string" ? input.type : null),
  },
  "admin.sendTestEmail": {
    event: AUDIT_EVENTS.EMAIL_TEST_SEND,
    targetType: "system",
    payload: input => ({
      templateType: input.templateType,
      to: input.to,
    }),
  },
};

export function getAutomaticAdminAuditDescriptor(path: string): AdminAuditDescriptor | null {
  if (!path.startsWith("admin.")) return null;
  if (MANUALLY_AUDITED_ADMIN_PATHS.has(path)) return null;
  return (
    SPECIFIC_AUTO_AUDIT[path] || {
      event: AUDIT_EVENTS.ADMIN_MUTATION,
      targetType: "system",
      payload: input => ({ path, inputKeys: Object.keys(input) }),
    }
  );
}
