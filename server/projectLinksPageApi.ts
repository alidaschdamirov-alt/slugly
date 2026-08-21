import { Router, type Request, type Response } from "express";
import type { EffectiveLinkStatus } from "../shared/link-status";
import { resolveImpersonation } from "./impersonation";
import { loadProjectLinksPage, type ProjectLinksSortField } from "./projectLinksPage";
import { sdk } from "./_core/sdk";

export const projectLinksPageRouter = Router();

const STATUS_VALUES = new Set<EffectiveLinkStatus>([
  "active",
  "paused",
  "scheduled",
  "expired",
  "broken",
  "quarantine",
]);

function parsePositiveInt(value: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(max, Math.floor(parsed));
}

function readQueryString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

projectLinksPageRouter.get("/:projectId", async (req: Request, res: Response) => {
  try {
    const projectId = parsePositiveInt(req.params.projectId, 0);
    if (!projectId) return res.status(400).json({ error: "Invalid project id" });

    const actor = await sdk.authenticateRequest(req);
    const impersonation = await resolveImpersonation(req, actor);
    const user = impersonation?.target || actor;

    const requestedStatus = readQueryString(req.query.status);
    const status = STATUS_VALUES.has(requestedStatus as EffectiveLinkStatus)
      ? requestedStatus as EffectiveLinkStatus
      : null;
    const requestedSortField = readQueryString(req.query.sortField);
    const sortField: ProjectLinksSortField = ["createdAt", "shortCode", "clicks"].includes(requestedSortField)
      ? requestedSortField as ProjectLinksSortField
      : "createdAt";

    const result = await loadProjectLinksPage({
      userId: user.id,
      projectId,
      page: parsePositiveInt(req.query.page, 1, 100_000),
      limit: parsePositiveInt(req.query.limit, 50, 100),
      search: readQueryString(req.query.search),
      tag: readQueryString(req.query.tag),
      status,
      sortField,
      sortDir: readQueryString(req.query.sortDir) === "asc" ? "asc" : "desc",
    });

    if (!result) return res.status(404).json({ error: "Project not found" });
    return res.json(result);
  } catch (error: any) {
    const status = error?.code === "FORBIDDEN" ? 401 : 500;
    return res.status(status).json({ error: status === 500 ? "Failed to load project links" : error?.message || "Unauthorized" });
  }
});
