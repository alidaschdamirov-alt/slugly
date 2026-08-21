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

const STATUS_SCAN_CHUNK_SIZE = 100;

async function addEffectiveStatus<T extends {
  id: number;
  status: string | null;
  activeFrom: number | null;
  expiresAt: number | null;
  destinationUrl: string;
  clickCount?: number | null;
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

  const requestedPage = Math.max(1, Math.floor(input.page));
  const limit = Math.min(100, Math.max(1, Math.floor(input.limit)));
  const search = (input.search || "").trim();
  const tag = (input.tag || "").trim();
  const sqlInput = {
    projectId: input.projectId,
    search,
    tag,
    sortField: input.sortField,
    sortDir: input.sortDir,
  } as const;

  // Normal project views page entirely in SQL: only the requested rows are sent
  // to Node even for unlimited projects, including global click sorting.
  if (!input.status) {
    const sqlPage = await queryProjectLinksSqlPage({
      ...sqlInput,
      page: requestedPage,
      limit,
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

  // Effective status can depend on URL validation and security quarantine state,
  // so it cannot be expressed purely in the links table. Scan SQL pages in
  // bounded chunks, preserve the requested global sort order, and retain only
  // the requested filtered page plus a one-page tail for out-of-range recovery.
  const firstRawPage = await queryProjectLinksSqlPage({
    ...sqlInput,
    page: 1,
    limit: STATUS_SCAN_CHUNK_SIZE,
  });
  const targetStart = (requestedPage - 1) * limit;
  const targetEnd = targetStart + limit;
  const targetItems: Array<Awaited<ReturnType<typeof addEffectiveStatus>>> = [];
  const tailItems: Array<Awaited<ReturnType<typeof addEffectiveStatus>>> = [];
  let matchedTotal = 0;

  const processRawItems = async (items: typeof firstRawPage.items) => {
    const enriched = await Promise.all(items.map(addEffectiveStatus));
    for (const link of enriched) {
      if (link.effectiveStatus !== input.status) continue;
      const matchIndex = matchedTotal;
      matchedTotal += 1;
      if (matchIndex >= targetStart && matchIndex < targetEnd) targetItems.push(link);
      tailItems.push(link);
      if (tailItems.length > limit) tailItems.shift();
    }
  };

  await processRawItems(firstRawPage.items);
  for (let rawPage = 2; rawPage <= firstRawPage.pageCount; rawPage += 1) {
    const nextRawPage = await queryProjectLinksSqlPage({
      ...sqlInput,
      page: rawPage,
      limit: STATUS_SCAN_CHUNK_SIZE,
    });
    await processRawItems(nextRawPage.items);
  }

  const filteredPageCount = Math.max(1, Math.ceil(matchedTotal / limit));
  const safePage = Math.min(requestedPage, filteredPageCount);
  let pageItems = targetItems;
  if (safePage !== requestedPage) {
    const lastPageSize = matchedTotal === 0 ? 0 : (matchedTotal % limit || limit);
    pageItems = lastPageSize > 0 ? tailItems.slice(-lastPageSize) : [];
  }

  return {
    projectId: input.projectId,
    items: pageItems.map(link => ({ ...link, clickCount: Number(link.clickCount || 0) })),
    pagination: paginationMeta(safePage, limit, matchedTotal, filteredPageCount),
    filters: {
      allTags: firstRawPage.allTags,
      search: search.toLowerCase(),
      tag: tag || null,
      status: input.status,
      sortField: input.sortField,
      sortDir: input.sortDir,
    },
  };
}
