import { useAuth } from "@/_core/hooks/useAuth";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import FeatureGateCard from "@/components/FeatureGateCard";
import { Download, FileText, Loader2, Lock, ExternalLink, AlertTriangle, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function ExportReport() {
  const { user, loading: authLoading } = useAuth();
  const { data: projectsData } = trpc.project.list.useQuery(undefined, { enabled: !!user });
  const { data: billingStatus, isLoading: billingLoading } = trpc.billing.status.useQuery(undefined, { enabled: !!user });
  const canGenerateReports = billingStatus?.planConfig?.features?.whiteLabelReports === true;
  const [scope, setScope] = useState<"all" | "project">("all");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [days, setDays] = useState(30);
  const [generating, setGenerating] = useState(false);
  const [reportError, setReportError] = useState(false);
  const [result, setResult] = useState<{ htmlUrl: string; pdfUrl: string | null } | null>(null);

  const generateReport = trpc.report.generate.useMutation({
    onSuccess: (data) => {
      setResult({ htmlUrl: data.htmlUrl, pdfUrl: data.pdfUrl });
      setGenerating(false);
      setReportError(false);
      toast.success("Report generated successfully!");
    },
    onError: (err) => {
      setGenerating(false);
      setReportError(true);
      if (err.message.includes("require Team")) {
        toast.error("White-label reports require Team plan. Upgrade to access this feature.");
      } else {
        console.error("[Report generation failed]", err);
        toast.error("Couldn't generate the report. Try again in a moment.");
      }
    },
  });

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!user) { window.location.href = getLoginUrl(); return null; }

  const handleGenerate = () => {
    if (!canGenerateReports) {
      toast.info("White-label reports require Team plan.");
      return;
    }
    setGenerating(true);
    setReportError(false);
    setResult(null);
    generateReport.mutate({
      projectId: scope === "project" && projectId ? projectId : undefined,
      days,
    });
  };

  const projects = projectsData || [];

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Export Report
          </h1>
          <p className="text-muted-foreground mt-1">
            Generate a branded performance report for your clients. Reports use your workspace branding settings.
          </p>
        </div>

        {billingLoading ? (
          <Card className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Checking plan access...
          </Card>
        ) : !canGenerateReports ? (
          <FeatureGateCard
            title="Reports require Team"
            description="Generate client-ready branded performance reports with your workspace logo, company name, colors, and shareable report links."
            requiredPlan="Team"
            featureLabel="White-label reports"
          />
        ) : (
          <>
            <Card className="p-6">
              <div className="space-y-5">
                {/* Scope */}
                <div className="space-y-2">
                  <Label>Report Scope</Label>
                  <Select value={scope} onValueChange={(v) => setScope(v as "all" | "project")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Projects (Workspace-wide)</SelectItem>
                      <SelectItem value="project">Specific Project</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Project picker */}
                {scope === "project" && (
                  <div className="space-y-2">
                    <Label>Project</Label>
                    <Select value={projectId?.toString() || ""} onValueChange={(v) => setProjectId(Number(v))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a project" />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((p: any) => (
                          <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Period */}
                <div className="space-y-2">
                  <Label>Time Period</Label>
                  <Select value={days.toString()} onValueChange={(v) => setDays(Number(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">Last 7 days</SelectItem>
                      <SelectItem value="14">Last 14 days</SelectItem>
                      <SelectItem value="30">Last 30 days</SelectItem>
                      <SelectItem value="60">Last 60 days</SelectItem>
                      <SelectItem value="90">Last 90 days</SelectItem>
                      <SelectItem value="180">Last 180 days</SelectItem>
                      <SelectItem value="365">Last 365 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Generate button */}
                <Button
                  onClick={handleGenerate}
                  disabled={generating || (scope === "project" && !projectId)}
                  className="w-full"
                >
                  {generating ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Generating...</>
                  ) : (
                    <><FileText className="h-4 w-4 mr-2" /> Generate Report</>
                  )}
                </Button>

                {reportError && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
                        <div>
                          <p className="text-sm font-medium text-destructive">Couldn't generate the report.</p>
                          <p className="text-xs text-muted-foreground">Try again in a moment.</p>
                        </div>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={handleGenerate}>
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                        Retry
                      </Button>
                    </div>
                  </div>
                )}

                {/* Results */}
                {result && (
                  <div className="mt-4 p-4 bg-muted/50 rounded-lg border space-y-3">
                    <p className="text-sm font-medium text-green-600 flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Report ready!
                    </p>

                    <div className="flex flex-col gap-2">
                      <a
                        href={result.htmlUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open HTML Report (shareable link)
                      </a>

                      {result.pdfUrl ? (
                        <a
                          href={result.pdfUrl}
                          download
                          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download PDF
                        </a>
                      ) : (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Lock className="h-3 w-3" />
                          PDF: Use the "Download as PDF" button in the HTML report (browser print)
                        </p>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Tip: Share the HTML link directly with clients, or use your browser's Print → Save as PDF for a downloadable file.
                    </p>
                  </div>
                )}
              </div>
            </Card>

            {/* Branding reminder */}
            <Card className="p-4 mt-4 border-dashed">
              <p className="text-sm text-muted-foreground">
                Reports use your workspace branding (logo, colors, company name).{" "}
                <a href="/branding" className="text-primary hover:underline">Edit branding settings →</a>
              </p>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}