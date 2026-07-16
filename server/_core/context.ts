import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User, Workspace, WorkspaceMember } from "../../drizzle/schema";
import { sdk } from "./sdk";
import {
  ensurePersonalWorkspace,
  getWorkspaceMemberships,
  getWorkspaceById,
  getMembership,
} from "../workspace";
import { claimAnonymousLinks } from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  workspace: Workspace | null;
  membership: WorkspaceMember | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let workspace: Workspace | null = null;
  let membership: WorkspaceMember | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  if (user) {
    const anonymousCodes = getAnonymousLinkCodes(opts.req.headers.cookie);
    if (anonymousCodes.length > 0) {
      await claimAnonymousLinks(anonymousCodes, user.id).catch(error => {
        console.error("[Auth] Failed to claim anonymous links:", error);
      });
      opts.res.clearCookie("anon_links", { path: "/" });
    }

    // Determine current workspace from header or default to personal workspace
    const wsIdHeader = opts.req.headers["x-workspace-id"];
    let workspaceId: number | null = null;

    if (wsIdHeader && !isNaN(Number(wsIdHeader))) {
      workspaceId = Number(wsIdHeader);
    } else {
      // Default: get user's first owned workspace (personal)
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
