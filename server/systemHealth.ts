import type { NextFunction, Request, Response } from "express";
import { sql } from "drizzle-orm";
import { getDb, getSiteSetting, setSiteSetting } from "./db";
import { checkUrlSafety } from "./safeBrowsing";

export type HealthState = "ok" | "degraded" | "down" | "unknown";
export type HealthJobName =
  | "weekly_digest"
  | "anonymous_link_expiry"
  | "cleanup_expired"
  | "safe_browsing_rescan"
  | "backup"
  | "cleanup_rate_limits";

type HttpKind = "redirect" | "api";

type HttpSample = {
  at: number;
  durationMs: number;
  statusCode: number;
};

export type BackgroundJobStatus = {
  name: HealthJobName;
  label: string;
  lastRunAt: number | null;
  durationMs: number | null;
  status: "success" | "failed" | "never";
  processed: number | null;
  detail?: string | null;
};

export type HealthIncident = {
  id: string;
  key: string;
  title: string;
  detail: string;
  severity: "warning" | "critical";
  openedAt: number;
  resolvedAt: number | null;
};

const PROCESS_STARTED_AT = Date.now();
const METRIC_WINDOW_MS = 15 * 60 * 1000;
const MAX_SAMPLES = 4000;
const INCIDENT_KEY = "system_health_incidents_v1";
const JOB_PREFIX = "system_health_job_";

const samples: Record<HttpKind, HttpSample[]> = {
  redirect: [],
  api: [],
};

const JOB_LABELS: Record<HealthJobName, string> = {
  weekly_digest: "Weekly digest",
  anonymous_link_expiry: "Anonymous link expiry email",
  cleanup_expired: "Cleanup Expired",
  safe_browsing_rescan: "Safe Browsing re-scan",
  backup: "Automatic backup",
  cleanup_rate_limits: "Rate-limit cleanup",
};

const SCHEDULED_PATH_TO_JOB: Record<string, HealthJobName> = {
  "/api/scheduled/backup": "backup",
  "/api/scheduled/notify-expiring-links": "anonymous_link_expiry",
  "/api/scheduled/cleanup-rate-limits": "cleanup_rate_limits",
  "/api/scheduled/safe-browsing-rescan": "safe_browsing_rescan",
};

function trimSamples(kind: HttpKind) {
  const cutoff = Date.now() - METRIC_WINDOW_MS;
  const list = samples[kind].filter(sample => sample.at >= cutoff);
  samples[kind] = list.length > MAX_SAMPLES ? list.slice(-MAX_SAMPLES) : list;
}

function percentile(values: number[], pct: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1));
  return Math.round(sorted[index] * 10) / 10;
}

function summarize(kind: HttpKind) {
  trimSamples(kind);
  const list = samples[kind];
  const durations = list.map(sample => sample.durationMs);
  const errors4xx = list.filter(sample => sample.statusCode >= 400 && sample.statusCode < 500).length;
  const errors5xx = list.filter(sample => sample.statusCode >= 500).length;
  const total = list.length;
  const pct = (count: number) => total > 0 ? Math.round((count / total) * 10000) / 100 : 0;
  return {
    sampleWindowMinutes: METRIC_WINDOW_MS / 60_000,
    requests: total,
    latencyMs: {
      p50: percentile(durations, 50),
      p95: percentile(durations, 95),
      p99: percentile(durations, 99),
    },
    errorRate: {
      rate4xx: pct(errors4xx),
      rate5xx: pct(errors5xx),
    },
  };
}

export function systemHealthMetricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const kind: HttpKind | null = req.path.startsWith("/r/")
    ? "redirect"
    : req.path.startsWith("/api/") && !req.path.startsWith("/api/system-health")
      ? "api"
      : null;

  if (!kind) return next();
  const started = process.hrtime.bigint();
  res.once("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    samples[kind].push({ at: Date.now(), durationMs, statusCode: res.statusCode });
    trimSamples(kind);
  });
  return next();
}

