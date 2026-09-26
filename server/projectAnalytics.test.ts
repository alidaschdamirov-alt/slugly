import { describe, expect, it } from "vitest";
import { countActiveProjectLinks } from "./projectAnalytics";

describe("countActiveProjectLinks", () => {
  it("counts all currently active links instead of the top-links slice", () => {
    const now = Date.UTC(2026, 8, 3);
    const active = Array.from({ length: 9 }, () => ({ status: "active", destinationUrl: "https://example.com" }));
    const inactive = [
      { status: "paused", destinationUrl: "https://example.com" },
      { status: "active", destinationUrl: "https://example.com", activeFrom: now + 1 },
      { status: "active", destinationUrl: "not a URL" },
    ];

    expect(countActiveProjectLinks([...active, ...inactive], now)).toBe(9);
  });
});
