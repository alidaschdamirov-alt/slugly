import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUDIT_EVENTS } from "../shared/audit-events";
import {
  getAutomaticAdminAuditDescriptor,
  getRequiredAdminReasonDescriptor,
  requireAuditReason,
  writeAuditEvent,
} from "./audit";
import * as db from "./db";

vi.mock("./db", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

const mockedDb = vi.mocked(db);

describe("audit writer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires a reason for restrictive, soft-delete and purge actions", () => {
    for (const event of [
      AUDIT_EVENTS.USER_SUSPEND,
      AUDIT_EVENTS.USER_SOFT_DELETE,
      AUDIT_EVENTS.USER_PURGE,
      AUDIT_EVENTS.USER_IMPERSONATE,
      AUDIT_EVENTS.LINK_PAUSE,
      AUDIT_EVENTS.LINK_SOFT_DELETE,
      AUDIT_EVENTS.LINK_PURGE,
      AUDIT_EVENTS.LINK_BULK_CLEANUP,
      AUDIT_EVENTS.DOMAIN_BLOCK,
      AUDIT_EVENTS.DOMAIN_UNBLOCK,
    ]) {
      expect(() => requireAuditReason(event), event).toThrow("reason is required");
    }
    expect(requireAuditReason(AUDIT_EVENTS.USER_SOFT_DELETE, "Requested by owner")).toBe("Requested by owner");
  });

  it("maps legacy delete procedures to 30-day soft-delete audit events", () => {
    expect(getRequiredAdminReasonDescriptor("admin.disableLink")?.event).toBe(AUDIT_EVENTS.LINK_PAUSE);
    expect(getRequiredAdminReasonDescriptor("admin.suspendUser")?.event).toBe(AUDIT_EVENTS.USER_SUSPEND);
    expect(getRequiredAdminReasonDescriptor("admin.banUser")?.event).toBe(AUDIT_EVENTS.USER_SUSPEND);
    expect(getRequiredAdminReasonDescriptor("admin.deleteUser")?.event).toBe(AUDIT_EVENTS.USER_SOFT_DELETE);
    expect(getRequiredAdminReasonDescriptor("admin.deleteLink")?.event).toBe(AUDIT_EVENTS.LINK_SOFT_DELETE);
    expect(getRequiredAdminReasonDescriptor("admin.cleanupExpiredAnonymous")?.event).toBe(AUDIT_EVENTS.LINK_BULK_CLEANUP);
    expect(getRequiredAdminReasonDescriptor("admin.addBlockedDomain")?.event).toBe(AUDIT_EVENTS.DOMAIN_BLOCK);
    expect(getRequiredAdminReasonDescriptor("admin.removeBlockedDomain")?.event).toBe(AUDIT_EVENTS.DOMAIN_UNBLOCK);
    expect(getRequiredAdminReasonDescriptor("admin.unsuspendUser")).toBeNull();
  });

  it("does not require a reason for reversible restore actions", () => {
    expect(requireAuditReason(AUDIT_EVENTS.USER_UNSUSPEND)).toBeUndefined();
    expect(requireAuditReason(AUDIT_EVENTS.LINK_RESUME)).toBeUndefined();
    expect(requireAuditReason(AUDIT_EVENTS.USER_RESTORE)).toBeUndefined();
    expect(requireAuditReason(AUDIT_EVENTS.LINK_RESTORE)).toBeUndefined();
  });

  it("writes event, reason, ip and user agent through one writer", async () => {
    await writeAuditEvent({
      event: AUDIT_EVENTS.USER_SOFT_DELETE,
      actorId: 1,
      actorName: "Admin",
      targetType: "user",
      targetId: 42,
      reason: "Fraud investigation",
      ip: "203.0.113.4",
      userAgent: "Slugly QA",
      payload: { source: "admin", recoveryWindowDays: 30 },
    });

    expect(mockedDb.writeAuditLog).toHaveBeenCalledWith({
      actorId: 1,
      actorName: "Admin",
      action: AUDIT_EVENTS.USER_SOFT_DELETE,
      targetType: "user",
      targetId: "42",
      metadata: {
        source: "admin",
        recoveryWindowDays: 30,
        reason: "Fraud investigation",
        ip: "203.0.113.4",
        userAgent: "Slugly QA",
      },
    });
  });

  it("does not duplicate legacy mutations in the generic audit fallback", () => {
    expect(getAutomaticAdminAuditDescriptor("admin.deleteUser")).toBeNull();
    expect(getAutomaticAdminAuditDescriptor("admin.updatePlanLimits")).toBeNull();
  });

  it("uses a specific event for admin test email", () => {
    const descriptor = getAutomaticAdminAuditDescriptor("admin.sendTestEmail");
    expect(descriptor?.event).toBe(AUDIT_EVENTS.EMAIL_TEST_SEND);
    expect(descriptor?.payload?.({ to: "qa@example.com", templateType: "welcome" }, null)).toEqual({
      to: "qa@example.com",
      templateType: "welcome",
    });
  });

  it("automatically audits future admin mutations through a generic event", () => {
    const descriptor = getAutomaticAdminAuditDescriptor("admin.futureDangerousMutation");
    expect(descriptor?.event).toBe(AUDIT_EVENTS.ADMIN_MUTATION);
    expect(descriptor?.payload?.({ id: 42, secret: "not-copied" }, null)).toEqual({
      path: "admin.futureDangerousMutation",
      inputKeys: ["id", "secret"],
    });
  });

  it("does not create fallback descriptors outside admin namespace", () => {
    expect(getAutomaticAdminAuditDescriptor("link.update")).toBeNull();
  });
});
