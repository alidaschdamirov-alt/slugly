import { describe, expect, it } from "vitest";
import { buildGs1DigitalLinkPath, validateGtin } from "./gs1";

describe("GS1 helpers", () => {
  it("validates and pads GTIN-13 to 14 digits", () => {
    const result = validateGtin("9520123456788");
    expect(result.valid).toBe(true);
    expect(result.normalized14).toBe("09520123456788");
  });

  it("rejects an invalid check digit", () => {
    const result = validateGtin("9520123456789");
    expect(result.valid).toBe(false);
  });

  it("builds GS1 Digital Link path in qualifier order", () => {
    expect(
      buildGs1DigitalLinkPath("09520123456788", {
        batchLot: "ABC1",
        serialNumber: "12345",
        expiryDate: "2028-04-26",
      })
    ).toBe("/01/09520123456788/10/ABC1/21/12345?17=280426");
  });
});
