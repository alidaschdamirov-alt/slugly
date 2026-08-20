import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { destinationUrlSchema } from '@shared/validation/destination-url';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import {
  getAuditRequestContext,
  getAutomaticAdminAuditDescriptor,
  writeAuditEvent,
} from "../audit";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;

const DESTINATION_PROCEDURES = new Set([
  "link.create",
  "link.update",
  "link.createBulk",
  "link.shortenAnonymous",
]);

function assertDestinationUrl(value: unknown) {
  if (typeof value !== "string") return;
  const result = destinationUrlSchema.safeParse(value);
  if (!result.success) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: result.error.issues[0]?.message || "Enter a valid destination URL.",
    });
  }
}

function validateDestinationInput(path: string, rawInput: unknown) {
  if (!DESTINATION_PROCEDURES.has(path) || !rawInput || typeof rawInput !== "object") return;
  const input = rawInput as Record<string, unknown>;

  if (path === "link.shortenAnonymous") {
    assertDestinationUrl(input.url);
    return;
  }

  if (path === "link.createBulk") {
    const items = Array.isArray(input.links) ? input.links : [];
    for (const item of items) {
      if (item && typeof item === "object") {
        assertDestinationUrl((item as Record<string, unknown>).destinationUrl);
      }
    }
    return;
  }

  if (path === "link.create") {
    assertDestinationUrl(input.destinationUrl);
    return;
  }

  if (path === "link.update" && input.destinationUrl !== undefined) {
    assertDestinationUrl(input.destinationUrl);
  }
}

const validateDestinationUrls = t.middleware(async opts => {
  if (DESTINATION_PROCEDURES.has(opts.path)) {
    const rawInput = await opts.getRawInput();
    validateDestinationInput(opts.path, rawInput);
  }
  return opts.next();
});

const baseProcedure = t.procedure.use(validateDestinationUrls);
export const publicProcedure = baseProcedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = baseProcedure.use(requireUser);

// Workspace-aware procedure: requires user + active workspace + membership
const requireWorkspace = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  if (!ctx.workspace || !ctx.membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No active workspace. Please select a workspace." });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      workspace: ctx.workspace,
      membership: ctx.membership,
    },
  });
});

export const workspaceProcedure = baseProcedure.use(requireWorkspace);

// Editor+ procedure: requires at least editor role in workspace
const requireEditor = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  if (!ctx.workspace || !ctx.membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No active workspace." });
  }
  if (ctx.membership.role === "viewer") {
    throw new TRPCError({ code: "FORBIDDEN", message: "You need editor access or higher to perform this action." });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      workspace: ctx.workspace,
      membership: ctx.membership,
    },
  });
});

export const editorProcedure = baseProcedure.use(requireEditor);

// Workspace admin procedure: requires admin or owner role
const requireWsAdmin = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  if (!ctx.workspace || !ctx.membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "No active workspace." });
  }
  if (ctx.membership.role !== "owner" && ctx.membership.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Workspace admin access required." });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      workspace: ctx.workspace,
      membership: ctx.membership,
    },
  });
});

export const wsAdminProcedure = baseProcedure.use(requireWsAdmin);

export const adminProcedure = baseProcedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    const rawInput = await opts.getRawInput().catch(() => undefined);
    const input = rawInput && typeof rawInput === "object"
      ? rawInput as Record<string, unknown>
      : {};

    const result = await next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });

    const procedureType = (opts as { type?: string }).type;
    if (procedureType === "mutation") {
      const descriptor = getAutomaticAdminAuditDescriptor(opts.path);
      if (descriptor) {
        const request = getAuditRequestContext(ctx.req);
        const reason = descriptor.reasonField && typeof input[descriptor.reasonField] === "string"
          ? String(input[descriptor.reasonField])
          : undefined;
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
  }),
);
