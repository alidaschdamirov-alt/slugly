import { describe, expect, it } from "vitest";
import {
  DEFAULT_SECURITY_RATE_LIMITS,
  normalizeSecurityRateLimitSettings,
} from "./rateLimit";

describe("security rate-limit settings", () => {
  it("keeps the existing production defaults", () => {
    expect(normalizeSecurityRateLimitSettings(undefined)).toEqual(DEFAULT_SECURITY_RATE_LIMITS);
  });

  it("accepts admin-configured thresholds", () => {
    expect(normalizeSecurityRateLimitSettings({
      anonymousShorten: { maxRequests: 12, windowMs: 120_000 },
      abuseReport: { maxRequests: 8, windowMs: 900_000 },
    })).toEqual({
      anonymousShorten: { maxRequests: 12, windowMs: 120_000 },
      abuseReport: { maxRequests: 8, windowMs: 900_000 },
    });
  });

  it("clamps unsafe values instead of disabling protection", () => {
    const result = normalizeSecurityRateLimitSettings({
      anonymousShorten: { maxRequests: 0, windowMs: 10 },
      abuseReport: { maxRequests: 999_999, windowMs: 999_999_999 },
    });

    expect(result.anonymousShorten).toEqual({ maxRequests: 1, windowMs: 1_000 });
    expect(result.abuseReport).toEqual({ maxRequests: 10_000, windowMs: 86_400_000 });
  });
});
