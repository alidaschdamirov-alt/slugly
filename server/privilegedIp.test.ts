import { describe, expect, it } from "vitest";
import {
  isIpAllowedByRules,
  normalizeClientIp,
  parsePrivilegedIpAllowlist,
  validatePrivilegedIpRules,
} from "./privilegedIp";

describe("privileged IP allowlist", () => {
  it("allows all addresses when no rules are configured", () => {
    expect(isIpAllowedByRules("203.0.113.10", [])).toBe(true);
    expect(isIpAllowedByRules(null, [])).toBe(true);
  });

  it("matches exact IPv4 and IPv6 addresses", () => {
    expect(isIpAllowedByRules("203.0.113.10", ["203.0.113.10"])).toBe(true);
    expect(isIpAllowedByRules("203.0.113.11", ["203.0.113.10"])).toBe(false);
    expect(isIpAllowedByRules("2001:db8::1", ["2001:db8::1"])).toBe(true);
    expect(normalizeClientIp("::ffff:203.0.113.10")).toBe("203.0.113.10");
  });

  it("matches IPv4 CIDR ranges", () => {
    expect(isIpAllowedByRules("198.51.100.42", ["198.51.100.0/24"])).toBe(true);
    expect(isIpAllowedByRules("198.51.101.42", ["198.51.100.0/24"])).toBe(false);
    expect(isIpAllowedByRules("10.20.30.40", ["0.0.0.0/0"])).toBe(true);
    expect(isIpAllowedByRules("10.20.30.40", ["10.20.30.40/32"])).toBe(true);
  });

  it("parses newline/comma-separated rules and removes duplicates", () => {
    expect(parsePrivilegedIpAllowlist("203.0.113.10\n198.51.100.0/24,203.0.113.10")).toEqual([
      "203.0.113.10",
      "198.51.100.0/24",
    ]);
  });

  it("rejects invalid addresses and CIDR rules", () => {
    expect(validatePrivilegedIpRules(["203.0.113.10", "198.51.100.0/24"])).toEqual([]);
    expect(validatePrivilegedIpRules(["not-an-ip", "198.51.100.0/99", "2001:db8::/64"])).toEqual([
      "not-an-ip",
      "198.51.100.0/99",
      "2001:db8::/64",
    ]);
  });
});
