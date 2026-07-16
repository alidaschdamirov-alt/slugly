import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock site_settings storage
const mockSettings: Record<string, string> = {};
vi.mock("./db", () => ({
  getSiteSetting: vi.fn(async (key: string) => mockSettings[key] || null),
  setSiteSetting: vi.fn(async (key: string, value: string) => { mockSettings[key] = value; }),
  writeAuditLog: vi.fn(async () => {}),
}));

// Mock resend
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn(async () => ({ data: { id: "test-id" }, error: null })) },
  })),
}));

describe("Email Template Engine", () => {
  beforeEach(() => {
    Object.keys(mockSettings).forEach((k) => delete mockSettings[k]);
  });

  it("should return all template types in registry", async () => {
    const { EMAIL_TEMPLATE_REGISTRY } = await import("./email");
    expect(EMAIL_TEMPLATE_REGISTRY.length).toBe(5);
    const types = EMAIL_TEMPLATE_REGISTRY.map((d) => d.type);
    expect(types).toContain("invite");
    expect(types).toContain("welcome");
    expect(types).toContain("reportReceived");
    expect(types).toContain("anonymousLinkExpiring");
    expect(types).toContain("weeklyDigest");
  });

  it("should seed default template on first getTemplate call", async () => {
    const { getTemplate } = await import("./email");
    const tmpl = await getTemplate("invite");
    expect(tmpl.subject).toContain("{workspaceName}");
    expect(tmpl.bodyHtml).toContain("{inviteUrl}");
    expect(tmpl.enabled).toBe(true);
  });

  it("should render template with variable substitution", async () => {
    const { renderTemplate } = await import("./email");
    const result = await renderTemplate("invite", {
      inviterName: "Alice",
      workspaceName: "Acme",
      role: "editor",
      inviteUrl: "https://example.com/invite/abc",
      expiresIn: "7 days",
    });
    expect(result).not.toBeNull();
    expect(result!.subject).toContain("Acme");
    expect(result!.html).toContain("Alice");
    expect(result!.html).toContain("https://example.com/invite/abc");
    expect(result!.html).not.toContain("{inviterName}");
  });

  it("should return null when template is disabled", async () => {
    const { saveTemplate, renderTemplate } = await import("./email");
    await saveTemplate("welcome", { enabled: false }, 1, "admin");
    const result = await renderTemplate("welcome", { name: "Test", dashboardUrl: "/dash" });
    expect(result).toBeNull();
  });

  it("should warn when required placeholder is missing", async () => {
    const { saveTemplate } = await import("./email");
    const result = await saveTemplate(
      "invite",
      { subject: "Hello!", bodyHtml: "<p>No placeholders here</p>" },
      1,
      "admin"
    );
    expect(result.success).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes("{workspaceName}"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("{inviteUrl}"))).toBe(true);
  });

  it("should warn on unknown placeholders", async () => {
    const { saveTemplate } = await import("./email");
    const result = await saveTemplate(
      "invite",
      {
        subject: "Join {workspaceName}",
        bodyHtml: "<p>{inviteUrl} {unknownVar}</p>",
      },
      1,
      "admin"
    );
    expect(result.warnings.some((w) => w.includes("{unknownVar}"))).toBe(true);
  });

  it("should render preview with test values", async () => {
    const { renderPreview } = await import("./email");
    const result = renderPreview("invite", "Join {workspaceName}", "<p>{inviterName} invited you to {workspaceName}</p>");
    expect(result.subject).toContain("Acme Marketing");
    expect(result.html).toContain("John Doe");
    expect(result.html).not.toContain("{inviterName}");
  });

  it("should get all templates", async () => {
    const { getAllTemplates } = await import("./email");
    const all = await getAllTemplates();
    expect(Object.keys(all).length).toBe(5);
    expect(all.invite).toBeDefined();
    expect(all.welcome).toBeDefined();
    expect(all.reportReceived).toBeDefined();
    expect(all.anonymousLinkExpiring).toBeDefined();
    expect(all.weeklyDigest).toBeDefined();
  });
});
