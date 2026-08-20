import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Activity, AlertTriangle, CheckCircle2, Clock3, Loader2, RefreshCw, Server, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type HealthState = "ok" | "degraded" | "down" | "unknown";
type HealthSnapshot = {
  generatedAt: number;
  processStartedAt: number;
  uptimeSeconds: number;
  overall: HealthState;
  http: {
    redirect: HttpSummary;
    api: HttpSummary;
  };
  dependencies: Array<{ name: string; state: HealthState; detail?: string }>;
  jobs: Array<{
    name: string;
    label: string;
    lastRunAt: number | null;
    durationMs: number | null;
    status: "success" | "failed" | "never" | "stale";
    processed: number | null;
    detail?: string | null;
  }>;
  incidents: Array<{
    id: string;
    title: string;
    detail: string;
    severity: "warning" | "critical";
    openedAt: number;
    resolvedAt: number | null;
  }>;
  alerts: { channel: string; enabled: boolean; description: string };
};

type HttpSummary = {
  sampleWindowMinutes: number;
  requests: number;
  latencyMs: { p50: number | null; p95: number | null; p99: number | null };
  errorRate: { rate4xx: number; rate5xx: number };
};

function statusClass(state: string) {
  if (state === "ok" || state === "success") return "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300";
  if (state === "down" || state === "failed") return "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300";
  if (state === "degraded" || state === "stale") return "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300";
  return "bg-muted text-muted-foreground";
}

