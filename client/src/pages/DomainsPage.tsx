import { useAuth } from "@/_core/hooks/useAuth";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { Globe, Plus, Loader2, CheckCircle2, XCircle, Trash2, Copy, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

function normalizeHostname(value: string): string {
  let hostname = value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "")
    .toLowerCase();
  if (hostname.includes(":")) hostname = hostname.split(":")[0];
  return hostname;
}

function validateHostname(value: string): string | null {
  const hostname = normalizeHostname(value);
  const labels = hostname.split(".");

  if (!hostname) return "Enter a subdomain, for example go.yourbrand.com.";
  if (hostname.length > 253) return "Domain is too long.";
  if (labels.length < 3) return "Use a subdomain such as go.yourbrand.com, not the root domain.";
  if (labels.some(label => label.length < 1 || label.length > 63)) {
    return "Every domain part must be between 1 and 63 characters.";
  }
  if (labels.some(label => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
    return "Use only letters, numbers, and hyphens. Spaces and symbols are not allowed.";
  }
  if (/^\d+$/.test(labels[labels.length - 1])) {
    return "Top-level domain cannot be only numbers.";
  }

  return null;
}

type DomainItem = {
  id: number;
  hostname: string;
  verified: boolean;
  verificationToken: string | null;
  createdAt: string | Date;
};

type DomainListResponse = {
  domains: DomainItem[];
  usage: number;
  limit: number;
  cnameTarget: string;
};

async function getApiError(response: Response) {
  try {
    const body = await response.json();
    return body?.error || body?.message || `Request failed with HTTP ${response.status}`;
  } catch {
    return `Request failed with HTTP ${response.status}`;
  }
}

export default function DomainsPage() {
  const { user, loading: authLoading } = useAuth();
  const [addOpen, setAddOpen] = useState(false);
  const [hostname, setHostname] = useState("");
  const [hostnameError, setHostnameError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DomainItem | null>(null);
  const [domains, setDomains] = useState<DomainItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [createPending, setCreatePending] = useState(false);
  const [verifyPendingId, setVerifyPendingId] = useState<number | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [usage, setUsage] = useState(0);
  const [limit, setLimit] = useState(0);
  const [cnameTarget, setCnameTarget] = useState("slugly.onrender.com");

  const { data: workspaceState, isLoading: workspaceLoading } = trpc.workspace.current.useQuery(undefined, { enabled: !!user });
  const workspaceId = workspaceState?.workspace?.id;

  const workspaceHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {};
    if (workspaceId) headers["x-workspace-id"] = String(workspaceId);
    return headers;
  }, [workspaceId]);

  const refreshDomains = useCallback(async () => {
    if (!user || !workspaceId) return;
    setIsLoading(true);
    try {
      const response = await fetch("/api/custom-domains", {
        headers: workspaceHeaders(),
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error(await getApiError(response));
      const data = (await response.json()) as DomainListResponse;
      setDomains(data.domains || []);
      setUsage(data.usage || 0);
      setLimit(data.limit ?? 0);
      setCnameTarget(data.cnameTarget || "slugly.onrender.com");
    } catch (error: any) {
      toast.error(error?.message || "Failed to load custom domains");
    } finally {
      setIsLoading(false);
    }
  }, [user, workspaceId, workspaceHeaders]);

  useEffect(() => {
    void refreshDomains();
  }, [refreshDomains]);

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!user) { window.location.href = getLoginUrl(); return null; }

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    const error = validateHostname(hostname);
    const normalized = normalizeHostname(hostname);

    if (error) {
      setHostnameError(error);
      return;
    }

    setHostname(normalized);
    setHostnameError("");
    setCreatePending(true);
    try {
      const response = await fetch("/api/custom-domains", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...workspaceHeaders() },
        credentials: "same-origin",
        body: JSON.stringify({ hostname: normalized }),
      });
      if (!response.ok) throw new Error(await getApiError(response));
      setAddOpen(false);
      setHostname("");
      toast.success("Domain added. Add the TXT and CNAME records, then verify it.");
      await refreshDomains();
    } catch (err: any) {
      toast.error(err?.message || "Failed to add domain");
    } finally {
      setCreatePending(false);
    }
  };

  const verifyDomain = async (domain: DomainItem) => {
    setVerifyPendingId(domain.id);
    try {
      const response = await fetch(`/api/custom-domains/${domain.id}/verify`, {
        method: "POST",
        headers: workspaceHeaders(),
        credentials: "same-origin",
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error || `Verification failed with HTTP ${response.status}`);
      toast.success(body?.message || (body?.verified ? "Domain is active!" : "Verification is still pending."));
      await refreshDomains();
    } catch (err: any) {
      toast.error(err?.message || "Domain verification failed");
    } finally {
      setVerifyPendingId(null);
    }
  };

  const deleteDomain = async () => {
    if (!deleteTarget) return;
    setDeletePending(true);
    try {
      const response = await fetch(`/api/custom-domains/${deleteTarget.id}`, {
        method: "DELETE",
        headers: workspaceHeaders(),
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error(await getApiError(response));
      setDeleteTarget(null);
      toast.success("Domain removed. Links using it now fall back to Slugly.");
      await refreshDomains();
    } catch (err: any) {
      toast.error(err?.message || "Failed to remove domain");
    } finally {
      setDeletePending(false);
    }
  };

  const limitReached = limit !== -1 && usage >= limit;

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Custom Domains</h1>
            <p className="text-muted-foreground mt-1">Use your own branded subdomain for short links</p>
          </div>
          <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) setHostnameError(""); }}>
            <DialogTrigger asChild>
              <Button disabled={workspaceLoading || limitReached}>
                <Plus className="h-4 w-4 mr-2" />
                {limitReached ? "Domain Limit Reached" : "Add Domain"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Custom Domain</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddDomain} className="space-y-4 mt-2" noValidate>
                <div className="space-y-2">
                  <Label>Branded subdomain</Label>
                  <Input
                    value={hostname}
                    onChange={e => {
                      setHostname(e.target.value);
                      setHostnameError("");
                    }}
                    onBlur={() => setHostname(normalizeHostname(hostname))}
                    placeholder="go.yourbrand.com"
                    aria-invalid={!!hostnameError}
                    required
                  />
                  {hostnameError ? (
                    <p className="text-xs text-destructive">{hostnameError}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Use a dedicated subdomain such as go.yourbrand.com. Root domains are intentionally not accepted in this first release.</p>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={createPending || !hostname.trim()}>
                  {createPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Add Domain
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Domain usage</p>
            <p className="text-xl font-semibold mt-1">{usage} / {limit === -1 ? "Unlimited" : limit}</p>
          </Card>
          <Card className="p-4 border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/10">
            <div className="flex gap-3 items-start">
              <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-800 dark:text-green-300">Managed HTTPS routing</p>
                <p className="text-xs text-green-700 dark:text-green-400 mt-1">Slugly provisions the domain on Render and SSL is issued automatically after DNS verification.</p>
              </div>
            </div>
          </Card>
        </div>

        {isLoading || workspaceLoading ? (
          <Card className="p-6 animate-pulse"><div className="h-4 bg-muted rounded w-1/3" /></Card>
        ) : domains.length > 0 ? (
          <div className="space-y-3">
            {domains.map((domain) => (
              <Card key={domain.id} className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Globe className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{domain.hostname}</p>
                      <p className="text-xs text-muted-foreground">
                        {domain.verified ? `Short links: https://${domain.hostname}/your-code` : `Added ${new Date(domain.createdAt).toLocaleDateString()}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {domain.verified ? (
                      <Badge className="bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Active
                      </Badge>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-yellow-700 dark:text-yellow-400">
                          <XCircle className="h-3 w-3 mr-1" />
                          Pending DNS
                        </Badge>
                        <Button size="sm" variant="outline" onClick={() => void verifyDomain(domain)} disabled={verifyPendingId === domain.id}>
                          {verifyPendingId === domain.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Verify Now"}
                        </Button>
                      </div>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      onClick={() => setDeleteTarget(domain)}
                      aria-label={`Remove ${domain.hostname}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {!domain.verified && domain.verificationToken && (
                  <div className="mt-4 p-4 bg-muted/50 rounded-lg border border-dashed space-y-3">
                    <p className="text-sm font-medium">DNS setup required</p>
                    <div className="space-y-3 text-sm">
                      <p className="text-muted-foreground">Add both records at your DNS provider. If you use Cloudflare, keep the CNAME in DNS-only mode while verifying.</p>

                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">1. TXT — ownership verification</p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 bg-background px-3 py-2 rounded border text-xs font-mono overflow-x-auto">
                            _slugly.{domain.hostname} TXT "{domain.verificationToken}"
                          </code>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 shrink-0"
                            onClick={() => {
                              navigator.clipboard.writeText(domain.verificationToken || "");
                              toast.success("Verification token copied!");
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">2. CNAME — traffic routing</p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 bg-background px-3 py-2 rounded border text-xs font-mono overflow-x-auto">
                            {domain.hostname} CNAME {cnameTarget}
                          </code>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 shrink-0"
                            onClick={() => {
                              navigator.clipboard.writeText(cnameTarget);
                              toast.success("CNAME target copied!");
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">DNS usually propagates within a few minutes, but some providers can take longer. Once both records are live, click Verify Now. Render will then issue HTTPS automatically.</p>
                  </div>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <Globe className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-medium text-lg mb-2">No custom domains</h3>
            <p className="text-muted-foreground mb-4 text-sm">
              Add a branded subdomain and Slugly will provision routing and HTTPS for it.
            </p>
            <Button onClick={() => setAddOpen(true)} disabled={limitReached}>
              <Plus className="h-4 w-4 mr-2" />
              Add Domain
            </Button>
          </Card>
        )}

        <Card className="p-6 mt-6">
          <h3 className="font-medium mb-3">How custom domains work</h3>
          <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
            <li>Add a branded subdomain such as <code className="bg-muted px-1 rounded">go.yourbrand.com</code></li>
            <li>Slugly registers the hostname with the managed routing provider</li>
            <li>Add the displayed <strong className="text-foreground">TXT record</strong> to prove ownership</li>
            <li>Add the displayed <strong className="text-foreground">CNAME record</strong> pointing to <code className="bg-muted px-1 rounded">{cnameTarget}</code></li>
            <li>Click <strong className="text-foreground">Verify Now</strong>; HTTPS is issued automatically</li>
            <li>Select the active domain when creating a link to get <code className="bg-muted px-1 rounded">https://go.yourbrand.com/my-link</code></li>
          </ol>
        </Card>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove domain?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {deleteTarget?.hostname || "this domain"} from Slugly and Render. Existing links are kept and fall back to the default Slugly URL.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void deleteDomain()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletePending}
            >
              {deletePending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Remove Domain
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}