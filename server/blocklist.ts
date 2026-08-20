import { getBlockedDomains } from "./db";

const CACHE_TTL_MS = 30_000;
let cache: { patterns: string[]; expiresAt: number } | null = null;

function normalizePattern(value: string) {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

export function hostnameMatchesBlockPattern(hostname: string, pattern: string): boolean {
  const host = normalizePattern(hostname);
  const normalizedPattern = normalizePattern(pattern);
  if (!host || !normalizedPattern) return false;

  if (normalizedPattern.startsWith("*.")) {
    const root = normalizedPattern.slice(2);
    if (!root) return false;
    return host !== root && host.endsWith(`.${root}`);
  }

  return host === normalizedPattern;
}

async function getPatterns() {
  if (cache && cache.expiresAt > Date.now()) return cache.patterns;
  const rows = await getBlockedDomains();
  const patterns = rows.map(row => normalizePattern(row.hostname)).filter(Boolean);
  cache = { patterns, expiresAt: Date.now() + CACHE_TTL_MS };
  return patterns;
}

export function invalidateBlocklistCache() {
  cache = null;
}

export async function isHostnameBlockedByPolicy(hostname: string): Promise<boolean> {
  const patterns = await getPatterns();
  return patterns.some(pattern => hostnameMatchesBlockPattern(hostname, pattern));
}

export async function isDestinationBlockedByPolicy(destinationUrl: string): Promise<boolean> {
  try {
    const hostname = new URL(destinationUrl).hostname;
    return isHostnameBlockedByPolicy(hostname);
  } catch {
    return false;
  }
}
