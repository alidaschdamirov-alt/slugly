import { and, desc, eq, inArray, or } from "drizzle-orm";
import { links, projects, workspaceMembers } from "../drizzle/schema";
import { getDb } from "./db";

async function workspaceScope(workspaceId: number) {
  const database = await getDb();
  if (!database) return { database: null, projectIds: [] as number[], memberIds: [] as number[] };
  const [projectRows, memberRows] = await Promise.all([
    database.select({ id: projects.id }).from(projects).where(eq(projects.workspaceId, workspaceId)),
    database.select({ userId: workspaceMembers.userId }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId)),
  ]);
  return {
    database,
    projectIds: projectRows.map(row => row.id),
    memberIds: memberRows.map(row => row.userId),
  };
}

async function scopedLinks(workspaceId: number, linkIds: number[]) {
  const uniqueIds = Array.from(new Set(linkIds.filter(id => Number.isInteger(id) && id > 0))).slice(0, 500);
  if (uniqueIds.length === 0) return [];
  const scope = await workspaceScope(workspaceId);
  if (!scope.database) return [];

  const ownership = [];
  if (scope.projectIds.length > 0) ownership.push(inArray(links.projectId, scope.projectIds));
  if (scope.memberIds.length > 0) ownership.push(inArray(links.userId, scope.memberIds));
  if (ownership.length === 0) return [];

  return scope.database
    .select({ id: links.id, tags: links.tags, projectId: links.projectId, userId: links.userId })
    .from(links)
    .where(and(inArray(links.id, uniqueIds), ownership.length === 1 ? ownership[0] : or(...ownership)!));
}

function normalizeTags(values: string[]) {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean))).slice(0, 50);
}

export async function bulkMoveLinks(linkIds: number[], targetProjectId: number, workspaceId: number): Promise<number> {
  const database = await getDb();
  if (!database) return 0;
  const [target] = await database
    .select({ id: projects.id, archived: projects.archived, isSystem: projects.isSystem })
    .from(projects)
    .where(and(eq(projects.id, targetProjectId), eq(projects.workspaceId, workspaceId)))
    .limit(1);
  if (!target || target.archived || target.isSystem) throw new Error("Target project not found or unavailable");

  const rows = await scopedLinks(workspaceId, linkIds);
  if (rows.length === 0) return 0;
  const ids = rows.map(row => row.id);
  await database.update(links).set({ projectId: targetProjectId }).where(inArray(links.id, ids));
  return ids.length;
}

export async function bulkTagLinks(linkIds: number[], tagsToAdd: string[], workspaceId: number): Promise<number> {
  const database = await getDb();
  if (!database) return 0;
  const additions = normalizeTags(tagsToAdd);
  if (additions.length === 0) return 0;
  const rows = await scopedLinks(workspaceId, linkIds);
  for (const row of rows) {
    const existing = Array.isArray(row.tags) ? row.tags : [];
    const merged = normalizeTags([...existing, ...additions]);
    await database.update(links).set({ tags: merged }).where(eq(links.id, row.id));
  }
  return rows.length;
}

export async function bulkUntagLinks(linkIds: number[], tagsToRemove: string[], workspaceId: number): Promise<number> {
  const database = await getDb();
  if (!database) return 0;
  const removals = new Set(normalizeTags(tagsToRemove));
  if (removals.size === 0) return 0;
  const rows = await scopedLinks(workspaceId, linkIds);
  for (const row of rows) {
    const existing = Array.isArray(row.tags) ? row.tags : [];
    const next = existing.filter(tag => !removals.has(tag));
    await database.update(links).set({ tags: next }).where(eq(links.id, row.id));
  }
  return rows.length;
}

async function setProjectArchived(projectId: number, workspaceId: number, archived: boolean) {
  const database = await getDb();
  if (!database) throw new Error("Database not available");
  const [project] = await database
    .select({ id: projects.id, isSystem: projects.isSystem })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))
    .limit(1);
  if (!project || project.isSystem) throw new Error("Project not found");
  await database
    .update(projects)
    .set({ archived })
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId), eq(projects.isSystem, false)));
}

export async function archiveProject(projectId: number, workspaceId: number): Promise<void> {
  return setProjectArchived(projectId, workspaceId, true);
}

export async function unarchiveProject(projectId: number, workspaceId: number): Promise<void> {
  return setProjectArchived(projectId, workspaceId, false);
}

export async function listArchivedProjects(workspaceId: number) {
  const database = await getDb();
  if (!database) return [];
  return database
    .select()
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), eq(projects.archived, true), eq(projects.isSystem, false)))
    .orderBy(desc(projects.updatedAt));
}
