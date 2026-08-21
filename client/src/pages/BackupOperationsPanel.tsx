import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Archive, CheckCircle2, Download, FlaskConical, Loader2, RefreshCw, Save, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type BackupConfig = {
  enabled: boolean;
  hourUtc: number;
  minuteUtc: number;
  retentionCount: number;
  retentionDays: number;
};

type BackupManifest = {
  id: string;
  key: string;
  createdAt: string;
  source: "scheduled" | "manual";
  version: string;
  encrypted: true;
  encryption: "aes-256-gcm";
  encryptionKeySource: "dedicated" | "storage-signing" | "clerk-secret";
  checksumSha256: string;
  sizeBytes: number;
  plaintextBytes: number;
  summary: Record<string, number>;
  integrityStatus: "verified" | "failed" | "pending";
  lastVerifiedAt?: string | null;
  lastRestoreTestAt?: string | null;
  restoreTestStatus?: "passed" | "failed" | null;
  restoreTestDetail?: string | null;
};

type BackupState = {
  config: BackupConfig;
  history: BackupManifest[];
  encryptionConfigured: boolean;
  dedicatedEncryptionKey: boolean;
  restoreProcedure: string;
};

async function readError(response: Response) {
  try {
    const body = await response.json();
    return body?.error || "Backup operation failed";
  } catch {
    return "Backup operation failed";
  }
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function integrityBadge(item: BackupManifest) {
  if (item.integrityStatus === "verified") return <Badge className="bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300">verified</Badge>;
  if (item.integrityStatus === "failed") return <Badge variant="destructive">failed</Badge>;
  return <Badge variant="secondary">pending</Badge>;
}

export default function BackupOperationsPanel() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<BackupState | null>(null);
  const [config, setConfig] = useState<BackupConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/security/backups", { credentials: "include" });
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json() as BackupState;
      setState(data);
      setConfig(data.config);
    } catch (error: any) {
      if (!quiet) toast.error(error?.message || "Failed to load backups");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const nextRun = useMemo(() => {
    if (!config?.enabled) return "Disabled";
    return `Daily at ${String(config.hourUtc).padStart(2, "0")}:${String(config.minuteUtc).padStart(2, "0")} UTC`;
  }, [config]);

  const saveConfig = async () => {
    if (!config) return;
    setPending("config");
    try {
      const response = await fetch("/api/security/backups/config", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      setConfig(data.config);
      await load(true);
      toast.success("Backup schedule and retention updated");
    } catch (error: any) {
      toast.error(error?.message || "Failed to update backup configuration");
    } finally {
      setPending(null);
    }
  };

  const createNow = async () => {
    setPending("run");
    try {
      const response = await fetch("/api/security/backups/run", { method: "POST", credentials: "include" });
      if (!response.ok) throw new Error(await readError(response));
      await load(true);
      toast.success("Encrypted backup created and verified");
    } catch (error: any) {
      toast.error(error?.message || "Backup creation failed");
    } finally {
      setPending(null);
    }
  };

  const verify = async (item: BackupManifest) => {
    setPending(`verify:${item.id}`);
    try {
      const response = await fetch(`/api/security/backups/${item.id}/verify`, { method: "POST", credentials: "include" });
      if (!response.ok) throw new Error(await readError(response));
      await load(true);
      toast.success(`Backup ${item.id} passed integrity verification`);
    } catch (error: any) {
      toast.error(error?.message || "Integrity verification failed");
      await load(true);
    } finally {
      setPending(null);
    }
  };

  const testRestore = async (item: BackupManifest) => {
    setPending(`restore:${item.id}`);
    try {
      const response = await fetch(`/api/security/backups/${item.id}/test-restore`, { method: "POST", credentials: "include" });
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      await load(true);
      toast.success(`Restore test passed: ${data.rowCount} rows across ${data.tableCount} tables`);
    } catch (error: any) {
      toast.error(error?.message || "Restore test failed");
      await load(true);
    } finally {
      setPending(null);
    }
  };

  const download = async (item: BackupManifest) => {
    setPending(`download:${item.id}`);
    try {
      const response = await fetch(`/api/security/backups/${item.id}/download`, { credentials: "include" });
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      const anchor = document.createElement("a");
      anchor.href = data.url;
      anchor.download = item.key.split("/").pop() || `slugly-backup-${item.id}.json.enc`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      toast.success("Encrypted backup download started");
    } catch (error: any) {
      toast.error(error?.message || "Backup download failed");
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" className="fixed bottom-[228px] right-5 z-[70] gap-2 bg-background shadow-lg" onClick={() => setOpen(true)}>
        <Archive className="h-4 w-4" /> Backups
        {state?.history?.length ? <Badge variant="secondary" className="px-1.5 text-[10px]">{state.history.length}</Badge> : null}
      </Button>

      {open && (
        <div className="fixed inset-0 z-[93] bg-black/35" onMouseDown={() => setOpen(false)}>
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-4xl flex-col border-l bg-background shadow-2xl" onMouseDown={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 border-b p-5">
              <div>
                <div className="flex flex-wrap items-center gap-2"><Archive className="h-5 w-5" /><h2 className="text-lg font-semibold">Backups & Recovery</h2>{state?.encryptionConfigured && <Badge className="bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300"><ShieldCheck className="mr-1 h-3 w-3" />Encrypted</Badge>}</div>
                <p className="mt-1 text-sm text-muted-foreground">Versioned AES-256-GCM snapshots with retention, integrity verification and dry-run restore validation.</p>
              </div>
              <div className="flex gap-1"><Button variant="ghost" size="icon" onClick={() => void load()} aria-label="Refresh backups"><RefreshCw className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close backups"><X className="h-4 w-4" /></Button></div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {loading || !state || !config ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div> : (
                <div className="space-y-6">
                  {!state.dedicatedEncryptionKey && <Card className="border-amber-300 bg-amber-50/50 p-4 text-sm dark:bg-amber-950/20"><p className="font-semibold">Dedicated backup key recommended</p><p className="mt-1 text-xs text-muted-foreground">Backups are encrypted, but the server is currently deriving the key from an existing server secret. Configure <code>BACKUP_ENCRYPTION_KEY</code> to isolate backup encryption from other credentials.</p></Card>}

                  <Card className="space-y-4 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Automatic schedule</h3><p className="text-xs text-muted-foreground">{nextRun}</p></div><div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">Enabled</span><Switch checked={config.enabled} onCheckedChange={enabled => setConfig(current => current ? { ...current, enabled } : current)} /></div></div>
                    <div className="grid gap-3 sm:grid-cols-4">
                      <div><label className="mb-1 block text-xs font-medium text-muted-foreground">UTC hour</label><Input type="number" min={0} max={23} value={config.hourUtc} onChange={event => setConfig({ ...config, hourUtc: Number(event.target.value) })} /></div>
                      <div><label className="mb-1 block text-xs font-medium text-muted-foreground">UTC minute</label><Input type="number" min={0} max={59} value={config.minuteUtc} onChange={event => setConfig({ ...config, minuteUtc: Number(event.target.value) })} /></div>
                      <div><label className="mb-1 block text-xs font-medium text-muted-foreground">Keep versions</label><Input type="number" min={1} max={365} value={config.retentionCount} onChange={event => setConfig({ ...config, retentionCount: Number(event.target.value) })} /></div>
                      <div><label className="mb-1 block text-xs font-medium text-muted-foreground">Retention days</label><Input type="number" min={1} max={3650} value={config.retentionDays} onChange={event => setConfig({ ...config, retentionDays: Number(event.target.value) })} /></div>
                    </div>
                    <div className="flex flex-wrap gap-2"><Button onClick={() => void saveConfig()} disabled={pending !== null}>{pending === "config" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save policy</Button><Button variant="outline" onClick={() => void createNow()} disabled={pending !== null}>{pending === "run" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Archive className="mr-2 h-4 w-4" />}Create encrypted backup now</Button></div>
                  </Card>

                  <section>
                    <div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold">Version history</h3><p className="text-xs text-muted-foreground">Each download is a signed 15-minute private URL and is recorded in the audit log.</p></div><span className="text-xs text-muted-foreground">{state.history.length} version{state.history.length === 1 ? "" : "s"}</span></div>
                    {state.history.length === 0 ? <Card className="p-8 text-center"><Archive className="mx-auto h-8 w-8 text-muted-foreground" /><p className="mt-3 font-medium">No backup versions yet</p><p className="mt-1 text-sm text-muted-foreground">Create one now or wait for the scheduled run.</p></Card> : <div className="space-y-3">{state.history.map(item => {
                      const verifyKey = `verify:${item.id}`;
                      const restoreKey = `restore:${item.id}`;
                      const downloadKey = `download:${item.id}`;
                      const totalRows = Object.values(item.summary || {}).reduce((sum, count) => sum + Number(count || 0), 0);
                      return <Card key={item.id} className="p-4">
                        <div className="flex flex-wrap items-center gap-2"><code className="rounded bg-muted px-2 py-0.5 text-xs">{item.id}</code><Badge variant="outline">{item.source}</Badge>{integrityBadge(item)}{item.restoreTestStatus === "passed" && <Badge className="bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300"><CheckCircle2 className="mr-1 h-3 w-3" />restore tested</Badge>}{item.restoreTestStatus === "failed" && <Badge variant="destructive">restore failed</Badge>}<span className="ml-auto text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</span></div>
                        <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-4"><div>Encrypted <strong className="text-foreground">AES-256-GCM</strong></div><div>Size <strong className="text-foreground">{formatBytes(item.sizeBytes)}</strong></div><div>Rows <strong className="text-foreground">{totalRows.toLocaleString()}</strong></div><div>Format <strong className="text-foreground">v{item.version}</strong></div></div>
                        <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">SHA-256 {item.checksumSha256}</p>
                        {item.restoreTestDetail && <p className="mt-2 text-xs text-muted-foreground">Restore test: {item.restoreTestDetail}</p>}
                        <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={pending !== null} onClick={() => void verify(item)}>{pending === verifyKey ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />}Verify</Button><Button size="sm" variant="outline" disabled={pending !== null} onClick={() => void testRestore(item)}>{pending === restoreKey ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="mr-1.5 h-3.5 w-3.5" />}Test restore</Button><Button size="sm" disabled={pending !== null} onClick={() => void download(item)}>{pending === downloadKey ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}Download encrypted</Button></div>
                      </Card>;
                    })}</div>}
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
