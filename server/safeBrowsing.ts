import { ENV } from "./_core/env";

/**
 * URL safety checker using Google Safe Browsing Lookup API v4.
 * Falls back to URLhaus API if Safe Browsing key is not configured.
 * Results are cached by hostname with a short TTL to avoid excessive API calls.
 */

interface SafetyResult {
  safe: boolean;
  reason?: string;
}

// In-memory cache by hostname (TTL: 5 minutes)
const cache = new Map<string, { result: SafetyResult; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getHostname(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function getCachedResult(hostname: string): SafetyResult | null {
  const entry = cache.get(hostname);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(hostname);
    return null;
  }
  return entry.result;
}

function setCachedResult(hostname: string, result: SafetyResult) {
  cache.set(hostname, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  // Evict old entries periodically (keep cache under 10K entries)
  if (cache.size > 10000) {
    const now = Date.now();
    const keys = Array.from(cache.keys());
    for (const key of keys) {
      const val = cache.get(key);
      if (val && now > val.expiresAt) cache.delete(key);
    }
  }
}

/**
 * Check if a URL is safe. Returns { safe: true } or { safe: false, reason: "..." }.
 */
export async function checkUrlSafety(url: string): Promise<SafetyResult> {
  const hostname = getHostname(url);
  if (!hostname) return { safe: false, reason: "Invalid URL" };

  // Check cache first
  const cached = getCachedResult(hostname);
  if (cached !== null) return cached;

  // Try Google Safe Browsing first
  const apiKey = (ENV as any).SAFE_BROWSING_API_KEY || process.env.SAFE_BROWSING_API_KEY;
  if (apiKey) {
    const result = await checkGoogleSafeBrowsing(url, apiKey);
    setCachedResult(hostname, result);
    return result;
  }

  // Fallback: URLhaus API (free, no key needed)
  const result = await checkUrlhaus(url, hostname);
  setCachedResult(hostname, result);
  return result;
}

async function checkGoogleSafeBrowsing(url: string, apiKey: string): Promise<SafetyResult> {
  try {
    const endpoint = `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${apiKey}`;
    const body = {
      client: { clientId: "slugly", clientVersion: "1.0" },
      threatInfo: {
        threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
        platformTypes: ["ANY_PLATFORM"],
        threatEntryTypes: ["URL"],
        threatEntries: [{ url }],
      },
    };

    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });

    if (!resp.ok) {
      console.error(`[SafeBrowsing] API error: ${resp.status}`);
      // On API error, allow the URL (fail-open to not block users)
      return { safe: true };
    }

    const data = await resp.json() as { matches?: any[] };
    if (data.matches && data.matches.length > 0) {
      const threatType = data.matches[0].threatType || "UNKNOWN";
      return { safe: false, reason: `URL flagged as ${threatType.toLowerCase().replace(/_/g, " ")}` };
    }

    return { safe: true };
  } catch (err) {
    console.error("[SafeBrowsing] Request failed:", err);
    // Fail-open on network errors
    return { safe: true };
  }
}

async function checkUrlhaus(url: string, hostname: string): Promise<SafetyResult> {
  try {
    // URLhaus host lookup
    const resp = await fetch("https://urlhaus-api.abuse.ch/v1/host/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `host=${encodeURIComponent(hostname)}`,
      signal: AbortSignal.timeout(5000),
    });

    if (!resp.ok) {
      return { safe: true }; // Fail-open
    }

    const data = await resp.json() as { query_status?: string; urls?: any[] };
    if (data.query_status === "no_results") {
      return { safe: true };
    }

    // If there are active URLs for this host, flag it
    if (data.urls && data.urls.some((u: any) => u.url_status === "online")) {
      return { safe: false, reason: "URL host found in URLhaus malware database" };
    }

    return { safe: true };
  } catch (err) {
    console.error("[URLhaus] Request failed:", err);
    return { safe: true }; // Fail-open
  }
}
