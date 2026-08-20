import { describe, expect, it } from "vitest";
import { hasVerifiedSecondFactorAge, parseFactorVerificationAge } from "./_core/sdk";

describe("privileged MFA verification", () => {
  it("accepts Clerk sessions with a verified second factor", () => {
    expect(hasVerifiedSecondFactorAge([0, 0])).toBe(true);
    expect(hasVerifiedSecondFactorAge([10, 2])).toBe(true);
    expect(hasVerifiedSecondFactorAge(["5", "1"])).toBe(true);
  });

  it("rejects sessions without a registered or verified second factor", () => {
    expect(hasVerifiedSecondFactorAge([0, -1])).toBe(false);
    expect(hasVerifiedSecondFactorAge([-1, -1])).toBe(false);
    expect(hasVerifiedSecondFactorAge(null)).toBe(false);
    expect(hasVerifiedSecondFactorAge([])).toBe(false);
    expect(hasVerifiedSecondFactorAge([1])).toBe(false);
  });

  it("rejects malformed verification ages", () => {
    expect(parseFactorVerificationAge(["bad", 0])).toBeNull();
    expect(parseFactorVerificationAge([0, Number.NaN])).toBeNull();
    expect(parseFactorVerificationAge({ fva: [0, 0] })).toBeNull();
  });
});
