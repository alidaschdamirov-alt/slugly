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
import { Globe, Plus, Loader2, CheckCircle2, XCircle, Trash2, Copy, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function normalizeHostname(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "")
    .toLowerCase();
}

function validateHostname(value: string): string | null {
  const hostname = normalizeHostname(value);
  const labels = hostname.split(".");

  if (!hostname) return "Enter a domain, for example go.yourbrand.com.";
  if (hostname.length > 253) return "Domain is too long.";
  if (labels.length < 2) return "Enter a full domain or subdomain, for example go.yourbrand.com.";
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

export default function DomainsPage() {
  const { user, loading: authLoading } = useAuth();
  const [addOpen, setAddOpen] = useState(false);
  const [hostname, setHostname] = useState("");
  const [hostnameError, setHostnameError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  const { data: domains, isLoading } = trpc.domain.list.useQuery(undefined, { enabled: !!user });
  const utils = trpc.useUtils();

  const createDomain = trpc.domain.create.useMutation({
    onSuccess: () => {
      utils.domain.list.invalidate();
      setAddOpen(false);
      setHostname("");
      setHostnameError("");
      toast.success("Domain added! Follow the DNS instructions to verify.");
    },
    onError: (err) => toast.error(err.message),
  });

  const verifyDomain = trpc.domain.verify.useMutation({
    onSuccess: () => {
      utils.domain.list.invalidate();
      toast.success("Domain verified successfully!");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteDomain = trpc.domain.delete.useMutation({
    onSuccess: () => {
      utils.domain.list.invalidate();
      setDeleteTarget(null);
      toast.success("Domain removed");
    },
    onError: (err) => toast.error(err.message),
  });

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!user) { window.location.href = getLoginUrl(); return null; }

  const handleAddDomain = (e: React.FormEvent) => {
    e.preventDefault();
    const error = validateHostname(hostname);
    const normalized = normalizeHostname(hostname);

    if (error) {
      setHostnameError(error);
      return;
    }

    setHostname(normalized);
    setHostnameError("");
    createDomain.mutate({ hostname: normalized });
  };

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Custom Domains</h1>
            <p className="text-muted-foreground mt-1">Use your own domain for short links</p>
          </div>
          <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) setHostnameError(""); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Domain
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Custom Domain</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddDomain} className="space-y-4 mt-2" noValidate>
                <div className="space-y-2">
                  <Label>Domain</Label>
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
                    <p className="text-xs text-muted-foreground">Enter the subdomain you want to use for short links. Do not include spaces, paths, or symbols.</p>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={createDomain.isPending || !hostname.trim()}>
                  {createDomain.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Add Domain
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="p-4 mb-6 border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-900/10">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-yellow-800 dark:text-yellow-300">Custom domain routing is not yet active</p>
              <p className="text-yellow-700 dark:text-yellow-400 mt-1">
                Domain verification via DNS TXT is fully functional. However, actual traffic routing through your custom domain
                requires additional infrastructure (reverse proxy / CDN) that is not yet deployed. Verified domains will be activated
                once routing is configured. Your short links continue to work via the default Slugly domain.
              </p>
            </div>
          </div>
        </Card>

        {isLoading ? (
          <Card className="p-6 animate-pulse"><div className="h-4 bg-muted rounded w-1/3" /></Card>
        ) : domains && domains.length > 0 ? (
          <div className="space-y-3">
            {domains.map((domain: any) => (
              <Card key={domain.id} className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Globe className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{domain.hostname}</p>
                      <p className="text-xs text-muted-foreground">
                        Added {new Date(domain.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {domain.verified ? (
                      <Badge className="bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Verified
                      </Badge>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-yellow-700 dark:text-yellow-400">
                          <XCircle className="h-3 w-3 mr-1" />
                          Pending
                        </Badge>
                        <Button size="sm" variant="outline" onClick={() => verifyDomain.mutate({ id: domain.id })} disabled={verifyDomain.isPending}>
                          {verifyDomain.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Verify Now"}
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
                    <p className="text-sm font-medium">DNS Verification Required</p>
                    <div className="space-y-2 text-sm">
                      <p className="text-muted-foreground">Add the following DNS records at your domain registrar:</p>

                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">1. TXT Record (ownership verification)</p>
                        <div className="flex items-center gap-2">
                          <code className="flex-1 bg-background px-3 py-2 rounded border text-xs font-mono overflow-x-auto">
                            _slugly.{domain.hostname} TXT "{domain.verificationToken}"
                          </code>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 shrink-0"
                            onClick={() => {
                              navigator.clipboard.writeText(domain.verificationToken);
                              toast.success("Token copied!");
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">2. CNAME Record (traffic routing)</p>
                        <code className="block bg-background px-3 py-2 rounded border text-xs font-mono overflow-x-auto">
                          {domain.hostname} CNAME links.slugly.app
                        </code>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">DNS changes can take 5-30 minutes to propagate. Click "Verify Now" once records are set.</p>
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
              Add a domain for DNS verification now. Traffic routing is coming soon.
            </p>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Domain
            </Button>
          </Card>
        )}

        <Card className="p-6 mt-6">
          <h3 className="font-medium mb-3">How to set up your custom domain</h3>
          <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
            <li>Add your domain above — you'll receive a unique verification token</li>
            <li>Go to your DNS provider (Cloudflare, Namecheap, GoDaddy, etc.)</li>
            <li>Add a <strong className="text-foreground">TXT record</strong> for <code className="bg-muted px-1 rounded">_slugly.yourdomain.com</code> with the verification token</li>
            <li>Add a <strong className="text-foreground">CNAME record</strong> for your subdomain pointing to <code className="bg-muted px-1 rounded">links.slugly.app</code></li>
            <li>Wait for DNS propagation (usually 5-30 minutes)</li>
            <li>Click "Verify Now" to confirm ownership via DNS TXT lookup</li>
          </ol>
        </Card>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove domain?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {deleteTarget?.hostname || "this domain"} and its DNS verification. You'll need to set up the DNS records again to re-add it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteDomain.mutate({ id: deleteTarget.id })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteDomain.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Remove Domain
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
