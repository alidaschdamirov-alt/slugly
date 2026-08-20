import { describe, it, expect, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as db from "./db";
import * as ws from "./workspace";

// Mock the db module
vi.mock("./db", () => ({
  getProjectsByUserId: vi.fn().mockResolvedValue([]),
  getProjectById: vi.fn().mockResolvedValue(null),
  createProject: vi.fn().mockResolvedValue({ id: 1 }),
  updateProject: vi.fn().mockResolvedValue(undefined),
  deleteProject: vi.fn().mockResolvedValue(undefined),
  deleteProjectCascade: vi.fn().mockResolvedValue(undefined),
  moveProjectLinks: vi.fn().mockResolvedValue(undefined),
  ensureSystemProject: vi.fn().mockResolvedValue(99),
  countProjectsByUserId: vi.fn().mockResolvedValue(0),
  countLinksByUserId: vi.fn().mockResolvedValue(0),
  getLinksByUserId: vi.fn().mockResolvedValue([]),
  getLinksByProjectId: vi.fn().mockResolvedValue([]),
  getLinkById: vi.fn().mockResolvedValue(null),
  getLinkByShortCode: vi.fn().mockResolvedValue(null),
  createLink: vi.fn().mockResolvedValue({ id: 1 }),
  createLinks: vi.fn().mockResolvedValue([]),
  updateLink: vi.fn().mockResolvedValue(undefined),
  deleteLink: vi.fn().mockResolvedValue(undefined),
  isShortCodeRetired: vi.fn().mockResolvedValue(false),
  isHostnameBlocked: vi.fn().mockResolvedValue(false),
  getClickCountsByLinkIds: vi.fn().mockResolvedValue({}),
  getClickCountByLinkId: vi.fn().mockResolvedValue(0),
  getClicksOverTime: vi.fn().mockResolvedValue([]),
  getClicksOverTimeForLinks: vi.fn().mockResolvedValue({}),
  getClickStats: vi.fn().mockResolvedValue({ countries: [], devices: [], browsers: [], referrers: [] }),
  getProjectClickStats: vi.fn().mockResolvedValue({ totalClicks: 0, clicksOverTime: [], topLinks: [] }),
  getDomainsByUserId: vi.fn().mockResolvedValue([]),
  getDomainById: vi.fn().mockResolvedValue(null),
  createDomain: vi.fn().mockResolvedValue({ id: 1 }),
  updateDomainVerified: vi.fn().mockResolvedValue(undefined),
  deleteDomain: vi.fn().mockResolvedValue(undefined),
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

// Mock workspace module
vi.mock("./workspace", () => ({
  getPlanConfig: vi.fn().mockResolvedValue({
    limits: { projects: 1, links: 5, domains: 0, analyticsRetentionDays: 7, seats: 1 },
    features: { utmTemplates: false, campaignDashboard: "none", csvExport: false, bulkOps: false, geoTarget: false, abTest: false, deepLinks: false, pixels: false, roles: false, whiteLabelReports: false },
  }),
  countWorkspaceProjects: vi.fn().mockResolvedValue(0),
  countWorkspaceLinks: vi.fn().mockResolvedValue(0),
  countWorkspaceDomains: vi.fn().mockResolvedValue(0),
  countWorkspaceMembers: vi.fn().mockResolvedValue(1),
  checkLimit: vi.fn().mockReturnValue({ allowed: true, limit: -1, current: 0 }),
  adminListWorkspaces: vi.fn().mockResolvedValue([]),
}));

// Mock safeBrowsing
vi.mock("./safeBrowsing", () => ({
  checkUrlSafety: vi.fn().mockResolvedValue({ safe: true }),
}));

const mockedDb = vi.mocked(db);
const mockedWs = vi.mocked(ws);

function createMockContext(overrides?: Partial<{ plan: string; role: string; wsRole: string }>): TrpcContext {
  const plan = overrides?.plan || "free";
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "clerk",
      role: (overrides?.role || "user") as "user" | "admin",
      plan: plan as any,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    workspace: {
      id: 1,
      name: "Test Workspace",
      plan: plan as any,
      ownerId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any,
    membership: {
      id: 1,
      workspaceId: 1,
      userId: 1,
      role: (overrides?.wsRole || "owner") as any,
      createdAt: new Date(),
    } as any,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("project router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedWs.getPlanConfig.mockResolvedValue({
      limits: { projects: 1, links: 5, domains: 0, analyticsRetentionDays: 7, seats: 1 },
      features: { utmTemplates: false, campaignDashboard: "none", csvExport: false, bulkOps: false, geoTarget: false, abTest: false, deepLinks: false, pixels: false, roles: false, whiteLabelReports: false },
    });
    mockedWs.checkLimit.mockReturnValue({ allowed: true, limit: 1, current: 0 });
    mockedWs.countWorkspaceProjects.mockResolvedValue(0);
  });

  it("creates a project for free user with 0 projects", async () => {
    mockedDb.createProject.mockResolvedValue({ id: 1 });
    const caller = appRouter.createCaller(createMockContext());
    const result = await caller.project.create({ name: "My Campaign", color: "#ff0000" });
    expect(result).toEqual({ id: 1 });
    expect(mockedDb.createProject).toHaveBeenCalledWith(expect.objectContaining({ userId: 1, name: "My Campaign", color: "#ff0000" }));
  });

  it("rejects project creation when plan limit reached", async () => {
    mockedWs.checkLimit.mockReturnValue({ allowed: false, limit: 1, current: 1 });
    const caller = appRouter.createCaller(createMockContext());
    await expect(caller.project.create({ name: "Second Project" })).rejects.toThrow("LIMIT_REACHED");
  });

  it("allows pro user to create projects within limit", async () => {
    mockedWs.checkLimit.mockReturnValue({ allowed: true, limit: -1, current: 5 });
    mockedDb.createProject.mockResolvedValue({ id: 6 });
    const caller = appRouter.createCaller(createMockContext({ plan: "pro" }));
    expect(await caller.project.create({ name: "Pro Project" })).toEqual({ id: 6 });
  });

  it("updates a project owned by user", async () => {
    mockedDb.getProjectById.mockResolvedValue({ id: 1, userId: 1, name: "Old", description: null, color: "#000000", createdAt: new Date(), updatedAt: new Date() });
    const caller = appRouter.createCaller(createMockContext());
    expect(await caller.project.update({ id: 1, name: "New Name" })).toEqual({ success: true });
    expect(mockedDb.updateProject).toHaveBeenCalledWith(1, { name: "New Name" });
  });

  it("rejects update for project not owned by user", async () => {
    mockedDb.getProjectById.mockResolvedValue({ id: 1, userId: 99, name: "Other", description: null, color: "#000000", createdAt: new Date(), updatedAt: new Date() });
    const caller = appRouter.createCaller(createMockContext());
    await expect(caller.project.update({ id: 1, name: "Hack" })).rejects.toThrow("Project not found");
  });
});

describe("link router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedWs.getPlanConfig.mockResolvedValue({
      limits: { projects: 1, links: 5, domains: 0, analyticsRetentionDays: 7, seats: 1 },
      features: { utmTemplates: false, campaignDashboard: "none", csvExport: false, bulkOps: false, geoTarget: false, abTest: false, deepLinks: false, pixels: false, roles: false, whiteLabelReports: false },
    });
    mockedWs.checkLimit.mockReturnValue({ allowed: true, limit: 5, current: 0 });
    mockedWs.countWorkspaceLinks.mockResolvedValue(0);
  });

  it("creates a link with custom short code", async () => {
    mockedDb.getLinkByShortCode.mockResolvedValue(null);
    mockedDb.createLink.mockResolvedValue({ id: 1 });
    const caller = appRouter.createCaller(createMockContext());
    const result = await caller.link.create({ destinationUrl: "https://example.com", customCode: "my-link", title: "Test Link" });
    expect(result.shortCode).toBe("my-link");
    expect(mockedDb.createLink).toHaveBeenCalledWith(expect.objectContaining({ shortCode: "my-link", destinationUrl: "https://example.com", title: "Test Link" }));
  });

  it("rejects link creation when plan limit reached", async () => {
    mockedWs.checkLimit.mockReturnValue({ allowed: false, limit: 5, current: 5 });
    const caller = appRouter.createCaller(createMockContext());
    await expect(caller.link.create({ destinationUrl: "https://example.com" })).rejects.toThrow("LIMIT_REACHED");
  });

  it("rejects duplicate custom short code", async () => {
    mockedDb.getLinkByShortCode.mockResolvedValue({ id: 99, shortCode: "taken", userId: 2 } as any);
    const caller = appRouter.createCaller(createMockContext());
    await expect(caller.link.create({ destinationUrl: "https://example.com", customCode: "taken" })).rejects.toThrow("already taken");
  });

  it("creates bulk links", async () => {
    mockedDb.createLinks.mockResolvedValue([{ id: 1 }, { id: 2 }] as any);
    const caller = appRouter.createCaller(createMockContext());
    const result = await caller.link.createBulk({ links: [{ destinationUrl: "https://a.com" }, { destinationUrl: "https://b.com" }] });
    expect(result).toHaveLength(2);
  });

  it("rejects bulk creation exceeding plan limit", async () => {
    mockedWs.checkLimit.mockReturnValue({ allowed: false, limit: 5, current: 24 });
    const caller = appRouter.createCaller(createMockContext());
    await expect(caller.link.createBulk({ links: [{ destinationUrl: "https://a.com" }, { destinationUrl: "https://b.com" }] })).rejects.toThrow("LIMIT_REACHED");
  });

  it.each(["test", "тест", "javascript:alert(1)", "http://localhost:3000"])(
    "rejects invalid destination on link.create: %s",
    async destinationUrl => {
      const caller = appRouter.createCaller(createMockContext());
      await expect(caller.link.create({ destinationUrl })).rejects.toThrow("valid URL");
      expect(mockedDb.createLink).not.toHaveBeenCalled();
    }
  );

  it.each(["test", "тест", "javascript:alert(1)", "http://localhost:3000"])(
    "rejects invalid destination on link.update: %s",
    async destinationUrl => {
      const caller = appRouter.createCaller(createMockContext());
      await expect(caller.link.update({ id: 1, destinationUrl })).rejects.toThrow("valid URL");
      expect(mockedDb.updateLink).not.toHaveBeenCalled();
    }
  );

  it.each(["test", "тест", "javascript:alert(1)", "http://localhost:3000"])(
    "rejects invalid destination on link.createBulk: %s",
    async destinationUrl => {
      const caller = appRouter.createCaller(createMockContext());
      await expect(caller.link.createBulk({ links: [{ destinationUrl }] })).rejects.toThrow("valid URL");
      expect(mockedDb.createLinks).not.toHaveBeenCalled();
    }
  );

  it.each(["test", "тест", "javascript:alert(1)", "http://localhost:3000"])(
    "rejects invalid destination on anonymous shorten: %s",
    async url => {
      const caller = appRouter.createCaller(createMockContext());
      await expect(caller.link.shortenAnonymous({ url })).rejects.toThrow("valid URL");
      expect(mockedDb.createLink).not.toHaveBeenCalled();
    }
  );
});

