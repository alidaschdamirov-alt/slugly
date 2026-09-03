import { useAuth } from "@/_core/hooks/useAuth";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { ArrowLeft, Link2, Loader2, MousePointerClick, TrendingUp } from "lucide-react";
import CsvExportButton from "@/components/CsvExportButton";
import StableAnalyticsChart, { ANALYTICS_CHART_ANIMATION } from "@/components/StableAnalyticsChart";
import { fetchProjectAnalyticsCsv } from "@/lib/csvExport";
import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

export default function ProjectAnalytics() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const projectId = parseInt(params.id || "0");
  const [days, setDays] = useState(30);
  const utils = trpc.useUtils();

  const { data: project } = trpc.project.get.useQuery({ id: projectId }, { enabled: !!user && projectId > 0 });
  const { data: analytics, isLoading } = trpc.project.analytics.useQuery(
    { id: projectId, days },
    { enabled: !!user && projectId > 0 }
  );

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!user) { window.location.href = getLoginUrl(); return null; }

  return (
    <AppShell>
      <button onClick={() => setLocation(`/project/${projectId}`)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
        <ArrowLeft className="h-4 w-4" />
        Back to {project?.name || "Project"}
      </button>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">
            {project?.name || "Project"} Analytics
          </h1>
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              {[7, 14, 30, 90].map(d => (
                <Button key={d} variant={days === d ? "default" : "outline"} size="sm" onClick={() => setDays(d)}>
                  {d}d
                </Button>
              ))}
            </div>
            <CsvExportButton
              data={undefined}
              filename={`project-${projectId}-analytics`}
              onFetch={() => fetchProjectAnalyticsCsv(utils, projectId, days)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : !analytics ? (
          <p className="text-center text-muted-foreground py-16">No analytics data</p>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <MousePointerClick className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{analytics.totalClicks.toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground">Total Clicks</p>
                  </div>
                </div>
              </Card>
              <Card className="p-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{(analytics as any).uniqueClicks?.toLocaleString() ?? '—'}</p>
                    <p className="text-sm text-muted-foreground">Unique Visitors</p>
                  </div>
                </div>
              </Card>
              <Card className="p-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Link2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{analytics.activeLinkCount}</p>
                    <p className="text-sm text-muted-foreground">Active Links</p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Clicks over time */}
            <Card className="p-6">
              <h3 className="font-medium mb-4">Clicks Over Time</h3>
              {analytics.clicksOverTime.length > 0 ? (
                <StableAnalyticsChart>
                  <AreaChart data={analytics.clicksOverTime}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="count" stroke="oklch(0.55 0.22 270)" fill="oklch(0.55 0.22 270 / 0.2)" strokeWidth={2} isAnimationActive={ANALYTICS_CHART_ANIMATION} />
                  </AreaChart>
                </StableAnalyticsChart>
              ) : (
                <p className="text-center text-muted-foreground py-8">No click data for this period</p>
              )}
            </Card>

            {/* Top links */}
            <Card className="p-6">
              <h3 className="font-medium mb-4">Top Links</h3>
              {analytics.topLinks.length > 0 ? (
                <div className="space-y-3">
                  {analytics.topLinks.map((item: any, i: number) => (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
                      onClick={() => setLocation(`/link/${item.linkId}/analytics`)}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {item.link?.title || item.link?.shortCode || `Link #${item.linkId}`}
                        </p>
                        <code className="text-xs text-muted-foreground font-mono">/r/{item.link?.shortCode}</code>
                      </div>
                      <span className="text-sm font-semibold">{item.count.toLocaleString()} clicks</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No click data yet</p>
              )}
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
