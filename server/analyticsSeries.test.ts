import { describe, expect, it } from "vitest";
import { fillDailyClickSeries } from "./analyticsSeries";

describe("fillDailyClickSeries", () => {
  it("fills missing days with zeroes and normalizes database counts", () => {
    const series = fillDailyClickSeries(
      [
        { day: "2026-08-31", count: "2" },
        { day: "2026-09-02", count: 1 },
      ],
      Date.UTC(2026, 7, 31, 12),
      Date.UTC(2026, 8, 3, 8),
    );

    expect(series).toEqual([
      { day: "2026-08-31", count: 2 },
      { day: "2026-09-01", count: 0 },
      { day: "2026-09-02", count: 1 },
      { day: "2026-09-03", count: 0 },
    ]);
  });
});