describe("admin router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedWs.adminListWorkspaces.mockResolvedValue([
      { id: 1, name: "Test Workspace", plan: "free", memberCount: 1, projectCount: 0, linkCount: 0, domainCount: 0 } as any,
    ]);
  });

  it("lists workspaces for an admin without calling an undefined helper", async () => {
    const caller = appRouter.createCaller(createMockContext({ role: "admin" }));
    const result = await caller.admin.listWorkspaces({});
    expect(result).toHaveLength(1);
    expect(mockedWs.adminListWorkspaces).toHaveBeenCalledWith({});
  });

  it("blocks a normal user from admin procedures", async () => {
    const caller = appRouter.createCaller(createMockContext({ role: "user" }));
    await expect(caller.admin.listWorkspaces({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("domain router", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects domain creation when plan limit is 0", async () => {
    mockedWs.checkLimit.mockReturnValue({ allowed: false, limit: 0, current: 0 });
    const caller = appRouter.createCaller(createMockContext({ plan: "free" }));
    await expect(caller.domain.create({ hostname: "go.brand.com" })).rejects.toThrow("LIMIT_REACHED");
  });

  it("allows pro user to create a domain", async () => {
    mockedWs.checkLimit.mockReturnValue({ allowed: true, limit: 1, current: 0 });
    mockedDb.createDomain.mockResolvedValue({ id: 1 });
    const caller = appRouter.createCaller(createMockContext({ plan: "pro" }));
    expect(await caller.domain.create({ hostname: "go.brand.com" })).toEqual({ id: 1 });
  });

  it("rejects second domain for pro user", async () => {
    mockedWs.checkLimit.mockReturnValue({ allowed: false, limit: 1, current: 1 });
    const caller = appRouter.createCaller(createMockContext({ plan: "pro" }));
    await expect(caller.domain.create({ hostname: "another.com" })).rejects.toThrow("LIMIT_REACHED");
  });
});

describe("billing router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedWs.getPlanConfig.mockResolvedValue({
      limits: { projects: 50, links: 5000, domains: 1, analyticsRetentionDays: 365, seats: 3 },
      features: { utmTemplates: true, campaignDashboard: "full", csvExport: true, bulkOps: true, geoTarget: true, abTest: true, deepLinks: true, pixels: true, roles: true, whiteLabelReports: false },
    });
    mockedWs.countWorkspaceProjects.mockResolvedValue(5);
    mockedWs.countWorkspaceLinks.mockResolvedValue(100);
    mockedWs.countWorkspaceDomains.mockResolvedValue(1);
    mockedWs.countWorkspaceMembers.mockResolvedValue(2);
  });

  it("returns workspace plan status", async () => {
    const caller = appRouter.createCaller(createMockContext({ plan: "pro" }));
    const result = await caller.billing.status();
    expect(result.plan).toBe("pro");
    expect(result.usage).toBeDefined();
    expect(result.planConfig).toBeDefined();
  });
});
