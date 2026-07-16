import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import AppShell from "@/components/AppShell";
import { getLoginUrl } from "@/const";
import { useState, useMemo } from "react";
import { BarChart3, MousePointerClick, Users2, Globe, Monitor, Lock, ArrowLeft, Tag } from "lucide-react";
import { useLocation } from "wouter";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";

const COLORS = ["#5A3FF0", "#FF5A3C", "#10B981", "#F59E0B", "#EC4899", "#06B6D4", "#8B5CF6", "#EF4444", "#14B8A6", "#F97316"];

export default function TagComparison() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [days, setDays] = useState(30);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Fetch all tags for selection
  const { data: tags } = trpc.tag.list.useQuery(undefined, { enabled: !!user });

  // Fetch comparison data when 2+ tags selected
  const { data: comparison, isLoading: comparing, error } = trpc.campaign.compareTags.useQuery(
    { tags: selectedTags, days },
    { enabled: selectedTags.length >= 2 }
  );

  const isGated = error?.message?.includes("requires Starter");

  // Build unified time-series data for the overlaid chart
  const chartData = useMemo(() => {
    if (!comparison || comparison.length === 0) return [];
    const allDays = new Set<string>();
    for (const t of comparison) {
      for (const pt of t.clicksOverTime) {
        allDays.add(pt.day);
      }
    }
    const sortedDays = Array.from(allDays).sort();
    return sortedDays.map(day => {
      const point: Record<string, any> = { day };
      for (const t of comparison) {
        const match = t.clicksOverTime.find(p => p.day === day);
        point[`tag_${t.tag}`] = match?.count || 0;
      }
      return point;
    });
  }, [comparison]);

  const totalAllClicks = comparison?.reduce((sum, t) => sum + t.totalClicks, 0) || 0;

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AppShell>
    );
  }

  if (!user) {
    window.location.href = getLoginUrl();
    return null;
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/tags")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Compare Tags</h1>
              <p className="text-sm text-muted-foreground">Select 2+ tags to compare performance</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {[7, 30, 90].map(d => (
              <Button
                key={d}
                variant={days === d ? "default" : "outline"}
                size="sm"
                onClick={() => setDays(d)}
              >
                {d}d
              </Button>
            ))}
          </div>
        </div>

        {/* Error display */}
        {error && !isGated && (
          <Card className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800">
            <CardContent className="flex items-center gap-3 py-4">
              <BarChart3 className="h-5 w-5 text-red-600" />
              <div>
                <p className="font-medium text-red-800 dark:text-red-200">Error loading comparison</p>
                <p className="text-sm text-red-700 dark:text-red-300">{error.message}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Plan gate */}
        {isGated && (
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
            <CardContent className="flex items-center gap-3 py-4">
              <Lock className="h-5 w-5 text-amber-600" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-200">Starter Plan Required</p>
                <p className="text-sm text-amber-700 dark:text-amber-300">Tag comparison is available on Starter plan and above.</p>
              </div>
              <Button size="sm" className="ml-auto" onClick={() => setLocation("/billing")}>Upgrade</Button>
            </CardContent>
          </Card>
        )}

        {/* Tag selector */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Select Tags to Compare</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {tags?.map((t, idx) => {
                const isSelected = selectedTags.includes(t.tag);
                return (
                  <button
                    key={t.tag}
                    onClick={() => toggleTag(t.tag)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/30"
                        : "border-border hover:border-primary/50 hover:bg-accent/50"
                    }`}
                  >
                    {isSelected && (
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: COLORS[selectedTags.indexOf(t.tag) % COLORS.length] }}
                      />
                    )}
                    <Tag className="h-3 w-3" />
                    <span>{t.tag}</span>
                    <span className="text-xs text-muted-foreground">({t.totalClicks})</span>
                  </button>
                );
              })}
            </div>
            {selectedTags.length < 2 && (
              <div className="mt-4 flex items-center gap-3 p-4 rounded-lg bg-muted/50 border border-dashed border-border">
                <BarChart3 className="h-8 w-8 text-muted-foreground/60 flex-none" />
                <div>
                  <p className="text-sm font-medium">Select at least 2 tags</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Click on tags above to add them to the comparison. You can compare up to 10 tags side by side.
                  </p>
                </div>
              </div>
            )}
            {(!tags || tags.length === 0) && (
              <div className="mt-4 flex flex-col items-center gap-3 p-8 rounded-lg bg-muted/50 border border-dashed border-border">
                <Tag className="h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm font-medium">No tags yet</p>
                <p className="text-xs text-muted-foreground text-center">Add tags to your links to start comparing their performance.</p>
                <Button size="sm" variant="outline" onClick={() => setLocation("/links")}>Go to Links</Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Comparison results */}
        {comparison && comparison.length >= 2 && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {comparison.map((t, idx) => (
                <Card key={t.tag} className="relative overflow-hidden">
                  <div
                    className="absolute top-0 left-0 w-1 h-full"
                    style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                  />
                  <CardHeader className="pb-2 pl-5">
                    <CardTitle className="text-sm font-medium truncate flex items-center gap-1.5">
                      <Tag className="h-3 w-3" />
                      {t.tag}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pl-5 space-y-2">
                    <div className="flex items-center gap-2">
                      <MousePointerClick className="h-4 w-4 text-muted-foreground" />
                      <span className="text-2xl font-bold">{t.totalClicks.toLocaleString()}</span>
                      <span className="text-xs text-muted-foreground">clicks</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users2 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-lg font-semibold">{t.uniqueClicks.toLocaleString()}</span>
                      <span className="text-xs text-muted-foreground">unique</span>
                    </div>
                    {totalAllClicks > 0 && (
                      <div className="pt-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span>Share</span>
                          <span>{((t.totalClicks / totalAllClicks) * 100).toFixed(1)}%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${(t.totalClicks / totalAllClicks) * 100}%`,
                              backgroundColor: COLORS[idx % COLORS.length],
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Overlaid time-series chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Clicks Over Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 12 }}
                        tickFormatter={(val) => {
                          const d = new Date(val);
                          return `${d.getMonth() + 1}/${d.getDate()}`;
                        }}
                      />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        labelFormatter={(val) => new Date(val).toLocaleDateString()}
                        contentStyle={{ borderRadius: 8, border: "1px solid var(--border)" }}
                      />
                      <Legend />
                      {comparison.map((t, idx) => (
                        <Line
                          key={t.tag}
                          type="monotone"
                          dataKey={`tag_${t.tag}`}
                          name={t.tag}
                          stroke={COLORS[idx % COLORS.length]}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground py-10">No click data for the selected period.</p>
                )}
              </CardContent>
            </Card>

            {/* Top Countries & Devices */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Globe className="h-4 w-4" />
                    Top Countries
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {comparison.map((t, idx) => (
                      <div key={t.tag}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                          <span className="text-sm font-medium">{t.tag}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 ml-5">
                          {t.topCountries.length > 0 ? (
                            t.topCountries.map((c, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {c.value || "Unknown"} ({c.count})
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">No data</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Monitor className="h-4 w-4" />
                    Top Devices
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {comparison.map((t, idx) => (
                      <div key={t.tag}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                          <span className="text-sm font-medium">{t.tag}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 ml-5">
                          {t.topDevices.length > 0 ? (
                            t.topDevices.map((d, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {d.value || "Unknown"} ({d.count})
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">No data</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {/* Loading state */}
        {comparing && selectedTags.length >= 2 && (
          <div className="flex items-center justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        )}
      </div>
    </AppShell>
  );
}
