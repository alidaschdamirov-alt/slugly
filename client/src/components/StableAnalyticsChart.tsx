import type { ReactElement } from "react";
import { ResponsiveContainer } from "recharts";

export const ANALYTICS_CHART_ANIMATION = false;

export function getStableAnalyticsChartProps(height: number) {
  return {
    width: "100%" as const,
    height: "100%" as const,
    minWidth: 1,
    initialDimension: { width: 640, height },
  };
}

export default function StableAnalyticsChart({
  children,
  height = 250,
}: {
  children: ReactElement;
  height?: number;
}) {
  const props = getStableAnalyticsChartProps(height);
  return (
    <div className="w-full min-w-0" style={{ height }}>
      <ResponsiveContainer {...props}>{children}</ResponsiveContainer>
    </div>
  );
}
