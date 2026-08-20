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
  quarantine: {
    reason: string;
    threatTypes?: string[];
    source: string;
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

export default function SupportSecurityDrawer() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<QuarantineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [pendingId, setPendingId] = useState<number | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/security/admin/quarantine", { credentials: "include" });
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

  const rescan = async (item: QuarantineItem) => {
    const reason = (reasons[item.id] || "").trim();
    if (reason.length < 3) {
      toast.error("Enter a review reason before re-scanning.");
      return;
    }
    setPendingId(item.id);
    try {
      const response = await fetch(`/api/security/admin/quarantine/${item.id}/review`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rescan", reason }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.reason || data?.error || "Security review failed");
      if (data?.released) {
        toast.success("Re-scan passed. Quarantine released.");
        setItems(current => current.filter(row => row.id !== item.id));
      } else {
        toast.info(`Security verdict: ${data?.verdict || "unknown"}`);
        await loadQueue();
      }
    } catch (err: any) {
      toast.error(err?.message || "Security review failed");
      await loadQueue();
    } finally {
      setPendingId(null);
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
        Quarantine
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
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <ShieldCheck className="h-5 w-5 text-primary" /> Support quarantine review
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Support may re-scan destinations. Force release and security configuration are administrator-only.
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close quarantine review">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center justify-between border-b px-5 py-3">
              <span className="text-sm text-muted-foreground">{loading ? "Loading…" : `${items.length} quarantined`}</span>
              <Button variant="outline" size="sm" onClick={() => void loadQueue()} disabled={loading}>
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {loading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : error ? (
                <Card className="border-destructive/30 bg-destructive/5 p-4">
                  <div className="flex gap-3">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    <div><p className="font-medium">Couldn&apos;t load quarantine queue</p><p className="text-sm text-muted-foreground">{error}</p></div>
                  </div>
                </Card>
              ) : items.length === 0 ? (
                <Card className="p-8 text-center text-sm text-muted-foreground">No quarantined links.</Card>
              ) : (
                <div className="space-y-3">
                  {items.map(item => (
                    <Card key={item.id} className="p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="rounded bg-muted px-2 py-0.5 text-xs">/r/{item.shortCode}</code>
                        <Badge variant="destructive">Security quarantine</Badge>
                        <span className="ml-auto text-xs text-muted-foreground">Owner #{item.userId || "anonymous"}</span>
                      </div>
                      <p className="mt-3 break-all text-sm">{item.destinationUrl}</p>
                      <p className="mt-2 text-xs text-destructive">{item.quarantine.reason}</p>
                      <Textarea
                        className="mt-3"
                        value={reasons[item.id] || ""}
                        onChange={event => setReasons(current => ({ ...current, [item.id]: event.target.value }))}
                        placeholder="Required support review reason…"
                        rows={2}
                        maxLength={1000}
                      />
                      <Button className="mt-2" variant="outline" size="sm" disabled={pendingId !== null} onClick={() => void rescan(item)}>
                        {pendingId === item.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                        Re-scan destination
                      </Button>
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
