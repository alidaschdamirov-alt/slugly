import { createHash, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import type { Request, Response } from "express";
import { like } from "drizzle-orm";
import type { User } from "../drizzle/schema";
import { siteSettings } from "../drizzle/schema";
import { AUDIT_EVENTS } from "../shared/audit-events";
import { getAuditRequestContext, writeAuditEvent } from "./audit";
import { getDb, getUserById, getSiteSetting, setSiteSetting } from "./db";

export const IMPERSONATION_COOKIE = "slugly_impersonation";
export const IMPERSONATION_ACTIVE_COOKIE = "slugly_impersonation_active";
export const IMPERSONATION_DURATION_MS = 30 * 60 * 1000;

export interface ImpersonationSession {
  id: string;
  actorId: number;
  actorEmail: string | null;
  actorRole: "support" | "admin";
  targetUserId: number;
  targetEmail: string | null;
  reason: string;
  readOnly: true;
  createdAt: number;
  expiresAt: number;
  tokenHash: string;
  revokedAt: number | null;
  actorIp?: string | null;
  userAgent?: string | null;
}

export interface ResolvedImpersonation {
  session: ImpersonationSession;
  actor: User;
  target: User;
}

function sessionKey(id: string) {
  return `impersonation_session_${id}`;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function safeHashEqual(actual: string, expected: string) {
  const a = Buffer.from(actual, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseCookie(header: string | undefined, key: string) {
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|;\\s*)${key}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function normalizeReason(reason: unknown) {
  if (typeof reason !== "string") return null;
  const value = reason.trim();
  return value.length >= 3 && value.length <= 1000 ? value : null;
}

function assertSupportActor(actor: User): asserts actor is User & { role: "support" | "admin" } {
  if (actor.role !== "admin" && actor.role !== "support") {
    throw new Error("Support or admin access required");
  }
}

function cookieOptions(maxAge: number) {
  return {
    maxAge,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

export async function startImpersonation(input: {
  actor: User;
  targetUserId: number;
  reason: unknown;
  req: Request;
  res: Response;
}) {
  assertSupportActor(input.actor);
  const reason = normalizeReason(input.reason);
  if (!reason) throw new Error("A reason is required (3-1000 characters).");

  const target = await getUserById(input.targetUserId);
  if (!target) throw new Error("User not found");
  if (target.id === input.actor.id) throw new Error("You cannot impersonate your own account");
  if (target.role === "admin" || target.role === "support") {
    throw new Error("Privileged accounts cannot be impersonated");
  }

  const id = randomUUID();
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  const requestContext = getAuditRequestContext(input.req);
  const session: ImpersonationSession = {
    id,
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    actorRole: input.actor.role,
    targetUserId: target.id,
    targetEmail: target.email,
    reason,
    readOnly: true,
    createdAt: now,
    expiresAt: now + IMPERSONATION_DURATION_MS,
    tokenHash: hashToken(token),
    revokedAt: null,
    actorIp: requestContext.ip || null,
    userAgent: requestContext.userAgent || null,
  };

  await setSiteSetting(sessionKey(id), JSON.stringify(session));
  input.res.cookie(IMPERSONATION_COOKIE, `${id}.${token}`, cookieOptions(IMPERSONATION_DURATION_MS));
  input.res.cookie(IMPERSONATION_ACTIVE_COOKIE, "1", {
    maxAge: IMPERSONATION_DURATION_MS,
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  await writeAuditEvent({
    event: AUDIT_EVENTS.USER_IMPERSONATE,
    actorId: input.actor.id,
    actorName: input.actor.email || input.actor.name || "support",
    targetType: "user",
    targetId: target.id,
    reason,
    payload: {
      sessionId: id,
      actor: input.actor.email,
      on_behalf_of: target.email,
      readOnly: true,
      expiresAt: session.expiresAt,
    },
    ...requestContext,
  });

  return publicSession(session);
}

function publicSession(session: ImpersonationSession) {
  return {
    id: session.id,
    actorId: session.actorId,
    actorEmail: session.actorEmail,
    actorRole: session.actorRole,
    targetUserId: session.targetUserId,
    targetEmail: session.targetEmail,
    reason: session.reason,
    readOnly: session.readOnly,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt,
    actorIp: session.actorIp || null,
    userAgent: session.userAgent || null,
  };
}

export async function resolveImpersonation(req: Request, actor: User): Promise<ResolvedImpersonation | null> {
  if (actor.role !== "admin" && actor.role !== "support") return null;
  const raw = parseCookie(req.headers.cookie, IMPERSONATION_COOKIE);
  if (!raw) return null;
  const separator = raw.indexOf(".");
  if (separator <= 0) return null;

  const id = raw.slice(0, separator);
  const token = raw.slice(separator + 1);
  if (!id || !token) return null;

  const stored = await getSiteSetting(sessionKey(id));
  if (!stored) return null;
  let session: ImpersonationSession;
  try {
    session = JSON.parse(stored) as ImpersonationSession;
  } catch {
    return null;
  }

  if (session.actorId !== actor.id || session.revokedAt || session.expiresAt <= Date.now()) return null;
  if (!safeHashEqual(hashToken(token), session.tokenHash)) return null;

  const target = await getUserById(session.targetUserId);
  if (!target || target.role !== "user") return null;
  return { session, actor, target };
}

export async function getImpersonationStatus(req: Request, actor: User) {
  const resolved = await resolveImpersonation(req, actor);
  return resolved ? publicSession(resolved.session) : null;
}

export async function endImpersonation(input: {
  req: Request;
  res: Response;
  actor: User;
  reason?: string;
}) {
  const resolved = await resolveImpersonation(input.req, input.actor);
  if (resolved) {
    const session = { ...resolved.session, revokedAt: Date.now() };
    await setSiteSetting(sessionKey(session.id), JSON.stringify(session));
    await writeAuditEvent({
      event: AUDIT_EVENTS.USER_IMPERSONATE_EXIT,
      actorId: input.actor.id,
      actorName: input.actor.email || input.actor.name || "support",
      targetType: "user",
      targetId: session.targetUserId,
      payload: {
        sessionId: session.id,
        actor: session.actorEmail,
        on_behalf_of: session.targetEmail,
        reason: input.reason || "manual-exit",
      },
      ...getAuditRequestContext(input.req),
    });
  }
  clearImpersonationCookies(input.res);
}

export function clearImpersonationCookies(res: Response) {
  res.clearCookie(IMPERSONATION_COOKIE, { path: "/" });
  res.clearCookie(IMPERSONATION_ACTIVE_COOKIE, { path: "/" });
}

export async function listActiveImpersonationSessions() {
  const database = await getDb();
  if (!database) return [];
  const rows = await database
    .select({ key: siteSettings.key, value: siteSettings.value })
    .from(siteSettings)
    .where(like(siteSettings.key, "impersonation_session_%"));
  const now = Date.now();
  return rows.flatMap(row => {
    if (!row.value) return [];
    try {
      const session = JSON.parse(row.value) as ImpersonationSession;
      if (session.revokedAt || session.expiresAt <= now) return [];
      return [publicSession(session)];
    } catch {
      return [];
    }
  }).sort((a, b) => b.createdAt - a.createdAt);
}

export async function revokeImpersonationSession(input: {
  sessionId: string;
  actor: User;
  reason: unknown;
  req: Request;
}) {
  assertSupportActor(input.actor);
  const reason = normalizeReason(input.reason);
  if (!reason) throw new Error("A reason is required (3-1000 characters).");
  const stored = await getSiteSetting(sessionKey(input.sessionId));
  if (!stored) throw new Error("Session not found");
  const session = JSON.parse(stored) as ImpersonationSession;
  if (!session.revokedAt) {
    session.revokedAt = Date.now();
    await setSiteSetting(sessionKey(session.id), JSON.stringify(session));
  }
  await writeAuditEvent({
    event: AUDIT_EVENTS.USER_IMPERSONATE_EXIT,
    actorId: input.actor.id,
    actorName: input.actor.email || input.actor.name || "support",
    targetType: "user",
    targetId: session.targetUserId,
    reason,
    payload: {
      sessionId: session.id,
      actor: session.actorEmail,
      on_behalf_of: session.targetEmail,
      revokedBy: input.actor.email,
    },
    ...getAuditRequestContext(input.req),
  });
}
