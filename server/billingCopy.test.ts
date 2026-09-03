import { describe, expect, it } from "vitest";
import { customDomainPlanFeature } from "../client/src/lib/billingCopy";

describe("billing custom-domain copy", () => {
  it("shows the live domain allowances for each paid tier", () => {
    expect(customDomainPlanFeature(1)).toBe("1 custom domain");
    expect(customDomainPlanFeature(3)).toBe("3 custom domains");
    expect(customDomainPlanFeature(25)).toBe("25 custom domains");
  });
});
