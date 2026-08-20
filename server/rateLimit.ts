import { sql } from "drizzle-orm";

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface SecurityRateLimitSettings {
  anonymousShorten: RateLimitConfig;
  abuseReport: RateLimitConfig;
}

export const DEFAULT_SECURITY_RATE_LIMITS: SecurityRateLimitSettings = {
  anonymousShorten: { windowMs: 60_000, maxRequests: 5 },
  abuseReport: { windowMs: 600_000, maxRequests: 3 },
};

const SETTINGS_KEY = "security_rate_limits";
const SETTINGS_CACHE_TTL_MS = 30_000;
let cachedSettings: { value: SecurityRateLimitSettings; expiresAt: number } | null = null;

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

export function normalizeSecurityRateLimitSettings(value: unknown): SecurityRateLimitSettings {
  const input = value && typeof value === "object" ? value as Record<string, any> : {};
  const anonymous = input.anonymousShorten || {};
  const report = input.abuseReport || {};
  return {
    anonymousShorten: {
      windowMs: clampInt(anonymous.windowMs, 1_000, 86_400_000, DEFAULT_SECURITY_RATE_LIMITS.anonymousShorten.windowMs),
      maxRequests: clampInt(anonymous.maxRequests, 1, 10_000, DEFAULT_SECURITY_RATE_LIMITS.anonymousShorten.maxRequests),
    },
    abuseReport: {
      windowMs: clampInt(report.windowMs, 1_000, 86_400_000, DEFAULT_SECURITY_RATE_LIMITS.abuseReport.windowMs),
      maxRequests: clampInt(report.maxRequests, 1, 10_000, DEFAULT_SECURITY_RATE_LIMITS.abuseReport.maxRequests),
    },
  };
}

function unwrapRows(result: any): any[] {
  if (Array.isArray(result?.[0])) return result[0];
  if (Array.isArray(result)) return result;
  return [];
}

export async function getSecurityRateLimitSettings(db: any): Promise<SecurityRateLimitSettings> {
  if (cachedSettings && cachedSettings.expiresAt > Date.now()) return cachedSettings.value;

  try {
    const result = await db.execute(
      sql`SELECT value FROM site_settings WHERE \`key\` = ${SETTINGS_KEY} LIMIT 1`
    );
    const rows = unwrapRows(result);
    const raw = rows[0]?.value;
    const parsed = typeof raw === "string" && raw ? JSON.parse(raw) : undefined;
    const value = normalizeSecurityRateLimitSettings(parsed);
    cachedSettings = { value, expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS };
    return value;
  } catch (error) {
    console.error("[RateLimit] Failed to load security rate-limit settings:", error);
    return DEFAULT_SECURITY_RATE_LIMITS;
  }
}

export async function saveSecurityRateLimitSettings(db: any, value: unknown): Promise<SecurityRateLimitSettings> {
  const normalized = normalizeSecurityRateLimitSettings(value);
  const serialized = JSON.stringify(normalized);
  await db.execute(sql`
    INSERT INTO site_settings (\`key\`, value)
    VALUES (${SETTINGS_KEY}, ${serialized})
    ON DUPLICATE KEY UPDATE value = ${serialized}
  `);
  cachedSettings = { value: normalized, expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS };
  return normalized;
}

export function invalidateSecurityRateLimitSettingsCache() {
  cachedSettings = null;
}

async function resolveRateLimitConfig(db: any, key: string, fallback: RateLimitConfig): Promise<RateLimitConfig> {
  const settings = await getSecurityRateLimitSettings(db);
  if (key.startsWith("anon_shorten_")) return settings.anonymousShorten;
  if (key.startsWith("report_")) return settings.abuseReport;
  return fallback;
}

/**
 * Persistent DB-backed rate limiter using atomic upsert.
 * Security-sensitive key families can be overridden from the admin Security panel.
 */
export async function checkRateLimit(
  db: any,
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const effective = await resolveRateLimitConfig(db, key, config);
  const now = Date.now();
  const windowStart = now;

  await db.execute(sql`
    INSERT INTO rate_limits (\`key\`, windowStart, count)
    VALUES (${key}, ${windowStart}, 1)
    ON DUPLICATE KEY UPDATE
      count = IF(
        ${now} - windowStart > ${effective.windowMs},
        1,
        count + 1
      ),
      windowStart = IF(
        ${now} - windowStart > ${effective.windowMs},
        ${windowStart},
        windowStart
      )
  `);

  const [rows] = await db.execute(
    sql`SELECT windowStart, count FROM rate_limits WHERE \`key\` = ${key} LIMIT 1`
  );
  const record = (rows as any[])?.[0] || rows;

  if (!record || !record.windowStart) {
    return { allowed: true, remaining: effective.maxRequests - 1, resetAt: now + effective.windowMs };
  }

  const currentCount = Number(record.count);
  const recordWindowStart = Number(record.windowStart);
  const resetAt = recordWindowStart + effective.windowMs;

  if (currentCount > effective.maxRequests) {
    return { allowed: false, remaining: 0, resetAt };
  }

  return {
    allowed: true,
    remaining: effective.maxRequests - currentCount,
    resetAt,
  };
}

export async function cleanupExpiredRateLimits(db: any, maxWindowMs: number = 600_000): Promise<number> {
  const cutoff = Date.now() - maxWindowMs;
  const result = await db.execute(
    sql`DELETE FROM rate_limits WHERE windowStart < ${cutoff}`
  );
  return (result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows ?? 0;
}

export async function verifyTurnstileToken(token: string | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;

  try {
    const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(5000),
    });

    if (!resp.ok) {
      console.error(`[Turnstile] API error: ${resp.status}`);
      return false;
    }

    const data = await resp.json() as { success: boolean };
    return data.success;
  } catch (err) {
    console.error("[Turnstile] Verification failed:", err);
    return false;
  }
}

export function isTurnstileEnabled(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY;
}
