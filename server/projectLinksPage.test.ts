import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProjectById: vi.fn(),
  getLinksByProjectId: vi.fn(),
  getClickCountsByLinkIds: vi.fn(),
  getLinkQuarantineState: vi.fn(),
}));

vi.mock("./db", () => ({
  getProjectById: mocks.getProjectById,
  getLinksByProjectId: mocks.getLinksByProjectId,
  getClickCountsByLinkIds: mocks.getClickCountsByLinkIds,
}));

vi.mock("./linkQuarantine", () => ({
  getLinkQuarantineState: mocks.getLinkQuarantineState,
}));

function makeLink(id: number) {
  return {
    id,
    userId: 7,
    projectId: 10,
    destinationUrl: `https://example.com/page-${id}`,
    shortCode: `code-${String(id).padStart(3, "0")}`,
    title: id % 2 === 0 ? `Campaign ${id}` : null,
    tags: id % 3 === 0 ? ["paid", "summer"] : ["organic"],
    utmSource: id % 2 === 0 ? "instagram" : null,
    utmMedium: null,
    utmCampaign: id % 5 === 0 ? "launch" : null,
    utmTerm: null,
    utmContent: null,
    domainId: null,
    status: id === 5 ? "paused" : "active",
    activeFrom: null,
    expiresAt: null,
    createdAt: new Date(2026, 0, 1, 0, id).toISOString(),
    updatedAt: new Date(2026, 0, 1, 0, id).toISOString(),
  };
}

describe("project links page service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProjectById.mockResolvedValue({ id: 10, userId: 7, name: "Project" });
    mocks.getLinksByProjectId.mockResolvedValue(Array.from({ length: 120 }, (_, index) => makeLink(index + 1)));
    mocks.getClickCountsByLinkIds.mockImplementation(async (ids: number[]) => Object.fromEntries(ids.map(id => [id, id * 10])));
    mocks.getLinkQuarantineState.mockImplementation(async (id: number) => id === 3
      ? { quarantined: true, reason: "Malware", threatTypes: ["MALWARE"], source: "scheduled-rescan", createdAt: 1, updatedAt: 1 }
      : null);
  });

  it("returns 50 rows per page with stable totals and distinct page boundaries", async () => {
    vi.resetModules();
    const { loadProjectLinksPage } = await import("./projectLinksPage");
    const first = await loadProjectLinksPage({ userId: 7, projectId: 10, page: 1, limit: 50, sortField: "createdAt", sortDir: "asc" });
    const second = await loadProjectLinksPage({ userId: 7, projectId: 10, page: 2, limit: 50, sortField: "createdAt", sortDir: "asc" });

    expect(first?.pagination).toMatchObject({ page: 1, limit: 50, total: 120, pageCount: 3, hasNextPage: true });
    expect(second?.pagination).toMatchObject({ page: 2, total: 120, pageCount: 3, hasPreviousPage: true, hasNextPage: true });
    expect(first?.items).toHaveLength(50);
    expect(second?.items).toHaveLength(50);
    expect(first?.items[0].id).toBe(1);
    expect(second?.items[0].id).toBe(51);
  });

  it("applies search and tag filters before pagination", async () => {
    vi.resetModules();
    const { loadProjectLinksPage } = await import("./projectLinksPage");
    const result = await loadProjectLinksPage({
      userId: 7,
      projectId: 10,
      page: 1,
      limit: 50,
      search: "campaign 30",
      tag: "paid",
      sortField: "createdAt",
      sortDir: "desc",
    });

    expect(result?.pagination.total).toBe(1);
    expect(result?.items[0].id).toBe(30);
    expect(result?.filters.allTags).toEqual(["organic", "paid", "summer"]);
  });

  it("uses shared effective status including quarantine", async () => {
    vi.resetModules();
    const { loadProjectLinksPage } = await import("./projectLinksPage");
    const result = await loadProjectLinksPage({
      userId: 7,
      projectId: 10,
      page: 1,
      limit: 50,
      status: "quarantine",
      sortField: "createdAt",
      sortDir: "desc",
    });

    expect(result?.pagination.total).toBe(1);
    expect(result?.items[0]).toMatchObject({ id: 3, effectiveStatus: "quarantine", quarantineReason: "Malware" });
  });

  it("sorts by click count and only exposes the requested user's project", async () => {
    vi.resetModules();
    const { loadProjectLinksPage } = await import("./projectLinksPage");
    const result = await loadProjectLinksPage({ userId: 7, projectId: 10, page: 1, limit: 3, sortField: "clicks", sortDir: "desc" });
    expect(result?.items.map(item => item.id)).toEqual([120, 119, 118]);

    const forbidden = await loadProjectLinksPage({ userId: 999, projectId: 10, page: 1, limit: 50, sortField: "createdAt", sortDir: "desc" });
    expect(forbidden).toBeNull();
  });
});
