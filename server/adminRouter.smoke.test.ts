import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  adminGetMetrics: vi.fn().mockResolvedValue({
    totalUsers: 1, registrationsToday: 0, registrationsWeek: 1, proUsers: 0,
    subscriptions: { active: 0, trialing: 0, pastDue: 0, canceled: 0 },
    totalLinks: 1, activeLinks: 1, brokenLinks: 0, expiredLinks: 0,
    scheduledLinks: 0, pausedLinks: 0, clicksToday: 0, clicksWeek: 0,
    openReports: 0, linksDisabledToday: 0, suspendedUsers: 0,
  }),
  getReports: vi.fn().mockResolvedValue([]),
  updateReportStatus: vi.fn().mockResolvedValue(undefined),
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  getAuditLogs: vi.fn().mockResolvedValue([]),
  adminSearchLinksAdvanced: vi.fn().mockResolvedValue([]),
  getLinkById: vi.fn().mockResolvedValue(null),
  adminDisableLink: vi.fn().mockResolvedValue(undefined),
  adminDeleteLink: vi.fn().mockResolvedValue(undefined),
  adminCleanupExpiredAnonymous: vi.fn().mockResolvedValue(0),
  adminGetAllUsersEnriched: vi.fn().mockResolvedValue([]),
  adminGetUserById: vi.fn().mockResolvedValue({ id: 2, role: "user" }),
  suspendUser: vi.fn().mockResolvedValue(undefined),
  unsuspendUser: vi.fn().mockResolvedValue(undefined),
  adminSetRole: vi.fn().mockResolvedValue(undefined),
  adminDeleteUser: vi.fn().mockResolvedValue(undefined),
  getBlockedDomains: vi.fn().mockResolvedValue([]),
  addBlockedDomain: vi.fn().mockResolvedValue(undefined),
  removeBlockedDomain: vi.fn().mockResolvedValue(undefined),
  getSiteSetting: vi.fn().mockResolvedValue(null),
  setSiteSetting: vi.fn().mockResolvedValue(undefined),
  getPlanLimits: vi.fn().mockResolvedValue({}),
  setPlanLimits: vi.fn().mockResolvedValue(undefined),
  getReservedSlugs: vi.fn().mockResolvedValue([]),
  setReservedSlugs: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./workspace", () => ({
  setWorkspacePlan: vi.fn().mockResolvedValue(undefined),
  getAllPlanConfigs: vi.fn().mockResolvedValue({
    free: { limits: {}, features: {} },
    starter: { limits: {}, features: {} },
    pro: { limits: {}, features: {} },
    team: { limits: {}, features: {} },
  }),
  setPlanConfigs: vi.fn().mockResolvedValue(undefined),
  adminListWorkspaces: vi.fn().mockResolvedValue([]),
}));

vi.mock("./backup", () => ({
  exportBackupForDownload: vi.fn().mockResolvedValue({ version: 2, encrypted: true }),
}));

vi.mock("./email", () => ({
  EMAIL_TEMPLATE_REGISTRY: [{ type: "welcome", label: "Welcome", description: "", placeholders: [] }],
  getEmailConfig: vi.fn().mockResolvedValue({ enabled: true, senderName: "Slugly", senderEmail: "hello@slugly.io" }),
  setEmailConfig: vi.fn().mockResolvedValue(undefined),
  getAllTemplates: vi.fn().mockResolvedValue({}),
  getTemplate: vi.fn().mockResolvedValue({ subject: "Hello", bodyHtml: "<p>Hello</p>", enabled: true }),
  saveTemplate: vi.fn().mockResolvedValue({ success: true, warnings: [] }),
  renderPreview: vi.fn().mockReturnValue({ subject: "Hello", html: "<p>Hello</p>" }),
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
}));

function adminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin-clerk-id",
      email: "admin@example.com",
      name: "Admin",
      loginMethod: "clerk",
      role: "admin",
      plan: "team",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as any,
    workspace: { id: 1, name: "Admin Workspace", plan: "team", createdAt: new Date(), updatedAt: new Date() } as any,
    membership: { id: 1, workspaceId: 1, userId: 1, role: "owner", createdAt: new Date() } as any,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const reason = "Phase 2 regression smoke test";

