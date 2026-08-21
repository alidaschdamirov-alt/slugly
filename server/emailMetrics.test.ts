import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  notifyOwner: vi.fn(),
}));

vi.mock("./db", () => ({
  getSiteSetting: vi.fn(async (key: string) => mocks.settings.get(key) ?? null),
  setSiteSetting: vi.fn(async (key: string, value: string) => { mocks.settings.set(key, value); }),
  getDb: vi.fn(async () => null),
}));

vi.mock("./_core/notification", () => ({ notifyOwner: mocks.notifyOwner }));

import { recordEmailSent, recordEmailWebhookEvent } from "./emailMetrics";

function storedRecords() {
  return Array.from(mocks.settings.entries())
    .filter(([key]) => key.startsWith("email_delivery_v1_"))
    .map(([, value]) => JSON.parse(value));
}

describe("email deliverability metrics", () => {
  beforeEach(() => {
    mocks.settings.clear();
    vi.clearAllMocks();
  });

  it("records a sent email per recipient with its template category", async () => {
    await recordEmailSent({
      emailId: "email_123",
      recipients: ["a@example.com", "b@example.com"],
      category: "weeklyDigest",
      subject: "Weekly report",
    });

    const records = storedRecords();
    expect(records).toHaveLength(2);
    expect(records.map(record => record.recipient).sort()).toEqual(["a@example.com", "b@example.com"]);
    expect(records.every(record => record.category === "weeklyDigest")).toBe(true);
    expect(records.every(record => typeof record.sentAt === "number")).toBe(true);
  });

  it("preserves category and records delivered/opened transitions", async () => {
    await recordEmailSent({
      emailId: "email_456",
      recipients: ["member@example.com"],
      category: "invite",
      subject: "Workspace invitation",
    });

    await recordEmailWebhookEvent({
      event: "delivered",
      emailId: "email_456",
      recipient: "member@example.com",
      subject: "Workspace invitation",
      createdAt: "2026-08-21T05:00:00.000Z",
    });
    await recordEmailWebhookEvent({
      event: "opened",
      emailId: "email_456",
      recipient: "member@example.com",
      createdAt: "2026-08-21T05:05:00.000Z",
    });

    const [record] = storedRecords();
    expect(record.category).toBe("invite");
    expect(record.deliveredAt).toBe(new Date("2026-08-21T05:00:00.000Z").getTime());
    expect(record.openedAt).toBe(new Date("2026-08-21T05:05:00.000Z").getTime());
    expect(record.bouncedAt).toBeNull();
  });

  it("keeps the first timestamp when Resend replays a webhook", async () => {
    await recordEmailWebhookEvent({
      event: "delivered",
      emailId: "email_replay",
      recipient: "qa@example.com",
      createdAt: "2026-08-21T05:00:00.000Z",
      tags: { category: "welcome" },
    });
    await recordEmailWebhookEvent({
      event: "delivered",
      emailId: "email_replay",
      recipient: "qa@example.com",
      createdAt: "2026-08-21T06:00:00.000Z",
      tags: { category: "welcome" },
    });

    const [record] = storedRecords();
    expect(record.deliveredAt).toBe(new Date("2026-08-21T05:00:00.000Z").getTime());
    expect(record.category).toBe("welcome");
  });

  it("stores bounce details without replacing existing send metadata", async () => {
    await recordEmailSent({
      emailId: "email_bounce",
      recipients: ["bad@example.com"],
      category: "reportReceived",
      subject: "Abuse report",
    });
    await recordEmailWebhookEvent({
      event: "bounced",
      emailId: "email_bounce",
      recipient: "bad@example.com",
      bounceMessage: "Mailbox unavailable",
      createdAt: "2026-08-21T05:10:00.000Z",
    });

    const [record] = storedRecords();
    expect(record.category).toBe("reportReceived");
    expect(record.subject).toBe("Abuse report");
    expect(record.bounceMessage).toBe("Mailbox unavailable");
    expect(record.bouncedAt).toBe(new Date("2026-08-21T05:10:00.000Z").getTime());
  });
});
