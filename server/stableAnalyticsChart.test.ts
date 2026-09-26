import { describe, expect, it } from "vitest";
import {
  ANALYTICS_CHART_ANIMATION,
  getStableAnalyticsChartProps,
} from "../client/src/components/StableAnalyticsChart";

describe("stable analytics chart configuration", () => {
  it("has a measurable first render and avoids a stale animation frame", () => {
    expect(getStableAnalyticsChartProps(250)).toEqual({
      width: "100%",
      height: "100%",
      minWidth: 1,
      initialDimension: { width: 640, height: 250 },
    });
    expect(ANALYTICS_CHART_ANIMATION).toBe(false);
  });
});
