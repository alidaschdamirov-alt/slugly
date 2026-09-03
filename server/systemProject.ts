export const SYSTEM_PROJECT_NAME = "Other Links";
export const SYSTEM_PROJECT_DESCRIPTION = "Links organized outside campaign projects";

export function withCurrentSystemProjectCopy<
  T extends { isSystem?: boolean | null; name: string; description?: string | null },
>(project: T): T {
  if (!project.isSystem) return project;
  return {
    ...project,
    name: SYSTEM_PROJECT_NAME,
    description: SYSTEM_PROJECT_DESCRIPTION,
  };
}
