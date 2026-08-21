import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArchiveRestore, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type TrashItem = {
  type: "user" | "link";
  id: number;
  name: string;
  deletedAt: number;
  purgeAfter: number;
  shortCode?: string;
  userId?: number;
};

async function readError(response: Response) {
  try {
    const data = await response.json();
    return data?.error || "Trash action failed";
  } catch {
    return "Trash action failed";
  }
}

function remainingLabel(purgeAfter: number, now: number) {
  const ms = purgeAfter - now;
  if (ms <= 0) return "Recovery window expired";
  const days = Math.ceil(ms / 86400000);
  return `${days} day${days === 1 ? "" : "s"} remaining`;
}

export default function AdminTrashPanel() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<TrashItem[]>([]);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/security/dangerous-actions/trash", { credentials: "include" });
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      setItems(Array.isArray(data?.items) ? data.items : []);
      setNow(Number(data?.now || Date.now()));
    } catch (err: any) {
      if (!quiet) toast.error(err?.message || "Failed to load Trash");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { setNow(Date.now()); void load(true); }, 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const restorable = useMemo(() => items.filter(item => item.purgeAfter > now).length, [items, now]);

  const restore = async (item: TrashItem) => {
    setPending(`restore:${item.type}:${item.id}`);
    try {
      const response = await fetch(`/api/security/dangerous-actions/trash/${item.type}/${item.id}/restore`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error(await readError(response));
      await load(true);
      toast.success(`${item.name} restored`);
    } catch (err: any) {
      toast.error(err?.message || "Restore failed");
    } finally { setPending(null); }
  };

  const purge = async (item: TrashItem) => {
    if (Date.now() < item.purgeAfter) return;
    const confirmation = window.prompt(
      `Permanent purge cannot be undone.\n\nType exactly:\n${item.name}`
    )?.trim();
    if (confirmation !== item.name) {
      if (confirmation) toast.error("Confirmation did not match. Nothing was purged.");
      return;
    }
    const reason = window.prompt("Reason for permanent purge:\n\nThis will be stored in the audit log.")?.trim() || "";
    if (reason.length < 3) return toast.error("A purge reason of at least 3 characters is required.");

    setPending(`purge:${item.type}:${item.id}`);
    try {
      const response = await fetch(`/api/security/dangerous-actions/trash/${item.type}/${item.id}/purge`, {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation, reason }),
      });
      if (!response.ok) throw new Error(await readError(response));
      await load(true);
      toast.success(`${item.name} permanently purged`);
    } catch (err: any) {
      toast.error(err?.message || "Permanent purge failed");
    } finally { setPending(null); }
  };

  return (
    <>
      <Button type="button" variant="outline" className="fixed bottom-5 left-5 z-[70] gap-2 bg-background shadow-lg" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" /> Trash
        {items.length > 0 && <Badge variant="secondary" className="px-1.5 text-[10px]">{items.length}</Badge>}
      </Button>

      {open && (
        <div className="fixed inset-0 z-[92] bg-black/35" onMouseDown={() => setOpen(false)}>
          <aside className="absolute left-0 top-0 flex h-full w-full max-w-2xl flex-col border-r bg-background shadow-2xl" onMouseDown={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b p-5">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold"><Trash2 className="h-5 w-5" /> Trash & Recovery</h2>
                <p className="mt-1 text-sm text-muted-foreground">Deleted users and links remain recoverable for 30 days. Permanent purge is blocked until that window expires.</p>
              </div>
              <div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => void load()} aria-label="Refresh Trash"><RefreshCw className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close Trash"><X className="h-4 w-4" /></Button></div>
            </div>

            <div className="border-b px-5 py-3 text-sm text-muted-foreground">{items.length} item{items.length === 1 ? "" : "s"} · {restorable} still recoverable</div>
            <div className="flex-1 overflow-y-auto p-5">
              {loading ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div> : items.length === 0 ? (
                <Card className="p-10 text-center"><ArchiveRestore className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 font-medium">Trash is empty</p><p className="mt-1 text-sm text-muted-foreground">Soft-deleted users and links will appear here.</p></Card>
              ) : <div className="space-y-3">{items.map(item => {
                const expired = now >= item.purgeAfter;
                const restoreKey = `restore:${item.type}:${item.id}`;
                const purgeKey = `purge:${item.type}:${item.id}`;
                return <Card key={`${item.type}:${item.id}`} className="p-4">
                  <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{item.type}</Badge><strong className="text-sm">{item.type === "link" ? `/r/${item.name}` : item.name}</strong><Badge variant={expired ? "destructive" : "secondary"}>{remainingLabel(item.purgeAfter, now)}</Badge></div>
                  <div className="mt-2 text-xs text-muted-foreground">Moved to Trash {new Date(item.deletedAt).toLocaleString()} · Purge unlocks {new Date(item.purgeAfter).toLocaleString()}</div>
                  <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={expired || pending !== null} onClick={() => void restore(item)}>{pending === restoreKey ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" />}Restore</Button><Button size="sm" variant="destructive" disabled={!expired || pending !== null} onClick={() => void purge(item)}>{pending === purgeKey ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}Permanent purge</Button></div>
                  {!expired && <p className="mt-2 text-[11px] text-muted-foreground">Permanent purge is intentionally unavailable during the recovery window.</p>}
                </Card>;
              })}</div>}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
