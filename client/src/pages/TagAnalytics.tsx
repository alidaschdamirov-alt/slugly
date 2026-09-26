import { useAuth } from "@/_core/hooks/useAuth";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { ArrowLeft, MousePointerClick, Globe, Monitor, Link2, Loader2, Tag } from "lucide-react";
import CsvExportButton from "@/components/CsvExportButton";
import { fetchTagAnalyticsCsv } from "@/lib/csvExport";
import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function TagAnalytics() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const params = useParams<{ tag: string }>();
  const tag = decodeURIComponent(params.tag || "");
  const [days, setDays] = useState(30);
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.tag.analytics.useQuery(
    { tag, days },
    { enabled: !!user && !!tag }
  );

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!user) { window.location.href = getLoginUrl(); return null; }

  return (
    <AppShell>
      <button onClick={() => setLocation("/tags")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
        <ArrowLeft className="h-4 w-4" />
        Back to Tags
      </button>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : !data ? (
        <div className="text-center py-16"><p className="text-muted-foreground">No data found for this tag</p></div>
      ) : (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary" className="text-base px-3 py-1">
                  <Tag className="h-4 w-4 mr-1.5" />
                  {tag}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Aggregate analytics for all links tagged with "{tag}"
              </p>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold">{data.totalClicks.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">total clicks</p>
            </div>
          </div>

          {/* Time range selector + CSV export */}
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              {[7, 14, 30, 90].map(d => (
                <Button key={d} variant={days === d ? "default" : "outline"} size="sm" onClick={() => setDays(d)}>
                  {d}d
                </Button>
              ))}
            </div>
            <CsvExportButton
              data={undefined}
              filename={`tag-${tag}-analytics`}
              onFetch={() => fetchTagAnalyticsCsv(utils, tag, days)}
            />
          </div>

          {/* Clicks over time chart */}
          <Card className="p-6">
            <h3 className="font-medium mb-4">Clicks Over Time</h3>
            {data.clicksOverTime.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={data.clicksOverTime}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                  <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                  <Tooltip />
                  <Area type="monotone" dataKey="count" stroke="oklch(0.55 0.22 270)" fill="oklch(0.55 0.22 270 / 0.2)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-8">No click data for this period</p>
            )}
          </Card>

          {/* Stats grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top Links */}
            <Card className="p-6">
              <h3 className="font-medium mb-4 flex items-center gap-2">
                <Link2 className="h-4 w-4 text-primary" />
                Top Links
              </h3>
              {data.topLinks.length > 0 ? (
                <div className="space-y-2">
                  {data.topLinks.map((tl: any, i: number) => (
                    <div
                      key={i}
                      className="cursor-pointer hover:bg-muted/50 rounded px-2 py-1.5 -mx-2 transition-colors"
                      onClick={() => tl.link && setLocation(`/link/${tl.link.id}/analytics`)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm truncate max-w-[180px] font-medium">
                          {tl.link?.title || tl.link?.shortCode || `Link #${tl.linkId}`}
                        </span>
                        <span className="text-sm font-medium text-primary">{tl.count}</span>
                      </div>
                      {tl.link?.destinationUrl && (
                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                          {tl.link.destinationUrl}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No data yet</p>
              )}
            </Card>

            {/* Countries */}
            <Card className="p-6">
              <h3 className="font-medium mb-4 flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                Top Countries
              </h3>
              {data.countries.length > 0 ? (
                <div className="space-y-2">
                  {data.countries.map((c: any, i: number) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-sm">{c.value || "Unknown"}</span>
                      <span className="text-sm font-medium">{c.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No data yet</p>
              )}
            </Card>

            {/* Devices */}
            <Card className="p-6">
              <h3 className="font-medium mb-4 flex items-center gap-2">
                <Monitor className="h-4 w-4 text-primary" />
                Devices
              </h3>
              {data.devices.length > 0 ? (
                <div className="space-y-2">
                  {data.devices.map((d: any, i: number) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-sm capitalize">{d.value || "Unknown"}</span>
                      <span className="text-sm font-medium">{d.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No data yet</p>
              )}
            </Card>

            {/* Referrers */}
            <Card className="p-6">
              <h3 className="font-medium mb-4 flex items-center gap-2">
                <MousePointerClick className="h-4 w-4 text-primary" />
                Top Referrers
              </h3>
              {data.referrers.length > 0 ? (
                <div className="space-y-2">
                  {data.referrers.map((r: any, i: number) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-sm truncate max-w-[180px]">{r.value || "Direct"}</span>
                      <span className="text-sm font-medium">{r.count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No data yet</p>
              )}
            </Card>
          </div>
        </div>
      )}
    </AppShell>
  );
}
