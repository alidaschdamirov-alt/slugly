import { describe, expect, it } from "vitest";
import { canAccessAdminProcedure, isPrivilegedRole } from "./adminAccess";

describe("platform admin permission matrix", () => {
  it("allows administrators to use all privileged procedures", () => {
    expect(canAccessAdminProcedure("admin", "admin.deleteUser", "mutation")).toBe(true);
    expect(canAccessAdminProcedure("admin", "admin.updateEmailConfig", "mutation")).toBe(true);
    expect(canAccessAdminProcedure("admin", "admin.getMetrics", "query")).toBe(true);
  });

  it("allows support to read all privileged sections", () => {
    for (const path of [
      "admin.getMetrics",
      "admin.getReports",
      "admin.searchUsers",
      "admin.searchLinks",
      "admin.listWorkspaces",
      "admin.getSiteSettings",
      "admin.getEmailConfig",
      "admin.getAuditLog",
    ]) {
      expect(canAccessAdminProcedure("support", path, "query"), path).toBe(true);
    }
  });

  it("allows support only reversible trust and safety mutations", () => {
    for (const path of [
      "admin.updateReport",
      "admin.disableLink",
      "admin.suspendUser",
      "admin.unsuspendUser",
      "admin.banUser",
      "admin.addBlockedDomain",
      "admin.removeBlockedDomain",
      "admin.previewTemplate",
    ]) {
      expect(canAccessAdminProcedure("support", path, "mutation"), path).toBe(true);
    }
  });

  it("denies support irreversible, billing, role, config, email and backup writes", () => {
    for (const path of [
      "admin.deleteUser",
      "admin.deleteLink",
      "admin.cleanupExpiredAnonymous",
      "admin.setRole",
      "admin.overridePlan",
      "admin.overrideWorkspacePlan",
      "admin.updatePlanLimits",
      "admin.updatePlanConfigs",
      "admin.updateSiteSettings",
      "admin.updateReservedSlugs",
      "admin.updateEmailConfig",
      "admin.saveTemplate",
      "admin.sendTestEmail",
      "admin.exportBackup",
      "notification.broadcast",
    ]) {
      expect(canAccessAdminProcedure("support", path, "mutation"), path).toBe(false);
    }
  });

  it("never grants privileged access to regular users", () => {
    expect(canAccessAdminProcedure("user", "admin.getMetrics", "query")).toBe(false);
    expect(canAccessAdminProcedure("user", "admin.disableLink", "mutation")).toBe(false);
    expect(isPrivilegedRole("user")).toBe(false);
    expect(isPrivilegedRole("support")).toBe(true);
    expect(isPrivilegedRole("admin")).toBe(true);
  });
});
