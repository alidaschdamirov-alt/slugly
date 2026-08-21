import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import * as ws from "./workspace";

vi.mock("./workspace", () => ({
  getPlanConfig: vi.fn().mockResolvedValue({
    limits: { projects: -1, links: -1, domains: 3, analyticsRetentionDays: 365, seats: 3 },
    features: {
      utmTemplates: true,
      campaignDashboard: "full",
      csvExport: true,
      bulkOps: true,
      geoTarget: true,
      abTest: true,
      deepLinks: true,
      pixels: true,
      roles: false,
      whiteLabelReports: false,
    },
  }),
  canUseFeature: vi.fn((_config, feature) => feature === "bulkOps"),
  bulkMoveLinks: vi.fn().mockResolvedValue(2),
  bulkTagLinks: vi.fn().mockResolvedValue(2),
  bulkUntagLinks: vi.fn().mockResolvedValue(2),
  archiveProject: vi.fn().mockResolvedValue(undefined),
  unarchiveProject: vi.fn().mockResolvedValue(undefined),
  listArchivedProjects: vi.fn().mockResolvedValue([{ id: 9, name: "Archived" }]),
}));

function context(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "bulk-user",
      email: "bulk@example.com",
      name: "Bulk User",
      loginMethod: "clerk",
      role: "user",
      plan: "pro",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as any,
    workspace: {
      id: 42,
      name: "Bulk Workspace",
      plan: "pro",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any,
    membership: {
      id: 1,
      workspaceId: 42,
      userId: 1,
      role: "owner",
      createdAt: new Date(),
    } as any,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const mockedWs = vi.mocked(ws);

describe("bulk router regression", () => {
  beforeEach(() => vi.clearAllMocks());

  it("moves scoped links through workspace bulk helper", async () => {
    const caller = appRouter.createCaller(context());
    await expect(caller.bulk.moveLinks({ linkIds: [1, 2], targetProjectId: 7 })).resolves.toEqual({ success: true, moved: 2 });
    expect(mockedWs.bulkMoveLinks).toHaveBeenCalledWith([1, 2], 7, 42);
  });

  it("adds and removes tags through workspace bulk helpers", async () => {
    const caller = appRouter.createCaller(context());
    await expect(caller.bulk.tagLinks({ linkIds: [1, 2], tags: ["campaign"] })).resolves.toEqual({ success: true, updated: 2 });
    await expect(caller.bulk.untagLinks({ linkIds: [1, 2], tags: ["campaign"] })).resolves.toEqual({ success: true, updated: 2 });
    expect(mockedWs.bulkTagLinks).toHaveBeenCalledWith([1, 2], ["campaign"], 42);
    expect(mockedWs.bulkUntagLinks).toHaveBeenCalledWith([1, 2], ["campaign"], 42);
  });

  it("archives, restores and lists projects without undefined helpers", async () => {
    const caller = appRouter.createCaller(context());
    await expect(caller.bulk.archiveProject({ projectId: 9 })).resolves.toEqual({ success: true });
    await expect(caller.bulk.unarchiveProject({ projectId: 9 })).resolves.toEqual({ success: true });
    await expect(caller.bulk.archivedProjects()).resolves.toEqual([{ id: 9, name: "Archived" }]);
    expect(mockedWs.archiveProject).toHaveBeenCalledWith(9, 42);
    expect(mockedWs.unarchiveProject).toHaveBeenCalledWith(9, 42);
    expect(mockedWs.listArchivedProjects).toHaveBeenCalledWith(42);
  });

  it("still enforces the bulk feature gate", async () => {
    mockedWs.canUseFeature.mockReturnValueOnce(false);
    const caller = appRouter.createCaller(context());
    await expect(caller.bulk.moveLinks({ linkIds: [1], targetProjectId: 7 })).rejects.toThrow("Bulk operations require Pro plan or higher");
    expect(mockedWs.bulkMoveLinks).not.toHaveBeenCalled();
  });
});
