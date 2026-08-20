import { EventEmitter } from "events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getSiteSetting = vi.fn();
const setSiteSetting = vi.fn();
const execute = vi.fn();

vi.mock("./db", () => ({
  getDb: vi.fn(async () => ({ execute })),
  getSiteSetting,
  setSiteSetting,
}));

vi.mock("./safeBrowsing", () => ({
  checkUrlSafety: vi.fn(async () => ({ safe: true, verdict: "clean", threatTypes: [] })),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn(async () => true),
}));

function fakeResponse(statusCode = 200) {
  const emitter = new EventEmitter() as EventEmitter & {
    statusCode: number;
    json: (body: unknown) => unknown;
  };
  emitter.statusCode = statusCode;
  emitter.json = body => body;
  return emitter;
}

describe("System Health telemetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSiteSetting.mockResolvedValue(null);
    setSiteSetting.mockResolvedValue(undefined);
    execute.mockResolvedValue([]);
    process.env.RESEND_API_KEY = "test";
    process.env.VITE_AMPLITUDE_API_KEY = "test";
  });

  it("records redirect latency and exposes p50/p95/p99 plus alert channel", async () => {
    vi.resetModules();
    const health = await import("./systemHealth");
    const response = fakeResponse(302);
    const next = vi.fn();

    health.systemHealthMetricsMiddleware(
      { path: "/r/demo", method: "GET" } as any,
      response as any,
      next
    );
    expect(next).toHaveBeenCalledOnce();
    await new Promise(resolve => setTimeout(resolve, 2));
    response.emit("finish");

    const snapshot = await health.getSystemHealthSnapshot();
    expect(snapshot.http.redirect.requests).toBe(1);
    expect(snapshot.http.redirect.latencyMs.p50).not.toBeNull();
    expect(snapshot.http.redirect.latencyMs.p95).not.toBeNull();
    expect(snapshot.http.redirect.latencyMs.p99).not.toBeNull();
    expect(snapshot.alerts.enabled).toBe(true);
    expect(snapshot.alerts.channel).toBe("owner_notification");
  });

  it("persists a successful scheduled job result with processed count", async () => {
    vi.resetModules();
    const health = await import("./systemHealth");
    const response = fakeResponse(200);
    const next = vi.fn();

    health.backgroundJobTelemetryMiddleware(
      { path: "/api/scheduled/backup", method: "POST" } as any,
      response as any,
      next
    );
    response.json({ ok: true, processed: 12 });
    response.emit("finish");
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(setSiteSetting).toHaveBeenCalledWith(
      "system_health_job_backup",
      expect.stringContaining('"status":"success"')
    );
    expect(setSiteSetting).toHaveBeenCalledWith(
      "system_health_job_backup",
      expect.stringContaining('"processed":12')
    );
  });
});
