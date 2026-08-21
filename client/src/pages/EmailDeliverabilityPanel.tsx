import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AlertTriangle, CheckCircle2, Loader2, MailCheck, RefreshCw, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type Summary = {
  sent: number;
  delivered: number;
  opened: number;
  bounced: number;
  complained: number;
  failed: number;
  deliveryRate: number;
  openRate: number;
  bounceRate: number;
  complaintRate: number;
};

type DeliveryRecord = {
  key: string;
  emailId: string;
  recipient: string;
  category: string;
  subject: string;
  sentAt: number | null;
  deliveredAt: number | null;
  openedAt: number | null;
  bouncedAt: number | null;
  complainedAt: number | null;
  failedAt: number | null;
  bounceMessage?: string | null;
  updatedAt: number;
};

type Snapshot = {
  generatedAt: number;
  days: number;
  summary: Summary;
  byCategory: Array<{ category: string } & Summary>;
  categories: string[];
  logs: DeliveryRecord[];
  webhookConfigured: boolean;
  webhookEndpoint: string;
  trackedEvents: string[];
};

function statusFor(record: DeliveryRecord) {
  if (record.complainedAt) return { label: "complained", className: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300" };
  if (record.bouncedAt) return { label: "bounced", className: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300" };
  if (record.failedAt) return { label: "failed", className: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300" };
  if (record.openedAt) return { label: "opened", className: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300" };
  if (record.deliveredAt) return { label: "delivered", className: "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300" };
  return { label: "sent", className: "bg-muted text-muted-foreground" };
}

function pct(value: number) {
  return `${Number.isFinite(value) ? value.toFixed(2).replace(/\.00$/, "") : "0"}%`;
}

function MetricCard({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {note && <p className="mt-1 text-[11px] text-muted-foreground">{note}</p>}
    </Card>
  );
}

export default function EmailDeliverabilityPanel() {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const params = new URLSearchParams({ days: String(days) });
      if (search.trim()) params.set("search", search.trim());
      if (category) params.set("category", category);
      const response = await fetch(`/api/security/email/metrics?${params.toString()}`, { credentials: "include" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Email deliverability metrics are unavailable");
      setSnapshot(data as Snapshot);
    } catch (error: any) {
      if (!quiet) toast.error(error?.message || "Failed to load email deliverability metrics");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [category, days, search]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => void load(true), 60_000);
    return () => window.clearInterval(timer);
  }, [open, load]);

  const bounceWarning = useMemo(() => {
    if (!snapshot) return false;
    return snapshot.summary.sent >= 20 && snapshot.summary.bounceRate >= 5;
  }, [snapshot]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={`fixed bottom-[176px] right-5 z-[70] gap-2 bg-background shadow-lg ${bounceWarning ? "border-red-400" : ""}`}
        onClick={() => setOpen(true)}
      >
        <MailCheck className="h-4 w-4" />
        Email Health
        {bounceWarning && <Badge variant="destructive" className="px-1.5 text-[10px]">!</Badge>}
      </Button>

      {open && (
        <div className="fixed inset-0 z-[91] bg-black/35" onMouseDown={() => setOpen(false)}>
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-5xl flex-col border-l bg-background shadow-2xl" onMouseDown={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b p-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <MailCheck className="h-5 w-5" />
                  <h2 className="text-lg font-semibold">Email Deliverability</h2>
                  {snapshot?.webhookConfigured ? (
                    <Badge className="bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300"><CheckCircle2 className="mr-1 h-3 w-3" />Webhook verified</Badge>
                  ) : (
                    <Badge variant="destructive"><AlertTriangle className="mr-1 h-3 w-3" />Webhook secret missing</Badge>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">Sent, delivery, open, bounce, complaint and failure signals from Resend.</p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => void load()} aria-label="Refresh email health"><RefreshCw className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close email health"><X className="h-4 w-4" /></Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {loading && !snapshot ? (
                <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : !snapshot ? (
                <Card className="p-8 text-center text-sm text-muted-foreground">No deliverability snapshot is available.</Card>
              ) : (
                <div className="space-y-6">
                  {!snapshot.webhookConfigured && (
                    <Card className="border-amber-300 bg-amber-50/50 p-4 dark:bg-amber-950/20">
                      <div className="flex gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" /><div><p className="text-sm font-semibold">Resend webhook is not fully configured</p><p className="mt-1 text-xs text-muted-foreground">Add <code>RESEND_WEBHOOK_SECRET</code> on the server and configure Resend to POST to <code>{snapshot.webhookEndpoint}</code>. Until then, sent events are logged but delivered/opened/bounced/complained events cannot be verified.</p></div></div>
                    </Card>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <MetricCard label="Sent" value={snapshot.summary.sent} note={`${snapshot.days}-day window`} />
                    <MetricCard label="Delivery rate" value={pct(snapshot.summary.deliveryRate)} note={`${snapshot.summary.delivered} delivered`} />
                    <MetricCard label="Open rate" value={pct(snapshot.summary.openRate)} note={`${snapshot.summary.opened} opened`} />
                    <MetricCard label="Bounce rate" value={pct(snapshot.summary.bounceRate)} note={`${snapshot.summary.bounced} bounced`} />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <MetricCard label="Complaints" value={snapshot.summary.complained} note={pct(snapshot.summary.complaintRate)} />
                    <MetricCard label="Failed" value={snapshot.summary.failed} />
                    <MetricCard label="Tracked categories" value={snapshot.categories.length} />
                  </div>

                  <section>
                    <div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-semibold">By email type</h3><span className="text-xs text-muted-foreground">Updated {new Date(snapshot.generatedAt).toLocaleString()}</span></div>
                    {snapshot.byCategory.length === 0 ? (
                      <Card className="p-5 text-center text-sm text-muted-foreground">No tracked sends in this period.</Card>
                    ) : (
                      <div className="overflow-x-auto rounded-md border">
                        <table className="w-full min-w-[760px] text-sm">
                          <thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="p-2 text-left">Type</th><th className="p-2 text-right">Sent</th><th className="p-2 text-right">Delivered</th><th className="p-2 text-right">Open rate</th><th className="p-2 text-right">Bounce rate</th><th className="p-2 text-right">Complaints</th></tr></thead>
                          <tbody>{snapshot.byCategory.map(row => <tr key={row.category} className="border-t"><td className="p-2 font-medium">{row.category}</td><td className="p-2 text-right">{row.sent}</td><td className="p-2 text-right">{pct(row.deliveryRate)}</td><td className="p-2 text-right">{pct(row.openRate)}</td><td className={`p-2 text-right ${row.bounceRate >= 5 ? "font-semibold text-destructive" : ""}`}>{pct(row.bounceRate)}</td><td className="p-2 text-right">{row.complained}</td></tr>)}</tbody>
                        </table>
                      </div>
                    )}
                  </section>

                  <section>
                    <div className="mb-3 flex flex-wrap items-end gap-2">
                      <div className="min-w-[220px] flex-1"><label className="mb-1 block text-xs font-medium text-muted-foreground">Search delivery log</label><div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" value={search} onChange={event => setSearch(event.target.value)} placeholder="Recipient, subject, Resend ID…" onKeyDown={event => { if (event.key === "Enter") void load(); }} /></div></div>
                      <div><label className="mb-1 block text-xs font-medium text-muted-foreground">Period</label><select className="h-10 rounded-md border bg-background px-3 text-sm" value={days} onChange={event => setDays(Number(event.target.value))}><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option><option value={365}>365 days</option></select></div>
                      <div><label className="mb-1 block text-xs font-medium text-muted-foreground">Type</label><select className="h-10 min-w-[150px] rounded-md border bg-background px-3 text-sm" value={category} onChange={event => setCategory(event.target.value)}><option value="">All types</option>{snapshot.categories.map(item => <option key={item} value={item}>{item}</option>)}</select></div>
                      <Button variant="secondary" onClick={() => void load()} disabled={loading}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Apply</Button>
                    </div>

                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full min-w-[980px] text-sm">
                        <thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="p-2 text-left">Status</th><th className="p-2 text-left">Recipient</th><th className="p-2 text-left">Type</th><th className="p-2 text-left">Subject</th><th className="p-2 text-left">Sent</th><th className="p-2 text-left">Resend ID</th></tr></thead>
                        <tbody>{snapshot.logs.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No matching email events.</td></tr> : snapshot.logs.map(record => { const status = statusFor(record); return <tr key={record.key} className="border-t align-top"><td className="p-2"><Badge className={status.className}>{status.label}</Badge>{record.bounceMessage && <p className="mt-1 max-w-[220px] text-[11px] text-destructive" title={record.bounceMessage}>{record.bounceMessage}</p>}</td><td className="p-2 font-medium">{record.recipient}</td><td className="p-2">{record.category}</td><td className="max-w-[300px] p-2"><span className="line-clamp-2" title={record.subject}>{record.subject || "—"}</span></td><td className="p-2 text-xs text-muted-foreground">{record.sentAt ? new Date(record.sentAt).toLocaleString() : "—"}</td><td className="max-w-[220px] p-2 font-mono text-[11px] text-muted-foreground"><span className="break-all">{record.emailId}</span></td></tr>; })}</tbody>
                      </table>
                    </div>
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
