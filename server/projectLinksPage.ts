import { getLinkStatus, type EffectiveLinkStatus } from "../shared/link-status";
import * as db from "./db";
import { getLinkQuarantineState } from "./linkQuarantine";
import { queryProjectLinksSqlPage } from "./projectLinksPageDb";

export type ProjectLinksSortField = "createdAt" | "clicks" | "shortCode";
export type ProjectLinksSortDir = "asc" | "desc";

export interface ProjectLinksPageInput {
  userId: number;
  projectId: number;
  page: number;
  limit: number;
  search?: string;
  tag?: string;
  status?: EffectiveLinkStatus | null;
  sortField: ProjectLinksSortField;
  sortDir: ProjectLinksSortDir;
}

function compareNullableText(a: string | null | undefined, b: string | null | undefined) {
  return String(a || "").localeCompare(String(b || ""));
}

async function addEffectiveStatus<T extends {
  id: number;
  status: string | null;
  activeFrom: number | null;
  expiresAt: number | null;
  destinationUrl: string;
}>(link: T) {
  const quarantine = await getLinkQuarantineState(link.id);
  return {
    ...link,
    effectiveStatus: getLinkStatus({ ...link, quarantined: !!quarantine }),
    quarantineReason: quarantine?.reason || null,
  };
}

function paginationMeta(page: number, limit: number, total: number, pageCount: number) {
  return {
    page,
    limit,
    total,
    pageCount,
    hasPreviousPage: page > 1,
    hasNextPage: page < pageCount,
  };
}

export async function loadProjectLinksPage(input: ProjectLinksPageInput) {
  const project = await db.getProjectById(input.projectId);
  if (!project || project.userId !== input.userId) return null;

  const page = Math.max(1, Math.floor(input.page));
  const limit = Math.min(100, Math.max(1, Math.floor(input.limit)));
  const search = (input.search || "").trim();
  const tag = (input.tag || "").trim();

  // All views without an effective-security-status filter stay inside SQL:
  // search, tag filters, created/short-code sorting, and global click sorting
  // page before data reaches Node, so unlimited projects remain bounded to one page.
  if (!input.status) {
    const sqlPage = await queryProjectLinksSqlPage({
      projectId: input.projectId,
      page,
      limit,
      search,
      tag,
      sortField: input.sortField,
      sortDir: input.sortDir,
    });
    const pageItems = await Promise.all(sqlPage.items.map(addEffectiveStatus));

    return {
      projectId: input.projectId,
      items: pageItems.map(link => ({ ...link, clickCount: Number(link.clickCount || 0) })),
      pagination: paginationMeta(sqlPage.page, limit, sqlPage.total, sqlPage.pageCount),
      filters: {
        allTags: sqlPage.allTags,
        search: search.toLowerCase(),
        tag: tag || null,
        status: null,
        sortField: input.sortField,
        sortDir: input.sortDir,
      },
    };
  }

  // Effective security statuses (especially broken/quarantine) are partly
  // derived from URL validation or state stored outside the links table.
  // Keep the compatibility path only for explicit status filters.
  const projectLinks = await db.getLinksByProjectId(input.projectId);
  const allTags = Array.from(new Set(
    projectLinks.flatMap(link => Array.isArray(link.tags) ? link.tags : [])
  )).sort((a, b) => a.localeCompare(b));
  const normalizedSearch = search.toLowerCase();

  let candidates = projectLinks.filter(link => {
    if (tag && !(Array.isArray(link.tags) && link.tags.includes(tag))) return false;
    if (!normalizedSearch) return true;
    return [link.shortCode, link.destinationUrl, link.title, link.utmSource, link.utmCampaign]
      .some(value => String(value || "").toLowerCase().includes(normalizedSearch));
  });

  const withStatus = await Promise.all(candidates.map(addEffectiveStatus));
  candidates = withStatus.filter(link => link.effectiveStatus === input.status);

  let clickCounts: Record<number, number> = {};
  if (input.sortField === "clicks") {
    clickCounts = candidates.length > 0
      ? await db.getClickCountsByLinkIds(candidates.map(link => link.id))
      : {};
  }

  candidates.sort((a, b) => {
    let comparison = 0;
    if (input.sortField === "shortCode") comparison = compareNullableText(a.shortCode, b.shortCode);
    else if (input.sortField === "clicks") comparison = (clickCounts[a.id] || 0) - (clickCounts[b.id] || 0);
    else comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (comparison === 0) comparison = a.id - b.id;
    return input.sortDir === "asc" ? comparison : -comparison;
  });

  const total = candidates.length;
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, pageCount);
  const offset = (safePage - 1) * limit;
  const pageItems = candidates.slice(offset, offset + limit);

  if (input.sortField !== "clicks") {
    clickCounts = pageItems.length > 0
      ? await db.getClickCountsByLinkIds(pageItems.map(link => link.id))
      : {};
  }

  return {
    projectId: input.projectId,
    items: pageItems.map(link => ({ ...link, clickCount: clickCounts[link.id] || 0 })),
    pagination: paginationMeta(safePage, limit, total, pageCount),
    filters: {
      allTags,
      search: normalizedSearch,
      tag: tag || null,
      status: input.status,
      sortField: input.sortField,
      sortDir: input.sortDir,
    },
  };
}
