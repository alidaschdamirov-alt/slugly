import { sql } from "drizzle-orm";
import { rateLimits } from "../drizzle/schema";

/**
 * Persistent DB-backed rate limiter using atomic upsert.
 * Uses INSERT ... ON DUPLICATE KEY UPDATE for atomicity under concurrent requests.
 */

interface RateLimitConfig {
  windowMs: number; // Window duration in milliseconds
  maxRequests: number; // Max requests per window
}

/**
 * Atomic check-and-increment rate limit.
 * Uses MySQL's INSERT ON DUPLICATE KEY UPDATE to avoid race conditions.
 * Returns true if the request is allowed, false if rate-limited.
 */
export async function checkRateLimit(
  db: any,
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const now = Date.now();
  const windowStart = now;

  // Atomic upsert: if key exists and window is still active, increment count.
  // If key exists but window expired, reset window and count.
  // If key doesn't exist, insert new record.
  await db.execute(sql`
    INSERT INTO rate_limits (\`key\`, windowStart, count)
    VALUES (${key}, ${windowStart}, 1)
    ON DUPLICATE KEY UPDATE
      count = IF(
        ${now} - windowStart > ${config.windowMs},
        1,
        count + 1
      ),
      windowStart = IF(
        ${now} - windowStart > ${config.windowMs},
        ${windowStart},
        windowStart
      )
  `);

  // Now read the current state to determine if allowed
  const [rows] = await db.execute(
    sql`SELECT windowStart, count FROM rate_limits WHERE \`key\` = ${key} LIMIT 1`
  );
  const record = (rows as any[])?.[0] || rows;

  if (!record || !record.windowStart) {
    // Shouldn't happen, but fail-open
    return { allowed: true, remaining: config.maxRequests - 1, resetAt: now + config.windowMs };
  }

  const currentCount = Number(record.count);
  const recordWindowStart = Number(record.windowStart);
  const resetAt = recordWindowStart + config.windowMs;

  if (currentCount > config.maxRequests) {
    return { allowed: false, remaining: 0, resetAt };
  }

  return {
    allowed: true,
    remaining: config.maxRequests - currentCount,
    resetAt,
  };
}

/**
 * Opportunistic cleanup of expired rate-limit windows.
 * Call periodically (e.g., from cron or after every Nth request).
 * Deletes rows whose window has expired (windowStart + maxWindowMs < now).
 */
export async function cleanupExpiredRateLimits(db: any, maxWindowMs: number = 600_000): Promise<number> {
  const cutoff = Date.now() - maxWindowMs;
  const result = await db.execute(
    sql`DELETE FROM rate_limits WHERE windowStart < ${cutoff}`
  );
  // MySQL returns affectedRows
  return (result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows ?? 0;
}

/**
 * Verify Cloudflare Turnstile token.
 * - If TURNSTILE_SECRET_KEY is NOT set: fail-open (skip verification).
 * - If TURNSTILE_SECRET_KEY IS set: fail-closed (reject missing/invalid tokens).
 */
export async function verifyTurnstileToken(token: string | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Turnstile not configured — skip verification (fail-open)
    return true;
  }

  // Key is configured: require a valid token
  if (!token) {
    return false; // No token provided — reject
  }

  try {
    const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(5000),
    });

    if (!resp.ok) {
      console.error(`[Turnstile] API error: ${resp.status}`);
      return false; // Fail-closed on API errors when key is configured
    }

    const data = await resp.json() as { success: boolean };
    return data.success;
  } catch (err) {
    console.error("[Turnstile] Verification failed:", err);
    return false; // Fail-closed on network errors when key is configured
  }
}

/**
 * Check if Turnstile is configured (so frontend knows whether to show widget).
 */
export function isTurnstileEnabled(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY;
}
