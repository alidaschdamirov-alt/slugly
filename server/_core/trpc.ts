import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

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

export const protectedProcedure = t.procedure.use(requireUser);

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

export const workspaceProcedure = t.procedure.use(requireWorkspace);

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

export const editorProcedure = t.procedure.use(requireEditor);

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

export const wsAdminProcedure = t.procedure.use(requireWsAdmin);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