function formatMs(value: number | null) {
  return value === null ? "—" : value < 1000 ? `${value.toFixed(value < 10 ? 1 : 0)} ms` : `${(value / 1000).toFixed(2)} s`;
}

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days ? `${days}d ` : ""}${hours}h ${minutes}m`;
}

function HttpCard({ title, value }: { title: string; value: HttpSummary }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">{value.requests} req / {value.sampleWindowMinutes}m</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {(["p50", "p95", "p99"] as const).map(key => (
          <div key={key} className="rounded-md bg-muted/60 p-2 text-center">
            <div className="text-[10px] font-semibold uppercase text-muted-foreground">{key}</div>
            <div className="mt-1 text-sm font-bold">{formatMs(value.latencyMs[key])}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-3 text-xs text-muted-foreground">
        <span>4xx <strong className="text-foreground">{value.errorRate.rate4xx}%</strong></span>
        <span>5xx <strong className={value.errorRate.rate5xx >= 5 ? "text-destructive" : "text-foreground"}>{value.errorRate.rate5xx}%</strong></span>
      </div>
    </Card>
  );
}

export default function SystemHealthPanel() {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/system-health", { credentials: "include" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "System Health is unavailable");
      }
      setSnapshot(await response.json());
    } catch (err: any) {
      if (!quiet) toast.error(err?.message || "Failed to load System Health");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const activeIncidents = useMemo(() => snapshot?.incidents.filter(item => !item.resolvedAt) || [], [snapshot]);
  const overall = snapshot?.overall || "unknown";

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={`fixed bottom-[124px] right-5 z-[70] gap-2 bg-background shadow-lg ${overall === "down" ? "border-red-400" : overall === "degraded" ? "border-amber-400" : ""}`}
        onClick={() => setOpen(true)}
      >
        <Activity className="h-4 w-4" />
        System Health
        <span className={`h-2.5 w-2.5 rounded-full ${overall === "ok" ? "bg-green-500" : overall === "down" ? "bg-red-500" : overall === "degraded" ? "bg-amber-500" : "bg-gray-400"}`} />
        {activeIncidents.length > 0 && <Badge variant="destructive" className="px-1.5 text-[10px]">{activeIncidents.length}</Badge>}
      </Button>

      {open && (
        <div className="fixed inset-0 z-[90] bg-black/35" onMouseDown={() => setOpen(false)}>
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-3xl flex-col border-l bg-background shadow-2xl" onMouseDown={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b p-5">
              <div>
                <div className="flex items-center gap-2">
                  <Server className="h-5 w-5" />
                  <h2 className="text-lg font-semibold">System Health</h2>
                  <Badge className={statusClass(overall)}>{overall}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Redirect performance, API errors, dependencies, background jobs and incidents.
                </p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => void load()} aria-label="Refresh system health"><RefreshCw className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close system health"><X className="h-4 w-4" /></Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {loading || !snapshot ? (
                <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : (
                <div className="space-y-6">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <HttpCard title="Redirects" value={snapshot.http.redirect} />
                    <HttpCard title="API" value={snapshot.http.api} />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <Card className="p-4"><p className="text-xs text-muted-foreground">Process uptime</p><p className="mt-1 text-lg font-bold">{formatUptime(snapshot.uptimeSeconds)}</p></Card>
                    <Card className="p-4"><p className="text-xs text-muted-foreground">Active incidents</p><p className="mt-1 text-lg font-bold">{activeIncidents.length}</p></Card>
                    <Card className="p-4"><p className="text-xs text-muted-foreground">Alert channel</p><p className="mt-1 text-sm font-semibold">Owner notification</p><p className="text-xs text-muted-foreground">{snapshot.alerts.enabled ? "Enabled" : "Disabled"}</p></Card>
                  </div>

                  <section>
                    <h3 className="mb-2 text-sm font-semibold">Dependencies</h3>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {snapshot.dependencies.map(dep => (
                        <Card key={dep.name} className="p-3">
                          <div className="flex items-center justify-between gap-2"><span className="text-sm font-medium">{dep.name}</span><Badge className={statusClass(dep.state)}>{dep.state}</Badge></div>
                          {dep.detail && <p className="mt-1 text-xs text-muted-foreground">{dep.detail}</p>}
                        </Card>
                      ))}
                    </div>
                  </section>

                  <section>
                    <h3 className="mb-2 text-sm font-semibold">Background jobs</h3>
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full min-w-[720px] text-sm">
                        <thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="p-2 text-left">Job</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Last run</th><th className="p-2 text-right">Duration</th><th className="p-2 text-right">Processed</th></tr></thead>
                        <tbody>
                          {snapshot.jobs.map(job => (
                            <tr key={job.name} className="border-t">
                              <td className="p-2"><div className="font-medium">{job.label}</div>{job.detail && <div className="max-w-[320px] truncate text-xs text-muted-foreground" title={job.detail}>{job.detail}</div>}</td>
                              <td className="p-2"><Badge className={statusClass(job.status)}>{job.status}</Badge></td>
                              <td className="p-2 text-xs text-muted-foreground">{job.lastRunAt ? new Date(job.lastRunAt).toLocaleString() : "Never"}</td>
                              <td className="p-2 text-right text-xs">{job.durationMs === null ? "—" : `${job.durationMs} ms`}</td>
                              <td className="p-2 text-right text-xs">{job.processed ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section>
                    <h3 className="mb-2 text-sm font-semibold">Incident history</h3>
                    {snapshot.incidents.length === 0 ? (
                      <Card className="p-5 text-center text-sm text-muted-foreground"><CheckCircle2 className="mx-auto mb-2 h-5 w-5 text-green-600" />No incidents recorded.</Card>
                    ) : (
                      <div className="space-y-2">
                        {snapshot.incidents.map(incident => (
                          <Card key={incident.id} className={`p-3 ${!incident.resolvedAt ? "border-amber-400/60" : ""}`}>
                            <div className="flex items-start gap-3">
                              {incident.severity === "critical" ? <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" /> : <Clock3 className="mt-0.5 h-4 w-4 text-amber-500" />}
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{incident.title}</span><Badge variant={incident.resolvedAt ? "secondary" : "outline"}>{incident.resolvedAt ? "resolved" : incident.severity}</Badge></div>
                                <p className="mt-1 text-xs text-muted-foreground">{incident.detail}</p>
                                <p className="mt-1 text-[11px] text-muted-foreground">Opened {new Date(incident.openedAt).toLocaleString()}{incident.resolvedAt ? ` · Resolved ${new Date(incident.resolvedAt).toLocaleString()}` : ""}</p>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
