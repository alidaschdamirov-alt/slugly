import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUDIT_EVENTS } from "../shared/audit-events";
import { requireAuditReason, writeAuditEvent } from "./audit";
import * as db from "./db";

vi.mock("./db", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const mockedDb = vi.mocked(db);

describe("audit writer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires a reason for irreversible admin actions", () => {
    expect(() => requireAuditReason(AUDIT_EVENTS.USER_DELETE)).toThrow("reason is required");
    expect(() => requireAuditReason(AUDIT_EVENTS.LINK_DELETE, "   ")).toThrow("reason is required");
    expect(requireAuditReason(AUDIT_EVENTS.USER_DELETE, "Requested by owner")).toBe("Requested by owner");
  });

  it("does not require a reason for reversible actions", () => {
    expect(requireAuditReason(AUDIT_EVENTS.USER_UNSUSPEND)).toBeUndefined();
  });

  it("writes event, reason, ip and user agent through one writer", async () => {
    await writeAuditEvent({
      event: AUDIT_EVENTS.USER_DELETE,
      actorId: 1,
      actorName: "Admin",
      targetType: "user",
      targetId: 42,
      reason: "Fraud investigation",
      ip: "203.0.113.4",
      userAgent: "Slugly QA",
      payload: { source: "admin" },
    });

    expect(mockedDb.writeAuditLog).toHaveBeenCalledWith({
      actorId: 1,
      actorName: "Admin",
      action: AUDIT_EVENTS.USER_DELETE,
      targetType: "user",
      targetId: "42",
      metadata: {
        source: "admin",
        reason: "Fraud investigation",
        ip: "203.0.113.4",
        userAgent: "Slugly QA",
      },
    });
  });
});
