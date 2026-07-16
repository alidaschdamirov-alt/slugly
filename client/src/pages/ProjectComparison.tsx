import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import AppShell from "@/components/AppShell";
import { getLoginUrl } from "@/const";
import { useState, useMemo } from "react";
import { BarChart3, MousePointerClick, Users2, Globe, Monitor, Lock, ArrowLeft, FolderOpen } from "lucide-react";
import { useLocation } from "wouter";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";

const COLORS = ["#5A3FF0", "#FF5A3C", "#10B981", "#F59E0B", "#EC4899", "#06B6D4", "#8B5CF6", "#EF4444", "#14B8A6", "#F97316"];

export default function ProjectComparison() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [days, setDays] = useState(30);
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([]);

  // Fetch workspace projects for selection
  const { data: projects } = trpc.project.list.useQuery(undefined, { enabled: !!user });

  // Fetch comparison data when 2+ projects selected
  const { data: comparison, isLoading: comparing, error } = trpc.campaign.compareProjects.useQuery(
    { projectIds: selectedProjectIds, days },
    { enabled: selectedProjectIds.length >= 2 }
  );

  const isGated = error?.message?.includes("requires Starter");

  // Build unified time-series data for the overlaid chart
  const chartData = useMemo(() => {
    if (!comparison || comparison.length === 0) return [];
    // Collect all unique days across all projects
    const allDays = new Set<string>();
    for (const proj of comparison) {
      for (const pt of proj.clicksOverTime) {
        allDays.add(pt.day);
      }
    }
    const sortedDays = Array.from(allDays).sort();
    // Build data points
    return sortedDays.map(day => {
      const point: Record<string, any> = { day };
      for (const proj of comparison) {
        const match = proj.clicksOverTime.find(p => p.day === day);
        point[`project_${proj.projectId}`] = match?.count || 0;
      }
      return point;
    });
  }, [comparison]);

  // Total clicks across all compared projects
  const totalAllClicks = comparison?.reduce((sum, p) => sum + p.totalClicks, 0) || 0;

  const toggleProject = (id: number) => {
    setSelectedProjectIds(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
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
            <Button variant="ghost" size="icon" onClick={() => setLocation("/dashboard")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Compare Projects</h1>
              <p className="text-sm text-muted-foreground">Select 2+ projects to compare side by side</p>
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
                <p className="text-sm text-amber-700 dark:text-amber-300">Project comparison is available on Starter plan and above.</p>
              </div>
              <Button size="sm" className="ml-auto" onClick={() => setLocation("/billing")}>Upgrade</Button>
            </CardContent>
          </Card>
        )}

        {/* Project selector */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Select Projects to Compare</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {projects?.map((proj, idx) => {
                const isSelected = selectedProjectIds.includes(proj.id);
                return (
                  <button
                    key={proj.id}
                    onClick={() => toggleProject(proj.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 text-primary ring-1 ring-primary/30"
                        : "border-border hover:border-primary/50 hover:bg-accent/50"
                    }`}
                  >
                    {isSelected && (
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: COLORS[selectedProjectIds.indexOf(proj.id) % COLORS.length] }}
                      />
                    )}
                    <span>{proj.name}</span>
                  </button>
                );
              })}
            </div>
            {selectedProjectIds.length < 2 && (
              <div className="mt-4 flex items-center gap-3 p-4 rounded-lg bg-muted/50 border border-dashed border-border">
                <BarChart3 className="h-8 w-8 text-muted-foreground/60 flex-none" />
                <div>
                  <p className="text-sm font-medium">Select at least 2 projects</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Click on projects above to add them to the comparison. You can compare up to 10 projects side by side.
                  </p>
                </div>
              </div>
            )}
            {(!projects || projects.length === 0) && (
              <div className="mt-4 flex flex-col items-center gap-3 p-8 rounded-lg bg-muted/50 border border-dashed border-border">
                <FolderOpen className="h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm font-medium">No projects yet</p>
                <p className="text-xs text-muted-foreground text-center">Create at least 2 projects with links to start comparing their performance.</p>
                <Button size="sm" variant="outline" onClick={() => setLocation("/dashboard")}>Go to Dashboard</Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Comparison results */}
        {comparison && comparison.length >= 2 && (
          <>
            {/* Summary cards side by side */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {comparison.map((proj, idx) => (
                <Card key={proj.projectId} className="relative overflow-hidden">
                  <div
                    className="absolute top-0 left-0 w-1 h-full"
                    style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                  />
                  <CardHeader className="pb-2 pl-5">
                    <CardTitle className="text-sm font-medium truncate">{proj.projectName}</CardTitle>
                  </CardHeader>
                  <CardContent className="pl-5 space-y-2">
                    <div className="flex items-center gap-2">
                      <MousePointerClick className="h-4 w-4 text-muted-foreground" />
                      <span className="text-2xl font-bold">{proj.totalClicks.toLocaleString()}</span>
                      <span className="text-xs text-muted-foreground">clicks</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users2 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-lg font-semibold">{proj.uniqueClicks.toLocaleString()}</span>
                      <span className="text-xs text-muted-foreground">unique</span>
                    </div>
                    {totalAllClicks > 0 && (
                      <div className="pt-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span>Share</span>
                          <span>{((proj.totalClicks / totalAllClicks) * 100).toFixed(1)}%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${(proj.totalClicks / totalAllClicks) * 100}%`,
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
                      {comparison.map((proj, idx) => (
                        <Line
                          key={proj.projectId}
                          type="monotone"
                          dataKey={`project_${proj.projectId}`}
                          name={proj.projectName}
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

            {/* Top Countries & Devices side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Countries */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Globe className="h-4 w-4" />
                    Top Countries
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {comparison.map((proj, idx) => (
                      <div key={proj.projectId}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                          <span className="text-sm font-medium">{proj.projectName}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 ml-5">
                          {proj.topCountries.length > 0 ? (
                            proj.topCountries.map((c, i) => (
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

              {/* Devices */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Monitor className="h-4 w-4" />
                    Top Devices
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {comparison.map((proj, idx) => (
                      <div key={proj.projectId}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                          <span className="text-sm font-medium">{proj.projectName}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 ml-5">
                          {proj.topDevices.length > 0 ? (
                            proj.topDevices.map((d, i) => (
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
        {comparing && selectedProjectIds.length >= 2 && (
          <div className="flex items-center justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        )}
      </div>
    </AppShell>
  );
}
