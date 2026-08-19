import { useAuth } from "@/_core/hooks/useAuth";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import FeatureGateCard from "@/components/FeatureGateCard";
import { FeatureAccessSkeleton, ListPageSkeleton } from "@/components/PageSkeleton";
import { Loader2, BarChart3, TrendingUp } from "lucide-react";
import { useState } from "react";

export default function CampaignDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [days, setDays] = useState(30);
  const [projectId, setProjectId] = useState<number | undefined>(undefined);

  const { data: projects } = trpc.project.list.useQuery(undefined, { enabled: !!user });
  const { data: billingStatus, isLoading: billingLoading } = trpc.billing.status.useQuery(undefined, { enabled: !!user });
  const campaignFeature = billingStatus?.planConfig?.features?.campaignDashboard;
  const canUseCampaignDashboard = !!campaignFeature && campaignFeature !== "none";
  const { data, isLoading, error } = trpc.campaign.channelStats.useQuery(
    { days, projectId },
    { enabled: !!user && canUseCampaignDashboard }
  );

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!user) { window.location.href = getLoginUrl(); return null; }

  const isGated = error?.message?.includes("requires Starter");

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Campaign Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">Compare performance across channels</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="w-[130px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last year</SelectItem>
              </SelectContent>
            </Select>
            <Select value={projectId ? String(projectId) : "all"} onValueChange={(v) => setProjectId(v === "all" ? undefined : Number(v))}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All projects</SelectItem>
                {projects?.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {billingLoading ? (
          <FeatureAccessSkeleton />
        ) : !canUseCampaignDashboard || isGated ? (
          <FeatureGateCard
            title="Campaign Dashboard requires Starter"
            description="Unlock channel-level analytics, UTM performance breakdowns, and campaign comparisons across projects."
            requiredPlan="Starter"
            featureLabel="Campaign dashboard"
          />
        ) : (
          <>
            {isLoading && <ListPageSkeleton rows={3} />}

            {error && !isGated && (
              <Card className="p-6 border-destructive/30">
                <p className="text-sm text-destructive">{error.message}</p>
              </Card>
            )}

            {data && (
              <>
                {/* Summary */}
                <Card className="p-5 mb-6">
                  <div className="flex items-center gap-3">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm text-muted-foreground">Total clicks in period</p>
                      <p className="text-2xl font-bold">{data.totalClicks.toLocaleString()}</p>
                    </div>
                  </div>
                </Card>

                {/* Channel Table */}
                {data.channels.length === 0 ? (
                  <Card className="p-8 text-center">
                    <p className="text-muted-foreground">No channel data yet. Add UTM parameters to your links to see channel breakdowns.</p>
                  </Card>
                ) : (
                  <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50 border-b">
                          <tr>
                            <th className="text-left p-3 font-medium">Source</th>
                            <th className="text-left p-3 font-medium">Medium</th>
                            <th className="text-right p-3 font-medium">Clicks</th>
                            <th className="text-right p-3 font-medium">Share</th>
                            <th className="text-right p-3 font-medium">Links</th>
                            <th className="p-3 font-medium">Distribution</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.channels.map((ch, i) => {
                            const share = data.totalClicks > 0 ? (ch.clicks / data.totalClicks * 100) : 0;
                            return (
                              <tr key={i} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                                <td className="p-3 font-medium">{ch.utmSource || <span className="text-muted-foreground italic">none</span>}</td>
                                <td className="p-3">{ch.utmMedium || <span className="text-muted-foreground italic">none</span>}</td>
                                <td className="p-3 text-right font-mono">{ch.clicks.toLocaleString()}</td>
                                <td className="p-3 text-right font-mono">{share.toFixed(1)}%</td>
                                <td className="p-3 text-right">{ch.uniqueLinks}</td>
                                <td className="p-3 w-40">
                                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${share}%` }} />
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}
              </>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