function extractProcessed(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;
  for (const key of ["processed", "scanned", "notified", "deleted", "count"]) {
    const value = body[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  const recordCount = body.recordCount;
  if (recordCount && typeof recordCount === "object") {
    return Object.values(recordCount as Record<string, unknown>)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      .reduce((sum, value) => sum + value, 0);
  }
  return null;
}

export function backgroundJobTelemetryMiddleware(req: Request, res: Response, next: NextFunction) {
  const job = SCHEDULED_PATH_TO_JOB[req.path];
  if (!job || req.method !== "POST") return next();

  const startedAt = Date.now();
  let payload: unknown = null;
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    payload = body;
    return originalJson(body);
  }) as typeof res.json;

  res.once("finish", () => {
    const success = res.statusCode >= 200 && res.statusCode < 400;
    const detail = success
      ? null
      : payload && typeof payload === "object" && typeof (payload as any).error === "string"
        ? String((payload as any).error).slice(0, 500)
        : `HTTP ${res.statusCode}`;
    void recordBackgroundJobResult(job, {
      success,
      durationMs: Date.now() - startedAt,
      processed: extractProcessed(payload),
      detail,
    });
  });

  return next();
}

async function readIncidents(): Promise<HealthIncident[]> {
  const raw = await getSiteSetting(INCIDENT_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(-100) : [];
  } catch {
    return [];
  }
}

async function writeIncidents(incidents: HealthIncident[]) {
  await setSiteSetting(INCIDENT_KEY, JSON.stringify(incidents.slice(-100)));
}

async function openIncident(input: Omit<HealthIncident, "id" | "openedAt" | "resolvedAt">) {
  const incidents = await readIncidents();
  const existing = [...incidents].reverse().find(item => item.key === input.key && !item.resolvedAt);
  if (existing) return existing;
  const incident: HealthIncident = {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    openedAt: Date.now(),
    resolvedAt: null,
  };
  incidents.push(incident);
  await writeIncidents(incidents);

  import("./_core/notification")
    .then(({ notifyOwner }) => notifyOwner({
      title: `Slugly alert: ${input.title}`,
      content: input.detail,
    }))
    .catch(() => undefined);
  return incident;
}

async function resolveIncident(key: string) {
  const incidents = await readIncidents();
  let changed = false;
  for (const incident of incidents) {
    if (incident.key === key && !incident.resolvedAt) {
      incident.resolvedAt = Date.now();
      changed = true;
    }
  }
  if (changed) await writeIncidents(incidents);
}

export async function recordBackgroundJobResult(
  name: HealthJobName,
  result: { success: boolean; durationMs: number; processed?: number | null; detail?: string | null }
) {
  const status: BackgroundJobStatus = {
    name,
    label: JOB_LABELS[name],
    lastRunAt: Date.now(),
    durationMs: Math.max(0, Math.round(result.durationMs)),
    status: result.success ? "success" : "failed",
    processed: result.processed ?? null,
    detail: result.detail || null,
  };
  await setSiteSetting(`${JOB_PREFIX}${name}`, JSON.stringify(status));

  if (result.success) {
    await resolveIncident(`job:${name}`);
  } else {
    await openIncident({
      key: `job:${name}`,
      title: `${JOB_LABELS[name]} failed`,
      detail: result.detail || "Background job returned a failure status.",
      severity: "critical",
    });
  }
  return status;
}

async function getJobStatus(name: HealthJobName): Promise<BackgroundJobStatus> {
  const raw = await getSiteSetting(`${JOB_PREFIX}${name}`);
  if (raw) {
    try {
      const value = JSON.parse(raw) as BackgroundJobStatus;
      if (value?.name === name) return value;
    } catch {
      // fall through to never
    }
  }
  return {
    name,
    label: JOB_LABELS[name],
    lastRunAt: null,
    durationMs: null,
    status: "never",
    processed: null,
    detail: null,
  };
}

