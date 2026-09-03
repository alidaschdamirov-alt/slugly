import { describe, expect, it } from "vitest";
import {
  getRenderVerificationStatus,
  normalizeCustomHostname,
  validateCustomHostname,
} from "./customDomainsApi";

describe("custom domain helpers", () => {
  it("normalizes subdomain input without changing www semantics", () => {
    expect(normalizeCustomHostname(" HTTPS://Go.Example.COM/path ")).toBe("go.example.com");
    expect(normalizeCustomHostname("www.example.com.")).toBe("www.example.com");
  });

  it("accepts valid branded subdomains", () => {
    expect(validateCustomHostname("go.example.com")).toBeNull();
    expect(validateCustomHostname("links.brand.co.uk")).toBeNull();
  });

  it("rejects root, IP, invalid, and Slugly-owned hosts", () => {
    expect(validateCustomHostname("example.com")).toMatch(/subdomain/i);
    expect(validateCustomHostname("127.0.0.1")).toMatch(/IP addresses/i);
    expect(validateCustomHostname("bad_name.example.com")).toMatch(/letters, numbers, and hyphens/i);
    expect(validateCustomHostname("-bad_.dom ain!!")).toMatch(/letters, numbers, and hyphens/i);
    expect(validateCustomHostname("go.slugly.io")).toMatch(/Slugly-owned/i);
  });

  it("parses Render verification status across response shapes", () => {
    expect(getRenderVerificationStatus({ verificationStatus: "verified" })).toBe("verified");
    expect(getRenderVerificationStatus({ customDomain: { verificationStatus: "unverified" } })).toBe("unverified");
    expect(getRenderVerificationStatus({ custom_domain: { status: "pending" } })).toBe("pending");
    expect(getRenderVerificationStatus({})).toBe("unknown");
  });
});
