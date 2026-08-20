import net from "net";
import type { Request } from "express";
import { getSiteSetting, setSiteSetting } from "./db";

const SETTING_KEY = "privileged_ip_allowlist";

export function normalizeClientIp(value: string | null | undefined): string | null {
  if (!value) return null;
  let ip = value.trim();
  if (!ip) return null;
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip.includes("%")) ip = ip.split("%")[0];
  return net.isIP(ip) ? ip : null;
}

export function getRequestClientIp(req: Request): string | null {
  return normalizeClientIp(req.ip || req.socket?.remoteAddress || null);
}

export function parsePrivilegedIpAllowlist(value: string | null | undefined): string[] {
  if (!value) return [];
  return Array.from(
    new Set(
      value
        .split(/[\n,]+/)
        .map(item => item.trim())
        .filter(Boolean)
    )
  ).slice(0, 200);
}

function ipv4ToInt(ip: string): number | null {
  if (net.isIP(ip) !== 4) return null;
  const parts = ip.split(".").map(Number);
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

function matchesIpv4Cidr(ip: string, rule: string): boolean {
  const [networkRaw, prefixRaw] = rule.split("/");
  const network = normalizeClientIp(networkRaw);
  const prefix = Number(prefixRaw);
  if (!network || net.isIP(network) !== 4 || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return false;
  const ipInt = ipv4ToInt(ip);
  const networkInt = ipv4ToInt(network);
  if (ipInt === null || networkInt === null) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (networkInt & mask);
}

export function isIpAllowedByRules(ip: string | null, rules: readonly string[]): boolean {
  if (rules.length === 0) return true;
  if (!ip) return false;
  const normalizedIp = normalizeClientIp(ip);
  if (!normalizedIp) return false;

  return rules.some(rule => {
    if (rule.includes("/")) return matchesIpv4Cidr(normalizedIp, rule);
    const exact = normalizeClientIp(rule);
    return !!exact && exact === normalizedIp;
  });
}

export function validatePrivilegedIpRules(rules: readonly string[]): string[] {
  const invalid: string[] = [];
  for (const rule of rules) {
    if (rule.includes("/")) {
      const [networkRaw, prefixRaw] = rule.split("/");
      const network = normalizeClientIp(networkRaw);
      const prefix = Number(prefixRaw);
      if (!network || net.isIP(network) !== 4 || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) invalid.push(rule);
    } else if (!normalizeClientIp(rule)) {
      invalid.push(rule);
    }
  }
  return invalid;
}

export async function getPrivilegedIpAllowlist(): Promise<string[]> {
  return parsePrivilegedIpAllowlist(await getSiteSetting(SETTING_KEY));
}

export async function isPrivilegedIpAllowed(req: Request): Promise<boolean> {
  const rules = await getPrivilegedIpAllowlist();
  return isIpAllowedByRules(getRequestClientIp(req), rules);
}

export async function savePrivilegedIpAllowlist(rules: readonly string[]): Promise<string[]> {
  const normalized = Array.from(new Set(rules.map(rule => rule.trim()).filter(Boolean))).slice(0, 200);
  const invalid = validatePrivilegedIpRules(normalized);
  if (invalid.length > 0) throw new Error(`Invalid IP allowlist rule${invalid.length === 1 ? "" : "s"}: ${invalid.join(", ")}`);
  await setSiteSetting(SETTING_KEY, normalized.join("\n"));
  return normalized;
}
