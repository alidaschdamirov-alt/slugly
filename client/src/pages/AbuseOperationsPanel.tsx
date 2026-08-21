import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Gavel, Loader2, Mail, RefreshCw, Scale, ShieldAlert, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type WorkflowStatus = "new" | "in_review" | "resolved" | "rejected";
type Priority = "low" | "normal" | "high" | "critical";
type AppealStatus = WorkflowStatus;
type Tab = "queue" | "appeals" | "legal";

type Staff = { id: number; name: string | null; email: string | null; role: "admin" | "support" };
type ResponseTemplate = { id: string; label: string; subject: string; body: string };
type WorkflowReport = {
  id: number;
  shortCode: string;
  reason: string | null;
  reporterEmail: string | null;
  createdAt: string | Date;
  userId: number | null;
  destinationDomain?: string | null;
  workflow: {
    status: WorkflowStatus;
    priority: Priority;
    assigneeId: number | null;
    firstResponseAt: number | null;
    resolvedAt: number | null;
    lastResponseTemplate: string | null;
    lastResponseMessage: string | null;
  };
  assignee: Staff | null;
  sla: { dueAt: number; overdue: boolean; firstResponseAt: number | null; responseTimeMs: number | null };
};
type Appeal = {
  id: string;
  reportId: number;
  userId: number;
  message: string;
  status: AppealStatus;
  decision: string | null;
  reviewerId: number | null;
  createdAt: number;
  updatedAt: number;
};
type LegalRequest = {
  id: string;
  date: number;
  authority: string;
  basis: string;
  action: string;
  assigneeId: number | null;
  status: "open" | "fulfilled" | "rejected";
  createdAt: number;
  updatedAt: number;
  createdBy: number;
};

async function readError(response: Response) {
  try {
    const data = await response.json();
    return data?.error || "Trust & Safety action failed";
  } catch {
    return "Trust & Safety action failed";
  }
}

function statusClass(value: string) {
  if (value === "resolved" || value === "fulfilled") return "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300";
  if (value === "critical" || value === "rejected") return "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300";
  if (value === "high" || value === "in_review" || value === "open") return "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300";
  return "bg-muted text-muted-foreground";
}

function SelectBox(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`h-9 rounded-md border bg-background px-2 text-sm ${props.className || ""}`} />;
}

