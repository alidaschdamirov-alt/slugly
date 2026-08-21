import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProjectById: vi.fn(),
  getLinksByProjectId: vi.fn(),
  getClickCountsByLinkIds: vi.fn(),
  getLinkQuarantineState: vi.fn(),
  queryProjectLinksSqlPage: vi.fn(),
}));

vi.mock("./db", () => ({
  getProjectById: mocks.getProjectById,
  getLinksByProjectId: mocks.getLinksByProjectId,
  getClickCountsByLinkIds: mocks.getClickCountsByLinkIds,
}));

vi.mock("./linkQuarantine", () => ({
  getLinkQuarantineState: mocks.getLinkQuarantineState,
}));

vi.mock("./projectLinksPageDb", () => ({
  queryProjectLinksSqlPage: mocks.queryProjectLinksSqlPage,
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

const allLinks = Array.from({ length: 120 }, (_, index) => makeLink(index + 1));

function mockSqlPage(input: any) {
  const search = String(input.search || "").toLowerCase();
  const tag = String(input.tag || "");
  let rows = allLinks.filter(link => {
    if (tag && !link.tags.includes(tag)) return false;
    if (!search) return true;
    return [link.shortCode, link.destinationUrl, link.title, link.utmSource, link.utmCampaign]
      .some(value => String(value || "").toLowerCase().includes(search));
  });
  rows = rows.sort((a, b) => {
    const comparison = input.sortField === "shortCode"
      ? a.shortCode.localeCompare(b.shortCode)
      : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return input.sortDir === "asc" ? comparison : -comparison;
  });
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / input.limit));
  const page = Math.min(input.page, pageCount);
  return {
    items: rows.slice((page - 1) * input.limit, page * input.limit),
    total,
    page,
    pageCount,
    allTags: ["organic", "paid", "summer"],
  };
}

describe("project links page service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProjectById.mockResolvedValue({ id: 10, userId: 7, name: "Project" });
    mocks.getLinksByProjectId.mockResolvedValue(allLinks);
    mocks.queryProjectLinksSqlPage.mockImplementation(async input => mockSqlPage(input));
    mocks.getClickCountsByLinkIds.mockImplementation(async (ids: number[]) => Object.fromEntries(ids.map(id => [id, id * 10])));
    mocks.getLinkQuarantineState.mockImplementation(async (id: number) => id === 3
      ? { quarantined: true, reason: "Malware", threatTypes: ["MALWARE"], source: "scheduled-rescan", createdAt: 1, updatedAt: 1 }
      : null);
  });

  it("returns 50 rows per page through SQL paging without a full project scan", async () => {
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
    expect(mocks.queryProjectLinksSqlPage).toHaveBeenCalledTimes(2);
    expect(mocks.getLinksByProjectId).not.toHaveBeenCalled();
  });

  it("pushes search and tag filters into the SQL page query", async () => {
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
    expect(mocks.queryProjectLinksSqlPage).toHaveBeenCalledWith(expect.objectContaining({ search: "campaign 30", tag: "paid" }));
    expect(mocks.getLinksByProjectId).not.toHaveBeenCalled();
  });

  it("uses the compatibility scan for shared effective status including quarantine", async () => {
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
    expect(mocks.getLinksByProjectId).toHaveBeenCalledWith(10);
    expect(mocks.queryProjectLinksSqlPage).not.toHaveBeenCalled();
  });

  it("uses compatibility scan for global click sorting and enforces project ownership", async () => {
    vi.resetModules();
    const { loadProjectLinksPage } = await import("./projectLinksPage");
    const result = await loadProjectLinksPage({ userId: 7, projectId: 10, page: 1, limit: 3, sortField: "clicks", sortDir: "desc" });
    expect(result?.items.map(item => item.id)).toEqual([120, 119, 118]);
    expect(mocks.getLinksByProjectId).toHaveBeenCalledWith(10);

    const forbidden = await loadProjectLinksPage({ userId: 999, projectId: 10, page: 1, limit: 50, sortField: "createdAt", sortDir: "desc" });
    expect(forbidden).toBeNull();
  });
});
