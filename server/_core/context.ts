import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User, Workspace, WorkspaceMember } from "../../drizzle/schema";
import { sdk } from "./sdk";
import {
  ensurePersonalWorkspace,
  getWorkspaceById,
  getMembership,
} from "../workspace";
import { claimAnonymousLinks } from "../db";
import { resolveImpersonation, type ImpersonationSession } from "../impersonation";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  actorUser: User | null;
  impersonation: ImpersonationSession | null;
  workspace: Workspace | null;
  membership: WorkspaceMember | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let actorUser: User | null = null;
  let impersonation: ImpersonationSession | null = null;
  let workspace: Workspace | null = null;
  let membership: WorkspaceMember | null = null;

  try {
    actorUser = await sdk.authenticateRequest(opts.req);
    const resolved = await resolveImpersonation(opts.req, actorUser);
    if (resolved) {
      user = resolved.target;
      impersonation = resolved.session;
    } else {
      user = actorUser;
    }
  } catch {
    user = null;
    actorUser = null;
  }

  if (user) {
    // Never claim anonymous links while support/admin is viewing another account.
    if (!impersonation) {
      const anonymousCodes = getAnonymousLinkCodes(opts.req.headers.cookie);
      if (anonymousCodes.length > 0) {
        await claimAnonymousLinks(anonymousCodes, user.id).catch(error => {
          console.error("[Auth] Failed to claim anonymous links:", error);
        });
        opts.res.clearCookie("anon_links", { path: "/" });
      }
    }

    const wsIdHeader = opts.req.headers["x-workspace-id"];
    let workspaceId: number | null = null;

    if (wsIdHeader && !isNaN(Number(wsIdHeader))) {
      const requestedId = Number(wsIdHeader);
      const requestedMembership = await getMembership(requestedId, user.id);
      if (requestedMembership) workspaceId = requestedId;
    }

    if (!workspaceId) {
      workspaceId = await ensurePersonalWorkspace(user.id, user.name);
    }

    if (workspaceId) {
      const [ws, mem] = await Promise.all([
        getWorkspaceById(workspaceId),
        getMembership(workspaceId, user.id),
      ]);
      if (ws && mem) {
        workspace = ws;
        membership = mem;
      }
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    actorUser,
    impersonation,
    workspace,
    membership,
  };
}

function getAnonymousLinkCodes(cookieHeader?: string): string[] {
  if (!cookieHeader) return [];
  const rawValue = cookieHeader.match(/(?:^|;\s*)anon_links=([^;]+)/)?.[1];
  if (!rawValue) return [];
  return decodeURIComponent(rawValue)
    .split(",")
    .map(code => code.trim())
    .filter(Boolean);
}
