import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  coreDeleteLink: vi.fn(),
  coreDeleteUser: vi.fn(),
  coreCleanup: vi.fn(),
  coreWriteAudit: vi.fn(),
  coreGetClickStats: vi.fn(),
  coreGetClickCountFiltered: vi.fn(),
  softDeleteLink: vi.fn(),
  softDeleteUser: vi.fn(),
  softDeleteExpiredAnonymous: vi.fn(),
  consumeCleanupPreviewGate: vi.fn(),
}));

vi.mock("./dbCore", () => ({
  adminDeleteLink: mocks.coreDeleteLink,
  adminDeleteUser: mocks.coreDeleteUser,
  adminCleanupExpiredAnonymous: mocks.coreCleanup,
  writeAuditLog: mocks.coreWriteAudit,
  getClickStats: mocks.coreGetClickStats,
  getClickCountByLinkIdFiltered: mocks.coreGetClickCountFiltered,
}));

vi.mock("./softDelete", () => ({
  softDeleteLink: mocks.softDeleteLink,
  softDeleteUser: mocks.softDeleteUser,
  softDeleteExpiredAnonymous: mocks.softDeleteExpiredAnonymous,
}));

vi.mock("./cleanupPreviewGate", () => ({ consumeCleanupPreviewGate: mocks.consumeCleanupPreviewGate }));

describe("database safety facade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.softDeleteLink.mockResolvedValue(undefined);
    mocks.softDeleteUser.mockResolvedValue(undefined);
    mocks.softDeleteExpiredAnonymous.mockResolvedValue(3);
    mocks.consumeCleanupPreviewGate.mockResolvedValue({ count: 3 });
    mocks.coreWriteAudit.mockResolvedValue(undefined);
    mocks.coreGetClickStats.mockResolvedValue({ countries: [], devices: [], browsers: [], referrers: [] });
    mocks.coreGetClickCountFiltered.mockResolvedValue({ total: 12, unique: 7 });
  });

  it("routes legacy admin link deletion to soft delete only", async () => {
    vi.resetModules();
    const db = await import("./db");
    await db.adminDeleteLink(12);
    expect(mocks.softDeleteLink).toHaveBeenCalledWith(12);
    expect(mocks.coreDeleteLink).not.toHaveBeenCalled();
  });

  it("routes legacy admin user deletion to soft delete only", async () => {
    vi.resetModules();
    const db = await import("./db");
    await db.adminDeleteUser(44);
    expect(mocks.softDeleteUser).toHaveBeenCalledWith(44);
    expect(mocks.coreDeleteUser).not.toHaveBeenCalled();
  });

  it("requires cleanup preview before moving expired links to Trash", async () => {
    vi.resetModules();
    const db = await import("./db");
    await expect(db.adminCleanupExpiredAnonymous()).resolves.toBe(3);
    expect(mocks.consumeCleanupPreviewGate).toHaveBeenCalledOnce();
    expect(mocks.softDeleteExpiredAnonymous).toHaveBeenCalledOnce();
    expect(mocks.coreCleanup).not.toHaveBeenCalled();
  });

  it("does not execute cleanup if preview validation fails", async () => {
    mocks.consumeCleanupPreviewGate.mockRejectedValueOnce(new Error("Preview required"));
    vi.resetModules();
    const db = await import("./db");
    await expect(db.adminCleanupExpiredAnonymous()).rejects.toThrow("Preview required");
    expect(mocks.softDeleteExpiredAnonymous).not.toHaveBeenCalled();
    expect(mocks.coreCleanup).not.toHaveBeenCalled();
  });

  it("suppresses misleading legacy hard-delete audit rows", async () => {
    vi.resetModules();
    const db = await import("./db");
    await db.writeAuditLog({ actorId: 1, actorName: "Admin", action: "user.delete", targetType: "user", targetId: "44", metadata: {} });
    await db.writeAuditLog({ actorId: 1, actorName: "Admin", action: "link.delete", targetType: "link", targetId: "12", metadata: {} });
    await db.writeAuditLog({ actorId: 1, actorName: "Admin", action: "links.cleanup_expired", targetType: "system", targetId: null, metadata: {} });
    expect(mocks.coreWriteAudit).not.toHaveBeenCalled();
  });

  it("adds filtered unique clicks to link analytics stats", async () => {
    vi.resetModules();
    const db = await import("./db");
    await expect(db.getClickStats(12)).resolves.toEqual({
      countries: [],
      devices: [],
      browsers: [],
      referrers: [],
      uniqueClicks: 7,
    });
    expect(mocks.coreGetClickStats).toHaveBeenCalledWith(12);
    expect(mocks.coreGetClickCountFiltered).toHaveBeenCalledWith(12, true);
  });
});