export default function AbuseOperationsPanel() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("queue");
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<WorkflowReport[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [templates, setTemplates] = useState<ResponseTemplate[]>([]);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [legal, setLegal] = useState<LegalRequest[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [responseState, setResponseState] = useState<Record<number, { templateId: string; message: string }>>({});
  const [appealDecision, setAppealDecision] = useState<Record<string, string>>({});
  const [legalDraft, setLegalDraft] = useState({ authority: "", basis: "", action: "", date: new Date().toISOString().slice(0, 10), assigneeId: "" });

  const loadQueue = useCallback(async () => {
    const response = await fetch("/api/abuse-workflow/queue", { credentials: "include" });
    if (!response.ok) throw new Error(await readError(response));
    const data = await response.json();
    setReports(Array.isArray(data?.reports) ? data.reports : []);
    setStaff(Array.isArray(data?.staff) ? data.staff : []);
    setTemplates(Array.isArray(data?.responseTemplates) ? data.responseTemplates : []);
  }, []);

  const loadAppeals = useCallback(async () => {
    const response = await fetch("/api/abuse-workflow/appeals", { credentials: "include" });
    if (!response.ok) throw new Error(await readError(response));
    const data = await response.json();
    setAppeals(Array.isArray(data?.appeals) ? data.appeals : []);
  }, []);

  const loadLegal = useCallback(async () => {
    const response = await fetch("/api/abuse-workflow/legal", { credentials: "include" });
    if (!response.ok) throw new Error(await readError(response));
    const data = await response.json();
    setLegal(Array.isArray(data?.requests) ? data.requests : []);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadQueue(), loadAppeals(), loadLegal()]);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load Trust & Safety operations");
    } finally {
      setLoading(false);
    }
  }, [loadAppeals, loadLegal, loadQueue]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  const queueCounts = useMemo(() => ({
    new: reports.filter(report => report.workflow.status === "new").length,
    inReview: reports.filter(report => report.workflow.status === "in_review").length,
    overdue: reports.filter(report => report.sla.overdue).length,
  }), [reports]);

  const updateReport = async (reportId: number, patch: Record<string, unknown>) => {
    const key = `report:${reportId}`;
    setPending(key);
    try {
      const response = await fetch(`/api/abuse-workflow/reports/${reportId}`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error(await readError(response));
      await loadQueue();
      toast.success("Report workflow updated");
    } catch (err: any) {
      toast.error(err?.message || "Could not update report");
    } finally { setPending(null); }
  };

  const sendResponse = async (report: WorkflowReport) => {
    const state = responseState[report.id] || { templateId: templates[0]?.id || "acknowledge", message: "" };
    setPending(`respond:${report.id}`);
    try {
      const response = await fetch(`/api/abuse-workflow/reports/${report.id}/respond`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(state),
      });
      if (!response.ok) throw new Error(await readError(response));
      await loadQueue();
      toast.success("Reporter response sent");
    } catch (err: any) {
      toast.error(err?.message || "Could not send response");
    } finally { setPending(null); }
  };

  const updateAppeal = async (appeal: Appeal, status: AppealStatus) => {
    setPending(`appeal:${appeal.id}`);
    try {
      const response = await fetch(`/api/abuse-workflow/appeals/${appeal.id}`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, decision: appealDecision[appeal.id] || appeal.decision || undefined }),
      });
      if (!response.ok) throw new Error(await readError(response));
      await loadAppeals();
      toast.success("Appeal updated");
    } catch (err: any) { toast.error(err?.message || "Could not update appeal"); }
    finally { setPending(null); }
  };

  const createLegal = async () => {
    setPending("legal:new");
    try {
      const response = await fetch("/api/abuse-workflow/legal", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...legalDraft, date: new Date(`${legalDraft.date}T12:00:00`).getTime(), assigneeId: legalDraft.assigneeId || null }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setLegalDraft({ authority: "", basis: "", action: "", date: new Date().toISOString().slice(0, 10), assigneeId: "" });
      await loadLegal();
      toast.success("Legal request recorded");
    } catch (err: any) { toast.error(err?.message || "Could not record legal request"); }
    finally { setPending(null); }
  };

  const updateLegal = async (request: LegalRequest, status: LegalRequest["status"]) => {
    setPending(`legal:${request.id}`);
    try {
      const response = await fetch(`/api/abuse-workflow/legal/${request.id}`, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error(await readError(response));
      await loadLegal();
      toast.success("Legal request updated");
    } catch (err: any) { toast.error(err?.message || "Could not update legal request"); }
    finally { setPending(null); }
  };

  return (
    <>
      <Button type="button" variant="outline" className="fixed bottom-[68px] left-5 z-[70] gap-2 bg-background shadow-lg" onClick={() => setOpen(true)}>
        <ShieldAlert className="h-4 w-4" /> Trust & Safety
        {(queueCounts.new + queueCounts.overdue + appeals.filter(a => a.status === "new").length) > 0 && (
          <Badge variant="destructive" className="px-1.5 text-[10px]">{queueCounts.new + queueCounts.overdue + appeals.filter(a => a.status === "new").length}</Badge>
        )}
      </Button>

      {open && (
        <div className="fixed inset-0 z-[90] bg-black/35" onMouseDown={() => setOpen(false)}>
          <aside className="absolute left-0 top-0 flex h-full w-full max-w-4xl flex-col border-r bg-background shadow-2xl" onMouseDown={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b p-5">
              <div><h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldAlert className="h-5 w-5" /> Trust & Safety Operations</h2><p className="mt-1 text-sm text-muted-foreground">Abuse SLA, assignments, reporter responses, appeals and legal requests.</p></div>
              <div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => void loadAll()} aria-label="Refresh"><RefreshCw className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close"><X className="h-4 w-4" /></Button></div>
            </div>
            <div className="flex gap-2 border-b px-5 py-3">
              <Button size="sm" variant={tab === "queue" ? "default" : "outline"} onClick={() => setTab("queue")}>Queue</Button>
              <Button size="sm" variant={tab === "appeals" ? "default" : "outline"} onClick={() => setTab("appeals")}>Appeals ({appeals.filter(a => a.status === "new").length})</Button>
              <Button size="sm" variant={tab === "legal" ? "default" : "outline"} onClick={() => setTab("legal")}><Scale className="mr-1.5 h-3.5 w-3.5" />Legal</Button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {loading ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div> : tab === "queue" ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3"><Card className="p-3"><p className="text-xs text-muted-foreground">New</p><p className="text-2xl font-bold">{queueCounts.new}</p></Card><Card className="p-3"><p className="text-xs text-muted-foreground">In review</p><p className="text-2xl font-bold">{queueCounts.inReview}</p></Card><Card className={queueCounts.overdue ? "border-red-300 p-3" : "p-3"}><p className="text-xs text-muted-foreground">SLA overdue</p><p className="text-2xl font-bold">{queueCounts.overdue}</p></Card></div>
                  {reports.map(report => {
                    const response = responseState[report.id] || { templateId: templates[0]?.id || "acknowledge", message: "" };
                    return <Card key={report.id} className={report.sla.overdue ? "border-red-300 p-4" : "p-4"}>
                      <div className="flex flex-wrap items-start gap-2"><code className="text-sm">/r/{report.shortCode}</code><Badge className={statusClass(report.workflow.status)}>{report.workflow.status}</Badge><Badge className={statusClass(report.workflow.priority)}>{report.workflow.priority}</Badge>{report.sla.overdue && <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />SLA overdue</Badge>}<span className="ml-auto text-xs text-muted-foreground">#{report.id} · {new Date(report.createdAt).toLocaleString()}</span></div>
                      <p className="mt-2 text-sm">{report.reason || "No reporter reason"}</p><p className="mt-1 text-xs text-muted-foreground">Reporter: {report.reporterEmail || "anonymous"} · SLA due {new Date(report.sla.dueAt).toLocaleString()}</p>
                      <div className="mt-3 grid gap-2 md:grid-cols-3"><div><Label className="text-xs">Status</Label><SelectBox value={report.workflow.status} disabled={pending !== null} onChange={e => void updateReport(report.id, { status: e.target.value })}><option value="new">New</option><option value="in_review">In review</option><option value="resolved">Resolved</option><option value="rejected">Rejected</option></SelectBox></div><div><Label className="text-xs">Priority</Label><SelectBox value={report.workflow.priority} disabled={pending !== null} onChange={e => void updateReport(report.id, { priority: e.target.value })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></SelectBox></div><div><Label className="text-xs">Assignee</Label><SelectBox value={report.workflow.assigneeId ?? ""} disabled={pending !== null} onChange={e => void updateReport(report.id, { assigneeId: e.target.value || null })}><option value="">Unassigned</option>{staff.map(member => <option key={member.id} value={member.id}>{member.name || member.email || `#${member.id}`} ({member.role})</option>)}</SelectBox></div></div>
                      <div className="mt-4 rounded-md border p-3"><div className="flex items-center gap-2 text-sm font-semibold"><Mail className="h-4 w-4" />Reporter response</div><div className="mt-2 grid gap-2 md:grid-cols-[220px_1fr]"><SelectBox value={response.templateId} disabled={!report.reporterEmail} onChange={e => { const template = templates.find(t => t.id === e.target.value); setResponseState(current => ({ ...current, [report.id]: { templateId: e.target.value, message: template?.body || "" } })); }}>{templates.map(template => <option key={template.id} value={template.id}>{template.label}</option>)}</SelectBox><Textarea rows={2} disabled={!report.reporterEmail} value={response.message} placeholder={templates.find(t => t.id === response.templateId)?.body || "Response message"} onChange={e => setResponseState(current => ({ ...current, [report.id]: { ...response, message: e.target.value } }))} /></div><Button className="mt-2" size="sm" variant="outline" disabled={!report.reporterEmail || pending !== null} onClick={() => void sendResponse(report)}>{pending === `respond:${report.id}` ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Mail className="mr-1.5 h-3.5 w-3.5" />}Send response</Button></div>
                    </Card>;
                  })}
                  {reports.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">No abuse reports.</Card>}
                </div>
              ) : tab === "appeals" ? (
                <div className="space-y-3">{appeals.map(appeal => <Card key={appeal.id} className="p-4"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">Appeal #{appeal.id.slice(-8)}</strong><Badge className={statusClass(appeal.status)}>{appeal.status}</Badge><span className="ml-auto text-xs text-muted-foreground">Report #{appeal.reportId} · user #{appeal.userId}</span></div><p className="mt-3 whitespace-pre-wrap text-sm">{appeal.message}</p><Textarea className="mt-3" rows={2} placeholder="Decision / reviewer note" value={appealDecision[appeal.id] ?? appeal.decision ?? ""} onChange={e => setAppealDecision(current => ({ ...current, [appeal.id]: e.target.value }))} /><div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={pending !== null} onClick={() => void updateAppeal(appeal, "in_review")}>In review</Button><Button size="sm" disabled={pending !== null} onClick={() => void updateAppeal(appeal, "resolved")}>Resolve</Button><Button size="sm" variant="destructive" disabled={pending !== null} onClick={() => void updateAppeal(appeal, "rejected")}>Reject</Button></div></Card>)}{appeals.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">No appeals.</Card>}</div>
              ) : (
                <div className="space-y-4">
                  {isAdmin && <Card className="p-4"><div className="mb-3 flex items-center gap-2 font-semibold"><Gavel className="h-4 w-4" />Record legal request</div><div className="grid gap-3 md:grid-cols-2"><div><Label>Date</Label><Input type="date" value={legalDraft.date} onChange={e => setLegalDraft(current => ({ ...current, date: e.target.value }))} /></div><div><Label>Authority</Label><Input value={legalDraft.authority} onChange={e => setLegalDraft(current => ({ ...current, authority: e.target.value }))} placeholder="Court, regulator, law enforcement…" /></div><div className="md:col-span-2"><Label>Legal basis</Label><Textarea rows={2} value={legalDraft.basis} onChange={e => setLegalDraft(current => ({ ...current, basis: e.target.value }))} /></div><div className="md:col-span-2"><Label>Action taken / requested</Label><Textarea rows={2} value={legalDraft.action} onChange={e => setLegalDraft(current => ({ ...current, action: e.target.value }))} /></div></div><Button className="mt-3" disabled={pending !== null || !legalDraft.authority.trim() || !legalDraft.basis.trim() || !legalDraft.action.trim()} onClick={() => void createLegal()}>{pending === "legal:new" && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Record request</Button></Card>}
                  {!isAdmin && <Card className="p-3 text-sm text-muted-foreground">Support has read-only access to the legal request journal.</Card>}
                  {legal.map(request => <Card key={request.id} className="p-4"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{request.authority}</strong><Badge className={statusClass(request.status)}>{request.status}</Badge><span className="ml-auto text-xs text-muted-foreground">{new Date(request.date).toLocaleDateString()}</span></div><p className="mt-2 text-sm"><strong>Basis:</strong> {request.basis}</p><p className="mt-1 text-sm"><strong>Action:</strong> {request.action}</p>{isAdmin && <div className="mt-3 flex gap-2"><Button size="sm" variant="outline" disabled={pending !== null} onClick={() => void updateLegal(request, "open")}>Open</Button><Button size="sm" disabled={pending !== null} onClick={() => void updateLegal(request, "fulfilled")}>Fulfilled</Button><Button size="sm" variant="destructive" disabled={pending !== null} onClick={() => void updateLegal(request, "rejected")}>Reject</Button></div>}</Card>)}{legal.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">No legal requests recorded.</Card>}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
