import { describe, expect, it } from "vitest";
import { getEffectiveLinkStatus } from "./linkStatus";

const NOW = new Date("2026-08-20T08:00:00.000Z").getTime();

describe("getEffectiveLinkStatus", () => {
  it("returns broken before scheduled", () => {
    expect(getEffectiveLinkStatus({
      destinationInvalid: true,
      activeFrom: NOW + 60_000,
      status: "active",
    }, NOW)).toBe("broken");
  });

  it("returns broken before expired", () => {
    expect(getEffectiveLinkStatus({
      destinationInvalid: true,
      expiresAt: NOW - 60_000,
      status: "active",
    }, NOW)).toBe("broken");
  });

  it("returns broken before paused", () => {
    expect(getEffectiveLinkStatus({
      destinationInvalid: true,
      status: "paused",
    }, NOW)).toBe("broken");
  });

  it("detects broken destination from invalid URL when flag is absent", () => {
    expect(getEffectiveLinkStatus({
      destinationUrl: "https://test/",
      status: "active",
    }, NOW)).toBe("broken");
  });

  it("returns paused", () => {
    expect(getEffectiveLinkStatus({ status: "paused", destinationUrl: "https://example.com/" }, NOW)).toBe("paused");
  });

  it("returns expired", () => {
    expect(getEffectiveLinkStatus({ status: "active", destinationUrl: "https://example.com/", expiresAt: NOW }, NOW)).toBe("expired");
  });

  it("returns scheduled", () => {
    expect(getEffectiveLinkStatus({ status: "active", destinationUrl: "https://example.com/", activeFrom: NOW + 60_000 }, NOW)).toBe("scheduled");
  });

  it("returns active", () => {
    expect(getEffectiveLinkStatus({ status: "active", destinationUrl: "https://example.com/" }, NOW)).toBe("active");
  });
});
