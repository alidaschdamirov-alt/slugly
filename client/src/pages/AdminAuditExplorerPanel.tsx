import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Download, Loader2, RefreshCw, ScrollText, Search, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type AuditRow = {
  id: number;
  actorId: number;
  actorName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  ip: string | null;
  userAgent: string | null;
  reason: string | null;
};

type AuditPage = {
  rows: AuditRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

async function readError(response: Response) {
  try {
    const body = await response.json();
    return body?.error || "Audit request failed";
  } catch {
    return "Audit request failed";
  }
}

export default function AdminAuditExplorerPanel() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<AuditPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [targetId, setTargetId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const params = useCallback((requestedPage = page) => {
    const query = new URLSearchParams({ page: String(requestedPage), pageSize: "50" });
    if (action.trim()) query.set("action", action.trim());
    if (actor.trim()) query.set("actor", actor.trim());
    if (targetId.trim()) query.set("targetId", targetId.trim());
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    return query;
  }, [action, actor, from, page, targetId, to]);

  const load = useCallback(async (requestedPage = page) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/security/audit?${params(requestedPage).toString()}`, { credentials: "include" });
      if (!response.ok) throw new Error(await readError(response));
      const body = await response.json() as AuditPage;
      setData(body);
      setPage(body.page);
    } catch (error: any) {
      toast.error(error?.message || "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }, [page, params]);

  useEffect(() => {
    if (open) void load(1);
  }, [open]);

  const applyFilters = () => {
    setPage(1);
    void load(1);
  };

  const exportCsv = () => {
    const query = params(1);
    query.delete("page");
    query.delete("pageSize");
    const anchor = document.createElement("a");
    anchor.href = `/api/security/audit/export.csv?${query.toString()}`;
    anchor.download = "slugly-audit.csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  return (
    <>
      <Button type="button" variant="outline" className="fixed bottom-[280px] right-5 z-[70] gap-2 bg-background shadow-lg" onClick={() => setOpen(true)}>
        <ScrollText className="h-4 w-4" /> Audit Explorer
      </Button>
      {open && (
        <div className="fixed inset-0 z-[94] bg-black/35" onMouseDown={() => setOpen(false)}>
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-6xl flex-col border-l bg-background shadow-2xl" onMouseDown={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b p-5">
              <div><h2 className="flex items-center gap-2 text-lg font-semibold"><ScrollText className="h-5 w-5" /> Audit Explorer</h2><p className="mt-1 text-sm text-muted-foreground">Server-side filters, pagination and CSV export. Actor IP and User-Agent are shown when captured.</p></div>
              <div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => void load()}><RefreshCw className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button></div>
            </div>
            <div className="border-b p-4">
              <div className="grid gap-2 md:grid-cols-6">
                <Input placeholder="Action" value={action} onChange={e => setAction(e.target.value)} />
                <Input placeholder="Actor name/email" value={actor} onChange={e => setActor(e.target.value)} />
                <Input placeholder="Target ID" value={targetId} onChange={e => setTargetId(e.target.value)} />
                <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
                <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
                <div className="flex gap-2"><Button className="flex-1" onClick={applyFilters} disabled={loading}><Search className="mr-1.5 h-4 w-4" />Apply</Button><Button variant="outline" size="icon" onClick={exportCsv} title="Export filtered CSV"><Download className="h-4 w-4" /></Button></div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {loading && !data ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div> : !data ? <Card className="p-8 text-center text-sm text-muted-foreground">No audit data loaded.</Card> : (
                <>
                  <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground"><span>{data.total.toLocaleString()} matching event{data.total === 1 ? "" : "s"}</span><span>Page {data.page} of {data.totalPages}</span></div>
                  <div className="space-y-2">{data.rows.map(row => <Card key={row.id} className="p-3"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="font-mono text-[10px]">{row.action}</Badge><span className="text-xs font-medium">{row.actorName || `User #${row.actorId}`}</span><span className="text-xs text-muted-foreground">→ {row.targetType || "system"}{row.targetId ? ` #${row.targetId}` : ""}</span><span className="ml-auto text-[11px] text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</span></div>{row.reason && <p className="mt-2 text-xs"><strong>Reason:</strong> {row.reason}</p>}<div className="mt-2 grid gap-1 text-[11px] text-muted-foreground md:grid-cols-2"><div>IP: <span className="font-mono">{row.ip || "not captured"}</span></div><div className="truncate" title={row.userAgent || ""}>UA: {row.userAgent || "not captured"}</div></div>{row.metadata && <details className="mt-2"><summary className="cursor-pointer text-[11px] text-muted-foreground">Metadata</summary><pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-[10px]">{JSON.stringify(row.metadata, null, 2)}</pre></details>}</Card>)}</div>
                  {data.rows.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground">No events match these filters.</Card>}
                  <div className="mt-4 flex justify-center gap-2"><Button variant="outline" size="sm" disabled={loading || data.page <= 1} onClick={() => void load(data.page - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={loading || data.page >= data.totalPages} onClick={() => void load(data.page + 1)}>Next</Button></div>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
