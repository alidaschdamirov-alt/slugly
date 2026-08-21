import { beforeEach, describe, expect, it, vi } from "vitest";

const coreDeleteLink = vi.fn();
const coreDeleteUser = vi.fn();
const coreCleanup = vi.fn();
const coreWriteAudit = vi.fn();
const softDeleteLink = vi.fn();
const softDeleteUser = vi.fn();
const softDeleteExpiredAnonymous = vi.fn();
const consumeCleanupPreviewGate = vi.fn();

vi.mock("./dbCore", () => ({
  adminDeleteLink: coreDeleteLink,
  adminDeleteUser: coreDeleteUser,
  adminCleanupExpiredAnonymous: coreCleanup,
  writeAuditLog: coreWriteAudit,
}));

vi.mock("./softDelete", () => ({
  softDeleteLink,
  softDeleteUser,
  softDeleteExpiredAnonymous,
}));

vi.mock("./cleanupPreviewGate", () => ({ consumeCleanupPreviewGate }));

describe("database safety facade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    softDeleteLink.mockResolvedValue(undefined);
    softDeleteUser.mockResolvedValue(undefined);
    softDeleteExpiredAnonymous.mockResolvedValue(3);
    consumeCleanupPreviewGate.mockResolvedValue({ count: 3 });
    coreWriteAudit.mockResolvedValue(undefined);
  });

  it("routes legacy admin link deletion to soft delete only", async () => {
    vi.resetModules();
    const db = await import("./db");
    await db.adminDeleteLink(12);
    expect(softDeleteLink).toHaveBeenCalledWith(12);
    expect(coreDeleteLink).not.toHaveBeenCalled();
  });

  it("routes legacy admin user deletion to soft delete only", async () => {
    vi.resetModules();
    const db = await import("./db");
    await db.adminDeleteUser(44);
    expect(softDeleteUser).toHaveBeenCalledWith(44);
    expect(coreDeleteUser).not.toHaveBeenCalled();
  });

  it("requires cleanup preview before moving expired links to Trash", async () => {
    vi.resetModules();
    const db = await import("./db");
    await expect(db.adminCleanupExpiredAnonymous()).resolves.toBe(3);
    expect(consumeCleanupPreviewGate).toHaveBeenCalledOnce();
    expect(softDeleteExpiredAnonymous).toHaveBeenCalledOnce();
    expect(coreCleanup).not.toHaveBeenCalled();
  });

  it("does not execute cleanup if preview validation fails", async () => {
    consumeCleanupPreviewGate.mockRejectedValueOnce(new Error("Preview required"));
    vi.resetModules();
    const db = await import("./db");
    await expect(db.adminCleanupExpiredAnonymous()).rejects.toThrow("Preview required");
    expect(softDeleteExpiredAnonymous).not.toHaveBeenCalled();
    expect(coreCleanup).not.toHaveBeenCalled();
  });

  it("suppresses misleading legacy hard-delete audit rows", async () => {
    vi.resetModules();
    const db = await import("./db");
    await db.writeAuditLog({ actorId: 1, actorName: "Admin", action: "user.delete", targetType: "user", targetId: "44", metadata: {} });
    await db.writeAuditLog({ actorId: 1, actorName: "Admin", action: "link.delete", targetType: "link", targetId: "12", metadata: {} });
    await db.writeAuditLog({ actorId: 1, actorName: "Admin", action: "links.cleanup_expired", targetType: "system", targetId: null, metadata: {} });
    expect(coreWriteAudit).not.toHaveBeenCalled();
  });
});
