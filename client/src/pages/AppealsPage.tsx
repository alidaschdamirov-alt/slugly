import { useAuth } from "@/_core/hooks/useAuth";
import AppShell from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { getLoginUrl } from "@/const";
import { AlertTriangle, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type MineReport = {
  id: number;
  shortCode: string;
  reason: string | null;
  status: "pending" | "reviewed" | "actioned" | "dismissed";
  createdAt: string | Date;
  appealAllowed: boolean;
  appeal: null | {
    id: string;
    message: string;
    status: "new" | "in_review" | "resolved" | "rejected";
    decision: string | null;
    createdAt: number;
    updatedAt: number;
  };
};

function displayStatus(status: MineReport["status"]) {
  if (status === "actioned") return "Resolved with action";
  if (status === "dismissed") return "Rejected / no violation";
  if (status === "reviewed") return "In review";
  return "New";
}

export default function AppealsPage() {
  const { user, loading: authLoading } = useAuth();
  const [reports, setReports] = useState<MineReport[]>([]);
  const [readOnly, setReadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Record<number, string>>({});
  const [pending, setPending] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/abuse-workflow/mine", { credentials: "include" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to load appeals");
      }
      const data = await response.json();
      setReports(Array.isArray(data?.reports) ? data.reports : []);
      setReadOnly(!!data?.readOnly);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load appeals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (user) void load(); }, [load, user]);

  if (authLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!user) { window.location.href = getLoginUrl(); return null; }

  const submit = async (report: MineReport) => {
    const message = (messages[report.id] || "").trim();
    if (message.length < 10) return toast.error("Please explain the appeal in at least 10 characters.");
    setPending(report.id);
    try {
      const response = await fetch("/api/abuse-workflow/appeals", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: report.id, message }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Failed to submit appeal");
      setMessages(current => ({ ...current, [report.id]: "" }));
      await load();
      toast.success("Appeal submitted to Trust & Safety");
    } catch (err: any) {
      toast.error(err?.message || "Failed to submit appeal");
    } finally {
      setPending(null);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div><h1 className="text-2xl font-bold">Appeals</h1><p className="mt-1 text-sm text-muted-foreground">Review abuse decisions affecting your links and appeal a completed decision.</p></div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
        </div>

        {readOnly && <Card className="mb-4 border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><AlertTriangle className="mr-2 inline h-4 w-4" />Appeals are read-only while support is viewing this account.</Card>}

        {loading ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div> : reports.length === 0 ? (
          <Card className="p-10 text-center"><ShieldCheck className="mx-auto h-8 w-8 text-green-600" /><h2 className="mt-3 font-semibold">No abuse decisions affect your links</h2><p className="mt-1 text-sm text-muted-foreground">Any report eligible for appeal will appear here.</p></Card>
        ) : (
          <div className="space-y-4">
            {reports.map(report => <Card key={report.id} className="p-5">
              <div className="flex flex-wrap items-center gap-2"><code className="font-semibold">/r/{report.shortCode}</code><Badge variant="outline">{displayStatus(report.status)}</Badge><span className="ml-auto text-xs text-muted-foreground">Report #{report.id} · {new Date(report.createdAt).toLocaleString()}</span></div>
              <p className="mt-3 text-sm text-muted-foreground">Report reason: {report.reason || "No reason provided"}</p>

              {report.appeal ? (
                <div className="mt-4 rounded-md border p-4"><div className="flex items-center gap-2"><strong className="text-sm">Your appeal</strong><Badge>{report.appeal.status}</Badge></div><p className="mt-2 whitespace-pre-wrap text-sm">{report.appeal.message}</p>{report.appeal.decision && <div className="mt-3 rounded bg-muted p-3 text-sm"><strong>Trust & Safety decision:</strong> {report.appeal.decision}</div>}</div>
              ) : report.appealAllowed ? (
                <div className="mt-4 space-y-2"><Textarea rows={4} maxLength={5000} value={messages[report.id] || ""} onChange={event => setMessages(current => ({ ...current, [report.id]: event.target.value }))} placeholder="Explain why you believe this decision should be reconsidered. Include relevant context or evidence." disabled={readOnly} /><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">10–5000 characters. One open appeal per report.</span><Button disabled={readOnly || pending !== null || (messages[report.id] || "").trim().length < 10} onClick={() => void submit(report)}>{pending === report.id && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Submit appeal</Button></div></div>
              ) : <p className="mt-4 text-sm text-muted-foreground">The report is still under review. Appeals become available after the Trust & Safety decision is completed.</p>}
            </Card>)}
          </div>
        )}
      </div>
    </AppShell>
  );
}
