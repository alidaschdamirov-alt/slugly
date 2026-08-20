import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { AUDIT_EVENTS } from '@shared/audit-events';
import { destinationUrlSchema } from '@shared/validation/destination-url';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import {
  getAuditRequestContext,
  getAutomaticAdminAuditDescriptor,
  writeAuditEvent,
} from "../audit";
import { isDestinationBlockedByPolicy } from "../blocklist";
import {
  clearLinkQuarantine,
  getLinkQuarantineState,
  quarantineLink,
} from "../linkQuarantine";
import { checkUrlSafety, type SafetyResult } from "../safeBrowsing";

const t = initTRPC.context<TrpcContext>().create({ transformer: superjson });
export const router = t.router;

const DESTINATION_PROCEDURES = new Set(["link.create", "link.update", "link.createBulk", "link.shortenAnonymous"]);

interface DestinationCandidate { url: string; linkId?: number; }

function assertDestinationUrl(value: unknown) {
  if (typeof value !== "string") return;
  const result = destinationUrlSchema.safeParse(value);
  if (!result.success) {
    throw new TRPCError({ code: "BAD_REQUEST", message: result.error.issues[0]?.message || "Enter a valid destination URL." });
  }
}

function getDestinationCandidates(path: string, rawInput: unknown): DestinationCandidate[] {
  if (!DESTINATION_PROCEDURES.has(path) || !rawInput || typeof rawInput !== "object") return [];
  const input = rawInput as Record<string, unknown>;
  if (path === "link.shortenAnonymous") return typeof input.url === "string" ? [{ url: input.url }] : [];
  if (path === "link.createBulk") {
    const items = Array.isArray(input.links) ? input.links : [];
    return items.flatMap(item => {
      if (!item || typeof item !== "object") return [];
      const destinationUrl = (item as Record<string, unknown>).destinationUrl;
      return typeof destinationUrl === "string" ? [{ url: destinationUrl }] : [];
    });
  }
  if (path === "link.create" && typeof input.destinationUrl === "string") return [{ url: input.destinationUrl }];
  if (path === "link.update" && typeof input.destinationUrl === "string") {
    return [{ url: input.destinationUrl, linkId: typeof input.id === "number" ? input.id : undefined }];
  }
  return [];
}

function validateDestinationInput(path: string, rawInput: unknown) {
  for (const candidate of getDestinationCandidates(path, rawInput)) assertDestinationUrl(candidate.url);
}

const validateDestinationUrls = t.middleware(async opts => {
  if (DESTINATION_PROCEDURES.has(opts.path)) validateDestinationInput(opts.path, await opts.getRawInput());
  return opts.next();
});

async function writeSafetyVerdictAudit(input: {
  ctx: TrpcContext;
  path: string;
  candidate: DestinationCandidate;
  safety: SafetyResult;
  event: typeof AUDIT_EVENTS.SAFETY_DESTINATION_REJECTED | typeof AUDIT_EVENTS.SAFETY_CHECK_UNKNOWN;
}) {
  const { ctx, path, candidate, safety, event } = input;
  await writeAuditEvent({
    event,
    actorId: ctx.user?.id ?? 0,
    actorName: ctx.user?.name || ctx.user?.email || (ctx.user ? "user" : "anonymous"),
    targetType: candidate.linkId ? "link" : "system",
    targetId: candidate.linkId ?? null,
    payload: { path, destinationUrl: candidate.url, verdict: safety.verdict, threatTypes: safety.threatTypes, reason: safety.reason },
    ...getAuditRequestContext(ctx.req),
  });
}

async function quarantineRejectedDestinationUpdate(ctx: TrpcContext, candidate: DestinationCandidate, safety: SafetyResult) {
  if (!ctx.user || !candidate.linkId) return;
  const { getLinkById } = await import("../db");
  const link = await getLinkById(candidate.linkId);
  if (!link || link.userId !== ctx.user.id) return;
  const reason = safety.reason || "Destination was flagged as unsafe";
  await quarantineLink({
    linkId: link.id,
    shortCode: link.shortCode,
    reason,
    threatTypes: safety.threatTypes,
    source: "destination-update",
    actorId: ctx.user.id,
    actorName: ctx.user.name || ctx.user.email || "user",
  });
  const { invalidateLinkCache } = await import("../redirect");
  invalidateLinkCache(link.shortCode);
  const { notifyOwner } = await import("./notification");
  await notifyOwner({
    title: "Unsafe destination update blocked",
    content: `Link #${link.id} /r/${link.shortCode} was quarantined after a destination update was flagged by the security layer. Reason: ${reason}`,
  }).catch(() => false);
}

async function releaseQuarantineAfterCleanUpdate(ctx: TrpcContext, candidate: DestinationCandidate) {
  if (!ctx.user || !candidate.linkId) return;
  const existing = await getLinkQuarantineState(candidate.linkId);
  if (!existing) return;
  const { getLinkById } = await import("../db");
  const link = await getLinkById(candidate.linkId);
  if (!link || link.userId !== ctx.user.id) return;
  await clearLinkQuarantine({
    linkId: link.id,
    shortCode: link.shortCode,
    actorId: ctx.user.id,
    actorName: ctx.user.name || ctx.user.email || "user",
    reason: "Owner replaced the destination with a clean URL",
  });
  const { invalidateLinkCache } = await import("../redirect");
  invalidateLinkCache(link.shortCode);
}

