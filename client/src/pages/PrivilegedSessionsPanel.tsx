import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, MonitorSmartphone, RefreshCw, ShieldX, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type PrivilegedSession = {
  id: string;
  actorId: number;
  actorEmail: string | null;
  actorRole: "support" | "admin";
  targetUserId: number;
  targetEmail: string | null;
  reason: string;
  readOnly: true;
  createdAt: number;
  expiresAt: number;
  actorIp?: string | null;
  userAgent?: string | null;
};

async function readError(response: Response) {
  try {
    const body = await response.json();
    return body?.error || "Privileged session action failed";
  } catch {
    return "Privileged session action failed";
  }
}

function remaining(expiresAt: number) {
  const ms = Math.max(0, expiresAt - Date.now());
  const minutes = Math.ceil(ms / 60_000);
  return `${minutes} min`;
}

export default function PrivilegedSessionsPanel() {
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<PrivilegedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/impersonation/admin/sessions", { credentials: "include" });
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      setSessions(Array.isArray(data?.sessions) ? data.sessions : []);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load privileged sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = async (session: PrivilegedSession) => {
    const reason = (reasons[session.id] || "").trim();
    if (reason.length < 3) {
      toast.error("Enter a revoke reason first.");
      return;
    }
    setPending(session.id);
    try {
      const response = await fetch(`/api/impersonation/admin/sessions/${session.id}/revoke`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setSessions(current => current.filter(row => row.id !== session.id));
      toast.success("Privileged support session revoked");
    } catch (err: any) {
      toast.error(err?.message || "Could not revoke session");
      await load();
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" className="fixed bottom-5 left-5 z-[70] gap-2 bg-background shadow-lg" onClick={() => setOpen(true)}>
        <MonitorSmartphone className="h-4 w-4" />
        Sessions
        <Badge variant="secondary" className="ml-1 min-w-5 justify-center px-1.5 text-[10px]">{loading ? "…" : sessions.length}</Badge>
      </Button>

      {open && (
        <div className="fixed inset-0 z-[80] bg-black/35" onMouseDown={() => setOpen(false)}>
          <aside className="absolute left-0 top-0 flex h-full w-full max-w-xl flex-col border-r bg-background shadow-2xl" onMouseDown={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b p-5">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold"><MonitorSmartphone className="h-5 w-5" /> Active privileged sessions</h2>
                <p className="mt-1 text-sm text-muted-foreground">Admin sees all active View as user sessions. Support sees only sessions it started.</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close privileged sessions"><X className="h-4 w-4" /></Button>
            </div>

            <div className="flex items-center justify-between border-b px-5 py-3">
              <span className="text-sm text-muted-foreground">{loading ? "Loading…" : `${sessions.length} active session${sessions.length === 1 ? "" : "s"}`}</span>
              <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {loading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : sessions.length === 0 ? (
                <Card className="p-8 text-center text-sm text-muted-foreground">No active privileged sessions.</Card>
              ) : (
                <div className="space-y-3">
                  {sessions.map(session => (
                    <Card key={session.id} className="p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{session.actorRole}</Badge>
                        <span className="text-sm font-medium">{session.actorEmail || `actor #${session.actorId}`}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="text-sm">{session.targetEmail || `user #${session.targetUserId}`}</span>
                        <Badge className="ml-auto" variant="secondary">{remaining(session.expiresAt)}</Badge>
                      </div>
                      <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
                        <span>Reason: {session.reason}</span>
                        <span>IP: {session.actorIp || "unavailable"}</span>
                        <span className="truncate" title={session.userAgent || undefined}>Device: {session.userAgent || "unavailable"}</span>
                        <span>Started: {new Date(session.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Input value={reasons[session.id] || ""} onChange={event => setReasons(current => ({ ...current, [session.id]: event.target.value }))} placeholder="Required revoke reason…" maxLength={1000} />
                        <Button variant="destructive" size="sm" disabled={pending !== null} onClick={() => void revoke(session)}>
                          {pending === session.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ShieldX className="mr-1.5 h-3.5 w-3.5" />}
                          Revoke
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
