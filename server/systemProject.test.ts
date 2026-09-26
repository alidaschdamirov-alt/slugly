import { describe, expect, it } from "vitest";
import { SYSTEM_PROJECT_DESCRIPTION, withCurrentSystemProjectCopy } from "./systemProject";

describe("system project copy", () => {
  it("distinguishes Other Links from truly unassigned links", () => {
    const project = withCurrentSystemProjectCopy({
      id: 6,
      isSystem: true,
      name: "Other Links",
      description: "Links not assigned to any project",
    });

    expect(project.description).toBe(SYSTEM_PROJECT_DESCRIPTION);
    expect(project.description).not.toMatch(/not assigned|no home/i);
  });
});
