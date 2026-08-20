import { ENV } from "./_core/env";
import { normalizeDestinationUrl } from "../shared/validation/destination-url";

/**
 * URL safety checker using Google Safe Browsing Lookup API v4.
 * Falls back to URLhaus API if Safe Browsing key is not configured.
 * Results are cached by normalized URL with a short TTL to avoid excessive API calls.
 */

export type ThreatVerdict = "clean" | "malicious" | "unknown";

export interface SafetyResult {
  safe: boolean;
  verdict: ThreatVerdict;
  threatTypes: string[];
  reason?: string;
}

const cache = new Map<string, { result: SafetyResult; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function getCachedResult(cacheKey: string): SafetyResult | null {
  const entry = cache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(cacheKey);
    return null;
  }
  return entry.result;
}

function setCachedResult(cacheKey: string, result: SafetyResult) {
  cache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  if (cache.size > 10000) {
    const now = Date.now();
    for (const [key, value] of cache.entries()) {
      if (now > value.expiresAt) cache.delete(key);
    }
  }
}

export function clearSafeBrowsingCache(url?: string) {
  if (!url) {
    cache.clear();
    return;
  }
  const normalized = normalizeDestinationUrl(url);
  if (normalized) cache.delete(normalized);
}

/**
 * Check if a URL is safe.
 * `safe` is retained for backwards compatibility: unknown is fail-open (`safe: true`).
 */
export async function checkUrlSafety(url: string): Promise<SafetyResult> {
  const normalized = normalizeDestinationUrl(url);
  if (!normalized) {
    return {
      safe: false,
      verdict: "malicious",
      threatTypes: ["INVALID_URL"],
      reason: "Enter a valid URL, for example https://example.com/page",
    };
  }

  const hostname = getHostname(normalized);
  if (!hostname) {
    return {
      safe: false,
      verdict: "malicious",
      threatTypes: ["INVALID_URL"],
      reason: "Invalid URL",
    };
  }

  const cached = getCachedResult(normalized);
  if (cached !== null) return cached;

  const apiKey =
    (ENV as any).SAFE_BROWSING_API_KEY || process.env.SAFE_BROWSING_API_KEY;
  const result = apiKey
    ? await checkGoogleSafeBrowsing(normalized, apiKey)
    : await checkUrlhaus(normalized, hostname);

  setCachedResult(normalized, result);
  return result;
}

async function checkGoogleSafeBrowsing(
  url: string,
  apiKey: string
): Promise<SafetyResult> {
  try {
    const endpoint = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`;
    const body = {
      client: { clientId: "slugly", clientVersion: "1.0.0" },
      threatInfo: {
        threatTypes: [
          "MALWARE",
          "SOCIAL_ENGINEERING",
          "UNWANTED_SOFTWARE",
          "POTENTIALLY_HARMFUL_APPLICATION",
        ],
        platformTypes: ["ANY_PLATFORM"],
        threatEntryTypes: ["URL"],
        threatEntries: [{ url }],
      },
    };

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });

    if (!resp.ok) {
      console.error(`[SafeBrowsing] API error: ${resp.status}`);
      return { safe: true, verdict: "unknown", threatTypes: [] };
    }

    const data = (await resp.json()) as { matches?: Array<{ threatType?: string }> };
    const matches = data.matches ?? [];
    if (matches.length > 0) {
      const threatTypes = matches
        .map(match => match.threatType || "UNKNOWN")
        .filter(Boolean);
      return {
        safe: false,
        verdict: "malicious",
        threatTypes,
        reason: `URL flagged as ${threatTypes[0].toLowerCase().replace(/_/g, " ")}`,
      };
    }

    return { safe: true, verdict: "clean", threatTypes: [] };
  } catch (err) {
    console.error("[SafeBrowsing] Request failed:", err);
    return { safe: true, verdict: "unknown", threatTypes: [] };
  }
}

async function checkUrlhaus(
  _url: string,
  hostname: string
): Promise<SafetyResult> {
  try {
    const resp = await fetch("https://urlhaus-api.abuse.ch/v1/host/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `host=${encodeURIComponent(hostname)}`,
      signal: AbortSignal.timeout(3000),
    });

    if (!resp.ok) {
      return { safe: true, verdict: "unknown", threatTypes: [] };
    }

    const data = (await resp.json()) as { query_status?: string; urls?: any[] };
    if (data.query_status === "no_results") {
      return { safe: true, verdict: "clean", threatTypes: [] };
    }

    if (data.urls && data.urls.some((entry: any) => entry.url_status === "online")) {
      return {
        safe: false,
        verdict: "malicious",
        threatTypes: ["URLHAUS_MALWARE"],
        reason: "URL host found in URLhaus malware database",
      };
    }

    return { safe: true, verdict: "clean", threatTypes: [] };
  } catch (err) {
    console.error("[URLhaus] Request failed:", err);
    return { safe: true, verdict: "unknown", threatTypes: [] };
  }
}