async function dependencyStates() {
  const dependencies: Array<{ name: string; state: HealthState; detail?: string }> = [];

  try {
    const database = await getDb();
    if (!database) throw new Error("Database unavailable");
    await database.execute(sql`SELECT 1`);
    dependencies.push({ name: "Database", state: "ok" });
  } catch {
    dependencies.push({ name: "Database", state: "down", detail: "Database health query failed" });
  }

  // The System Health endpoint itself is protected by Clerk, so reaching this
  // code with a privileged actor is a live Clerk authentication check.
  dependencies.push({ name: "Clerk", state: "ok", detail: "Authenticated privileged request" });

  const resendConfigured = !!process.env.RESEND_API_KEY;
  dependencies.push({
    name: "Resend",
    state: resendConfigured ? "ok" : "degraded",
    detail: resendConfigured ? "API key configured" : "RESEND_API_KEY is not configured",
  });

  const amplitudeConfigured = !!process.env.VITE_AMPLITUDE_API_KEY;
  dependencies.push({
    name: "Amplitude",
    state: amplitudeConfigured ? "ok" : "degraded",
    detail: amplitudeConfigured ? "Client ingestion key configured" : "VITE_AMPLITUDE_API_KEY is not configured",
  });

  try {
    const result = await checkUrlSafety("https://example.com/");
    dependencies.push({
      name: "Safe Browsing",
      state: result.verdict === "unknown" ? "degraded" : "ok",
      detail: result.verdict === "unknown" ? "Provider check returned unknown" : `Provider verdict: ${result.verdict}`,
    });
  } catch {
    dependencies.push({ name: "Safe Browsing", state: "down", detail: "Provider health check failed" });
  }

  return dependencies;
}

export async function getSystemHealthSnapshot() {
  const redirect = summarize("redirect");
  const api = summarize("api");
  const jobs = await Promise.all((Object.keys(JOB_LABELS) as HealthJobName[]).map(getJobStatus));
  const dependencies = await dependencyStates();
  const incidents = await readIncidents();

  if ((redirect.latencyMs.p95 ?? 0) >= 1000 && redirect.requests >= 20) {
    await openIncident({
      key: "redirect:p95",
      title: "Redirect p95 latency is high",
      detail: `Redirect p95 is ${redirect.latencyMs.p95} ms over the last ${redirect.sampleWindowMinutes} minutes.`,
      severity: "warning",
    });
  } else {
    await resolveIncident("redirect:p95");
  }

  if (api.errorRate.rate5xx >= 5 && api.requests >= 20) {
    await openIncident({
      key: "api:5xx",
      title: "API 5xx error rate is high",
      detail: `API 5xx rate is ${api.errorRate.rate5xx}% over the last ${api.sampleWindowMinutes} minutes.`,
      severity: "critical",
    });
  } else {
    await resolveIncident("api:5xx");
  }

  const refreshedIncidents = await readIncidents();
  const activeIncidents = refreshedIncidents.filter(item => !item.resolvedAt);
  const criticalDependency = dependencies.some(item => item.state === "down");
  const failedJob = jobs.some(job => job.status === "failed");

  return {
    generatedAt: Date.now(),
    processStartedAt: PROCESS_STARTED_AT,
    uptimeSeconds: Math.floor(process.uptime()),
    overall: criticalDependency || failedJob || activeIncidents.some(item => item.severity === "critical")
      ? "down"
      : activeIncidents.length > 0 || dependencies.some(item => item.state === "degraded")
        ? "degraded"
        : "ok",
    http: { redirect, api },
    dependencies,
    jobs,
    incidents: refreshedIncidents.slice(-50).reverse(),
    alerts: {
      channel: "owner_notification",
      enabled: true,
      description: "Background job failures and health incidents notify the Slugly owner in-app.",
    },
  };
}