const enforceDestinationSafety = t.middleware(async opts => {
  if (!DESTINATION_PROCEDURES.has(opts.path)) return opts.next();
  const candidates = getDestinationCandidates(opts.path, await opts.getRawInput());
  const cleanUpdates: DestinationCandidate[] = [];
  for (const candidate of candidates) {
    const blockedByPolicy = await isDestinationBlockedByPolicy(candidate.url);
    const safety: SafetyResult = blockedByPolicy
      ? { safe: false, verdict: "malicious", threatTypes: ["BLOCKLIST"], reason: "Destination domain is blocked by Slugly security policy" }
      : await checkUrlSafety(candidate.url);

    if (safety.verdict === "unknown") {
      await writeSafetyVerdictAudit({ ctx: opts.ctx, path: opts.path, candidate, safety, event: AUDIT_EVENTS.SAFETY_CHECK_UNKNOWN })
        .catch(error => console.error("[Audit] Failed to record unknown Safe Browsing verdict:", error));
      continue;
    }
    if (safety.verdict === "malicious") {
      await writeSafetyVerdictAudit({ ctx: opts.ctx, path: opts.path, candidate, safety, event: AUDIT_EVENTS.SAFETY_DESTINATION_REJECTED })
        .catch(error => console.error("[Audit] Failed to record rejected destination:", error));
      if (opts.path === "link.update") await quarantineRejectedDestinationUpdate(opts.ctx, candidate, safety);
      throw new TRPCError({ code: "BAD_REQUEST", message: "This destination was flagged as unsafe and cannot be used." });
    }
    if (opts.path === "link.update" && safety.verdict === "clean") cleanUpdates.push(candidate);
  }

  const result = await opts.next();
  for (const candidate of cleanUpdates) {
    await releaseQuarantineAfterCleanUpdate(opts.ctx, candidate)
      .catch(error => console.error("[Quarantine] Failed to release a clean destination update:", error));
  }
  return result;
});

const baseProcedure = t.procedure.use(validateDestinationUrls).use(enforceDestinationSafety);
export const publicProcedure = baseProcedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  return next({ ctx: { ...ctx, user: ctx.user } });
});
export const protectedProcedure = baseProcedure.use(requireUser);

const requireWorkspace = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  if (!ctx.workspace || !ctx.membership) throw new TRPCError({ code: "FORBIDDEN", message: "No active workspace. Please select a workspace." });
  return next({ ctx: { ...ctx, user: ctx.user, workspace: ctx.workspace, membership: ctx.membership } });
});
export const workspaceProcedure = baseProcedure.use(requireWorkspace);

const requireEditor = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  if (!ctx.workspace || !ctx.membership) throw new TRPCError({ code: "FORBIDDEN", message: "No active workspace." });
  if (ctx.membership.role === "viewer") throw new TRPCError({ code: "FORBIDDEN", message: "You need editor access or higher to perform this action." });
  return next({ ctx: { ...ctx, user: ctx.user, workspace: ctx.workspace, membership: ctx.membership } });
});
export const editorProcedure = baseProcedure.use(requireEditor);

const requireWsAdmin = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  if (!ctx.workspace || !ctx.membership) throw new TRPCError({ code: "FORBIDDEN", message: "No active workspace." });
  if (ctx.membership.role !== "owner" && ctx.membership.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Workspace admin access required." });
  }
  return next({ ctx: { ...ctx, user: ctx.user, workspace: ctx.workspace, membership: ctx.membership } });
});
export const wsAdminProcedure = baseProcedure.use(requireWsAdmin);

export const adminProcedure = baseProcedure.use(t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user || ctx.user.role !== 'admin') throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  const rawInput = await opts.getRawInput().catch(() => undefined);
  const input = rawInput && typeof rawInput === "object" ? rawInput as Record<string, unknown> : {};
  const result = await next({ ctx: { ...ctx, user: ctx.user } });
  const procedureType = (opts as { type?: string }).type;
  if (procedureType === "mutation") {
    if (opts.path === "admin.addBlockedDomain" || opts.path === "admin.removeBlockedDomain") {
      const { invalidateBlocklistCache } = await import("../blocklist");
      invalidateBlocklistCache();
    }
    const descriptor = getAutomaticAdminAuditDescriptor(opts.path);
    if (descriptor) {
      const request = getAuditRequestContext(ctx.req);
      const reason = descriptor.reasonField && typeof input[descriptor.reasonField] === "string" ? String(input[descriptor.reasonField]) : undefined;
      try {
        await writeAuditEvent({
          event: descriptor.event,
          actorId: ctx.user.id,
          actorName: ctx.user.name || ctx.user.email || "admin",
          targetType: descriptor.targetType,
          targetId: descriptor.targetId?.(input, result) ?? null,
          payload: descriptor.payload?.(input, result),
          reason,
          ...request,
        });
      } catch (error) {
        console.error(`[Audit] Failed to record ${opts.path}:`, error);
      }
    }
  }
  return result;
}));
