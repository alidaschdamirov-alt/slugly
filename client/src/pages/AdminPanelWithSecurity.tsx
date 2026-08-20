import AdminPanel from "./AdminPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Loader2, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type QuarantineItem = {
  id: number;
  userId: number;
  shortCode: string;
  destinationUrl: string;
  status: string;
  createdAt: string | Date;
  quarantine: {
    reason: string;
    threatTypes?: string[];
    source: string;
    createdAt: number;
    updatedAt: number;
  };
};

async function readError(response: Response) {
  try {
    const body = await response.json();
    return body?.reason || body?.error || "Security action failed";
  } catch {
    return "Security action failed";
  }
}

function SecurityQuarantineDrawer() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<QuarantineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [pending, setPending] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/security/admin/quarantine", {
        credentials: "include",
      });
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      setItems(Array.isArray(data?.links) ? data.links : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load quarantine queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const review = async (item: QuarantineItem, action: "rescan" | "release") => {
    const reason = (reasons[item.id] || "").trim();
    if (reason.length < 3) {
      toast.error("Enter a review reason before taking action.");
      return;
    }

    const key = `${item.id}:${action}`;
    setPending(key);
    try {
      const response = await fetch(`/api/security/admin/quarantine/${item.id}/review`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.reason || data?.error || "Security review failed");
      }

      if (data?.released) {
        setItems(current => current.filter(row => row.id !== item.id));
        setReasons(current => {
          const next = { ...current };
          delete next[item.id];
          return next;
        });
        toast.success(action === "rescan" ? "Re-scan passed. Quarantine released." : "Quarantine released by admin override.");
      } else {
        toast.info(`Security verdict: ${data?.verdict || "unknown"}`);
        await loadQueue();
      }
    } catch (err: any) {
      toast.error(err?.message || "Security review failed");
      await loadQueue();
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <Button
        type="button"
        className="fixed bottom-5 right-5 z-[70] gap-2 shadow-lg"
        variant={items.length > 0 ? "destructive" : "default"}
        onClick={() => setOpen(true)}
      >
        <ShieldCheck className="h-4 w-4" />
        Security Quarantine
        <Badge variant="secondary" className="ml-1 min-w-5 justify-center px-1.5 text-[10px]">
          {loading ? "…" : items.length}
        </Badge>
      </Button>

      {open && (
        <div className="fixed inset-0 z-[80] bg-black/35" onMouseDown={() => setOpen(false)}>
          <aside
            className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l bg-background shadow-2xl"
            onMouseDown={event => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b p-5">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">Security Quarantine</h2>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Review links blocked by the security layer. Every release requires an administrator reason.
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close security quarantine">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center justify-between border-b px-5 py-3">
              <span className="text-sm text-muted-foreground">
                {loading ? "Loading…" : `${items.length} quarantined link${items.length === 1 ? "" : "s"}`}
              </span>
              <Button variant="outline" size="sm" onClick={() => void loadQueue()} disabled={loading}>
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {loading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : error ? (
                <Card className="border-destructive/30 bg-destructive/5 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
                    <div className="flex-1">
                      <p className="font-medium">Couldn&apos;t load quarantine queue</p>
                      <p className="mt-1 text-sm text-muted-foreground">{error}</p>
                      <Button className="mt-3" variant="outline" size="sm" onClick={() => void loadQueue()}>Retry</Button>
                    </div>
                  </div>
                </Card>
              ) : items.length === 0 ? (
                <Card className="p-8 text-center">
                  <ShieldCheck className="mx-auto h-9 w-9 text-green-600" />
                  <p className="mt-3 font-medium">No quarantined links</p>
                  <p className="mt-1 text-sm text-muted-foreground">The security review queue is clear.</p>
                </Card>
              ) : (
                <div className="space-y-3">
                  {items.map(item => {
                    const rescanKey = `${item.id}:rescan`;
                    const releaseKey = `${item.id}:release`;
                    return (
                      <Card key={item.id} className="p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="rounded bg-muted px-2 py-0.5 text-xs font-mono">/r/{item.shortCode}</code>
                          <Badge variant="destructive">Security quarantine</Badge>
                          <span className="ml-auto text-xs text-muted-foreground">Owner #{item.userId || "anonymous"}</span>
                        </div>
                        <p className="mt-3 break-all text-sm">{item.destinationUrl}</p>
                        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                          <p className="font-medium">{item.quarantine.reason}</p>
                          <p className="mt-1 opacity-80">
                            Source: {item.quarantine.source}
                            {item.quarantine.threatTypes?.length ? ` · ${item.quarantine.threatTypes.join(", ")}` : ""}
                          </p>
                          <p className="mt-1 opacity-70">Updated {new Date(item.quarantine.updatedAt).toLocaleString()}</p>
                        </div>
                        <div className="mt-3 space-y-2">
                          <Textarea
                            value={reasons[item.id] || ""}
                            onChange={event => setReasons(current => ({ ...current, [item.id]: event.target.value }))}
                            placeholder="Required review reason…"
                            rows={2}
                            maxLength={1000}
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={!!pending}
                              onClick={() => void review(item, "rescan")}
                            >
                              {pending === rescanKey ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                              Re-scan destination
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={!!pending}
                              onClick={() => void review(item, "release")}
                            >
                              {pending === releaseKey ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />}
                              Force release
                            </Button>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

export default function AdminPanelWithSecurity() {
  return (
    <>
      <AdminPanel />
      <SecurityQuarantineDrawer />
    </>
  );
}