describe("admin.* smoke", () => {
  beforeEach(() => vi.clearAllMocks());

  it("executes every admin procedure with a valid input", async () => {
    const admin = appRouter.createCaller(adminContext()).admin;

    await expect(admin.getMetrics()).resolves.toBeTruthy();
    await expect(admin.getReports({})).resolves.toEqual([]);
    await expect(admin.updateReport({ id: 1, status: "reviewed" })).resolves.toEqual({ success: true });

    await expect(admin.searchLinks({})).resolves.toEqual([]);
    await expect(admin.disableLink({ id: 1, reason } as any)).resolves.toEqual({ success: true });
    await expect(admin.deleteLink({ id: 1, reason } as any)).resolves.toEqual({ success: true });
    await expect(admin.cleanupExpiredAnonymous({ reason } as any)).resolves.toEqual({ success: true, count: 0 });

    await expect(admin.searchUsers({})).resolves.toEqual([]);
    await expect(admin.getUserCard({ id: 2 })).resolves.toBeTruthy();
    await expect(admin.suspendUser({ id: 2, reason } as any)).resolves.toEqual({ success: true });
    await expect(admin.unsuspendUser({ id: 2 })).resolves.toEqual({ success: true });
    await expect(admin.banUser({ id: 2, reason } as any)).resolves.toEqual({ success: true });
    await expect(admin.overridePlan({ workspaceId: 1, plan: "pro" })).resolves.toEqual({ success: true });
    await expect(admin.setRole({ id: 2, role: "support" })).resolves.toEqual({ success: true });
    await expect(admin.deleteUser({ id: 2, reason } as any)).resolves.toEqual({ success: true });

    await expect(admin.getBlockedDomains()).resolves.toEqual([]);
    await expect(admin.addBlockedDomain({ hostname: "bad.example", reason })).resolves.toEqual({ success: true });
    await expect(admin.removeBlockedDomain({ id: 1, reason } as any)).resolves.toEqual({ success: true });

    await expect(admin.getSiteSettings()).resolves.toBeTruthy();
    await expect(admin.updateSiteSettings({ safeMode: true })).resolves.toEqual({ success: true });

    await expect(admin.getPlanLimits()).resolves.toEqual({});
    await expect(admin.getPlanConfigs()).resolves.toBeTruthy();
    await expect(admin.updatePlanConfigs({ configs: {} })).resolves.toEqual({ success: true });
    await expect(admin.updatePlanLimits({ plan: "free", projects: 1, links: 5, domains: 0, seats: 1, analyticsRetentionDays: 30 })).resolves.toEqual({ success: true });

    await expect(admin.listWorkspaces({})).resolves.toEqual([]);
    await expect(admin.overrideWorkspacePlan({ workspaceId: 1, plan: "starter" })).resolves.toEqual({ success: true });

    await expect(admin.getReservedSlugs()).resolves.toEqual([]);
    await expect(admin.updateReservedSlugs({ slugs: ["reserved"] })).resolves.toEqual({ success: true });
    await expect(admin.getAuditLog({ limit: 10 })).resolves.toEqual([]);

    await expect(admin.exportBackup()).resolves.toBeTruthy();
    await expect(admin.getBackupInfo()).resolves.toBeTruthy();

    await expect(admin.getEmailConfig()).resolves.toBeTruthy();
    await expect(admin.updateEmailConfig({ senderName: "Slugly" })).resolves.toEqual({ success: true });
    await expect(admin.getTemplateRegistry()).resolves.toBeTruthy();
    await expect(admin.getAllTemplates()).resolves.toEqual({});
    await expect(admin.getTemplate({ type: "welcome" })).resolves.toBeTruthy();
    await expect(admin.saveTemplate({ type: "welcome", subject: "Welcome", bodyHtml: "<p>Hello</p>", enabled: true })).resolves.toBeTruthy();
    await expect(admin.previewTemplate({ type: "welcome", subject: "Welcome", bodyHtml: "<p>Hello</p>" })).resolves.toBeTruthy();
    await expect(admin.sendTestEmail({ to: "qa@example.com", templateType: "welcome" })).resolves.toEqual({ success: true });
  });
});
