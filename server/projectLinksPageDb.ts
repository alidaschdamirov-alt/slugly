import { and, asc, count, desc, eq, like, notInArray, or, sql } from "drizzle-orm";
import { links } from "../drizzle/schema";
import { getDb } from "./dbCore";
import { listTrash } from "./softDelete";

export interface ProjectLinksSqlPageInput {
  projectId: number;
  page: number;
  limit: number;
  search?: string;
  tag?: string;
  sortField: "createdAt" | "shortCode";
  sortDir: "asc" | "desc";
}

async function getSoftDeletedLinkIds() {
  const trash = await listTrash();
  return trash.filter(item => item.type === "link").map(item => item.id);
}

function buildConditions(input: ProjectLinksSqlPageInput, deletedIds: number[]) {
  const conditions = [eq(links.projectId, input.projectId)];
  if (deletedIds.length > 0) conditions.push(notInArray(links.id, deletedIds));

  const search = (input.search || "").trim();
  if (search) {
    const value = `%${search}%`;
    conditions.push(or(
      like(links.shortCode, value),
      like(links.destinationUrl, value),
      like(links.title, value),
      like(links.utmSource, value),
      like(links.utmCampaign, value),
    )!);
  }

  const tag = (input.tag || "").trim();
  if (tag) conditions.push(sql`JSON_CONTAINS(${links.tags}, JSON_QUOTE(${tag}))`);
  return conditions;
}

export async function queryProjectLinksSqlPage(input: ProjectLinksSqlPageInput) {
  const database = await getDb();
  if (!database) return { items: [], total: 0, page: 1, pageCount: 1, allTags: [] as string[] };

  const deletedIds = await getSoftDeletedLinkIds();
  const conditions = buildConditions(input, deletedIds);
  const [totalRow] = await database
    .select({ value: count() })
    .from(links)
    .where(and(...conditions));
  const total = Number(totalRow?.value || 0);
  const pageCount = Math.max(1, Math.ceil(total / input.limit));
  const page = Math.min(Math.max(1, input.page), pageCount);

  const sortColumn = input.sortField === "shortCode" ? links.shortCode : links.createdAt;
  const order = input.sortDir === "asc" ? asc(sortColumn) : desc(sortColumn);
  const tieBreaker = input.sortDir === "asc" ? asc(links.id) : desc(links.id);
  const items = await database
    .select()
    .from(links)
    .where(and(...conditions))
    .orderBy(order, tieBreaker)
    .limit(input.limit)
    .offset((page - 1) * input.limit);

  const tagConditions = [eq(links.projectId, input.projectId)];
  if (deletedIds.length > 0) tagConditions.push(notInArray(links.id, deletedIds));
  const tagRows = await database
    .select({ tags: links.tags })
    .from(links)
    .where(and(...tagConditions));
  const allTags = Array.from(new Set(
    tagRows.flatMap(row => Array.isArray(row.tags) ? row.tags : [])
  )).sort((a, b) => a.localeCompare(b));

  return { items, total, page, pageCount, allTags };
}
