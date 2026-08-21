import { Router, type Request, type Response } from "express";
import { getLinkStatus, type EffectiveLinkStatus } from "../shared/link-status";
import * as db from "./db";
import { resolveImpersonation } from "./impersonation";
import { getLinkQuarantineState } from "./linkQuarantine";
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

function compareNullableText(a: string | null | undefined, b: string | null | undefined) {
  return String(a || "").localeCompare(String(b || ""));
}

async function addEffectiveStatus<T extends { id: number; status: string | null; activeFrom: number | null; expiresAt: number | null; destinationUrl: string }>(link: T) {
  const quarantine = await getLinkQuarantineState(link.id);
  return {
    ...link,
    effectiveStatus: getLinkStatus({ ...link, quarantined: !!quarantine }),
    quarantineReason: quarantine?.reason || null,
  };
}

projectLinksPageRouter.get("/:projectId", async (req: Request, res: Response) => {
  try {
    const projectId = parsePositiveInt(req.params.projectId, 0);
    if (!projectId) return res.status(400).json({ error: "Invalid project id" });

    const actor = await sdk.authenticateRequest(req);
    const impersonation = await resolveImpersonation(req, actor);
    const user = impersonation?.target || actor;

    const project = await db.getProjectById(projectId);
    if (!project || project.userId !== user.id) {
      return res.status(404).json({ error: "Project not found" });
    }

    const page = parsePositiveInt(req.query.page, 1, 100_000);
    const limit = parsePositiveInt(req.query.limit, 50, 100);
    const search = readQueryString(req.query.search).toLowerCase();
    const tag = readQueryString(req.query.tag);
    const requestedStatus = readQueryString(req.query.status);
    const status = STATUS_VALUES.has(requestedStatus as EffectiveLinkStatus)
      ? requestedStatus as EffectiveLinkStatus
      : null;
    const sortField = ["createdAt", "shortCode", "clicks"].includes(readQueryString(req.query.sortField))
      ? readQueryString(req.query.sortField)
      : "createdAt";
    const sortDir = readQueryString(req.query.sortDir) === "asc" ? "asc" : "desc";

    const projectLinks = await db.getLinksByProjectId(projectId);
    const allTags = Array.from(new Set(
      projectLinks.flatMap(link => Array.isArray(link.tags) ? link.tags : [])
    )).sort((a, b) => a.localeCompare(b));

    let candidates = projectLinks.filter(link => {
      if (tag && !(Array.isArray(link.tags) && link.tags.includes(tag))) return false;
      if (!search) return true;
      return [
        link.shortCode,
        link.destinationUrl,
        link.title,
        link.utmSource,
        link.utmCampaign,
      ].some(value => String(value || "").toLowerCase().includes(search));
    });

    let enrichedAll: Array<Awaited<ReturnType<typeof addEffectiveStatus>>> | null = null;
    if (status) {
      enrichedAll = await Promise.all(candidates.map(addEffectiveStatus));
      enrichedAll = enrichedAll.filter(link => link.effectiveStatus === status);
      candidates = enrichedAll;
    }

    let clickCounts: Record<number, number> = {};
    if (sortField === "clicks") {
      clickCounts = candidates.length > 0
        ? await db.getClickCountsByLinkIds(candidates.map(link => link.id))
        : {};
    }

    candidates.sort((a, b) => {
      let comparison = 0;
      if (sortField === "shortCode") comparison = compareNullableText(a.shortCode, b.shortCode);
      else if (sortField === "clicks") comparison = (clickCounts[a.id] || 0) - (clickCounts[b.id] || 0);
      else comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (comparison === 0) comparison = a.id - b.id;
      return sortDir === "asc" ? comparison : -comparison;
    });

    const total = candidates.length;
    const pageCount = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, pageCount);
    const offset = (safePage - 1) * limit;
    const rawPageItems = candidates.slice(offset, offset + limit);
    const pageItems = status
      ? rawPageItems
      : await Promise.all(rawPageItems.map(addEffectiveStatus));

    if (sortField !== "clicks") {
      clickCounts = pageItems.length > 0
        ? await db.getClickCountsByLinkIds(pageItems.map(link => link.id))
        : {};
    }

    return res.json({
      projectId,
      items: pageItems.map(link => ({
        ...link,
        clickCount: clickCounts[link.id] || 0,
      })),
      pagination: {
        page: safePage,
        limit,
        total,
        pageCount,
        hasPreviousPage: safePage > 1,
        hasNextPage: safePage < pageCount,
      },
      filters: {
        allTags,
        search,
        tag: tag || null,
        status,
        sortField,
        sortDir,
      },
    });
  } catch (error: any) {
    const status = error?.code === "FORBIDDEN" ? 401 : 500;
    return res.status(status).json({ error: status === 500 ? "Failed to load project links" : error?.message || "Unauthorized" });
  }
});
