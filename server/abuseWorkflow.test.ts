import { beforeEach, describe, expect, it, vi } from "vitest";

const getReports = vi.fn();
const adminGetAllUsersEnriched = vi.fn();
const getSiteSetting = vi.fn();
const setSiteSetting = vi.fn();
const updateReportStatus = vi.fn();
const getUserById = vi.fn();
const getLinkByShortCode = vi.fn();
const writeAuditEvent = vi.fn();

vi.mock("./db", () => ({
  getReports,
  adminGetAllUsersEnriched,
  getSiteSetting,
  setSiteSetting,
  updateReportStatus,
  getUserById,
  getLinkByShortCode,
}));

vi.mock("./audit", () => ({
  getAuditRequestContext: vi.fn(() => ({ ip: "203.0.113.10", userAgent: "test" })),
  writeAuditEvent,
}));

vi.mock("./email", () => ({
  escapeHtml: (value: string) => value,
  sendEmail: vi.fn(async () => ({ success: true, id: "mail_1" })),
}));

const req = {} as any;
const support = { id: 9, role: "support", name: "Support", email: "support@example.com" } as any;
const owner = { id: 42, role: "user", name: "Owner", email: "owner@example.com" } as any;

function report(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    shortCode: "abc123",
    reason: "phishing",
    reporterEmail: "reporter@example.com",
    status: "pending",
    createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    linkId: 99,
    userId: 42,
    destinationDomain: "https://example.com",
    ...overrides,
  };
}

describe("abuse workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSiteSetting.mockResolvedValue(null);
    setSiteSetting.mockResolvedValue(undefined);
    updateReportStatus.mockResolvedValue(undefined);
    writeAuditEvent.mockResolvedValue(undefined);
    adminGetAllUsersEnriched.mockResolvedValue([
      { id: 9, role: "support", name: "Support", email: "support@example.com" },
      { id: 10, role: "admin", name: "Admin", email: "admin@example.com" },
    ]);
    getReports.mockResolvedValue([report()]);
    getUserById.mockResolvedValue({ id: 9, role: "support", name: "Support" });
    getLinkByShortCode.mockResolvedValue({ id: 99, shortCode: "abc123", userId: 42 });
  });

  it("marks an unresolved report overdue after the 24-hour SLA", async () => {
    vi.resetModules();
    const { listAbuseWorkflowReports } = await import("./abuseWorkflow");
    const data = await listAbuseWorkflowReports();
    expect(data.slaHours).toBe(24);
    expect(data.reports[0].workflow.status).toBe("new");
    expect(data.reports[0].sla.overdue).toBe(true);
  });

  it("maps in_review and resolved transitions back to legacy report states", async () => {
    vi.resetModules();
    const { updateAbuseWorkflow } = await import("./abuseWorkflow");
    const reviewing = await updateAbuseWorkflow({ reportId: 7, actor: support, req, status: "in_review", priority: "high", assigneeId: 9 });
    expect(reviewing.status).toBe("in_review");
    expect(reviewing.priority).toBe("high");
    expect(reviewing.assigneeId).toBe(9);
    expect(reviewing.firstResponseAt).not.toBeNull();
    expect(updateReportStatus).toHaveBeenCalledWith(7, "reviewed");

    getSiteSetting.mockResolvedValue(JSON.stringify(reviewing));
    await updateAbuseWorkflow({ reportId: 7, actor: support, req, status: "resolved" });
    expect(updateReportStatus).toHaveBeenCalledWith(7, "actioned");
  });

  it("rejects assignment to a normal user", async () => {
    getUserById.mockResolvedValue({ id: 55, role: "user" });
    vi.resetModules();
    const { updateAbuseWorkflow } = await import("./abuseWorkflow");
    await expect(updateAbuseWorkflow({ reportId: 7, actor: support, req, assigneeId: 55 })).rejects.toThrow("Assignee must be an admin or support user");
  });

  it("allows only the affected link owner to submit an appeal", async () => {
    vi.resetModules();
    const { submitAppeal } = await import("./abuseWorkflow");
    await expect(submitAppeal({ reportId: 7, actor: owner, req, message: "Please reconsider this decision because the link is legitimate." })).resolves.toMatchObject({ reportId: 7, userId: 42, status: "new" });

    const stranger = { ...owner, id: 77 };
    await expect(submitAppeal({ reportId: 7, actor: stranger, req, message: "I want to appeal this report even though I do not own the link." })).rejects.toThrow("Only the affected link owner may appeal this report");
  });
});
