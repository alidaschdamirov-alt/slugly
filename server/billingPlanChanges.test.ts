import { describe, expect, it } from "vitest";
import { isDirectPlanChangeEnabled } from "./billingPlanChanges";

describe("direct billing plan changes", () => {
  it("can never bypass checkout in production", () => {
    expect(isDirectPlanChangeEnabled({ NODE_ENV: "production", ALLOW_SIMULATED_PLAN_CHANGES: "true" })).toBe(false);
    expect(isDirectPlanChangeEnabled({ NODE_ENV: "production", ALLOW_SIMULATED_PLAN_CHANGES: undefined })).toBe(false);
  });

  it("requires an explicit opt-in outside production", () => {
    expect(isDirectPlanChangeEnabled({ NODE_ENV: "development", ALLOW_SIMULATED_PLAN_CHANGES: "true" })).toBe(true);
    expect(isDirectPlanChangeEnabled({ NODE_ENV: "development", ALLOW_SIMULATED_PLAN_CHANGES: undefined })).toBe(false);
  });
});
