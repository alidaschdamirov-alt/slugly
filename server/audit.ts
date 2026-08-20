import type { Request } from "express";
import { TRPCError } from "@trpc/server";
import { writeAuditLog } from "./db";
import {
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
