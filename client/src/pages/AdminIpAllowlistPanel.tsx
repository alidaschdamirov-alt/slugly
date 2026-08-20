import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GlobeLock, Loader2, Save, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

async function readError(response: Response) {
  try {
    const body = await response.json();
    return body?.error || "IP allowlist action failed";
  } catch {
    return "IP allowlist action failed";
  }
}

export default function AdminIpAllowlistPanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rulesText, setRulesText] = useState("");
  const [currentIp, setCurrentIp] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/security/admin/ip-allowlist", { credentials: "include" });
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      setRulesText(Array.isArray(data?.rules) ? data.rules.join("\n") : "");
      setCurrentIp(data?.currentIp || null);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load IP allowlist");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (reason.trim().length < 3) {
      toast.error("Enter a reason for changing the privileged IP allowlist.");
      return;
    }
    const rules = rulesText.split(/[\n,]+/).map(value => value.trim()).filter(Boolean);
    setSaving(true);
    try {
      const response = await fetch("/api/security/admin/ip-allowlist", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules, reason: reason.trim() }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const data = await response.json();
      setRulesText(Array.isArray(data?.rules) ? data.rules.join("\n") : "");
      setCurrentIp(data?.currentIp || currentIp);
      setReason("");
      toast.success(data?.rules?.length ? "Privileged IP allowlist updated" : "IP restriction disabled — all IPs allowed");
    } catch (err: any) {
      toast.error(err?.message || "Could not update IP allowlist");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" className="fixed bottom-[72px] right-5 z-[70] gap-2 bg-background shadow-lg" onClick={() => setOpen(true)}>
        <GlobeLock className="h-4 w-4" /> IP access
      </Button>

      {open && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/35 p-4" onMouseDown={() => setOpen(false)}>
          <Card className="w-full max-w-lg p-5 shadow-2xl" onMouseDown={event => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold"><GlobeLock className="h-5 w-5" /> Privileged IP allowlist</h2>
                <p className="mt-1 text-sm text-muted-foreground">Applies to Admin and Support tools. Empty list allows all IPs.</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close IP allowlist"><X className="h-4 w-4" /></Button>
            </div>

            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="rounded-md bg-muted p-3 text-sm">
                  <span className="text-muted-foreground">Your current IP: </span>
                  <code className="font-semibold">{currentIp || "unavailable"}</code>
                </div>
                <div className="space-y-2">
                  <Label>Allowed IPs / CIDR ranges</Label>
                  <Textarea value={rulesText} onChange={event => setRulesText(event.target.value)} rows={7} placeholder={`203.0.113.10\n198.51.100.0/24\n2001:db8::1`} />
                  <p className="text-xs text-muted-foreground">IPv4/IPv6 exact addresses and IPv4 CIDR are supported. One rule per line.</p>
                </div>
                <div className="space-y-2">
                  <Label>Required change reason</Label>
                  <Textarea value={reason} onChange={event => setReason(event.target.value)} rows={2} maxLength={1000} placeholder="Why is privileged network access changing?" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => void load()} disabled={saving}>Reload</Button>
                  <Button onClick={() => void save()} disabled={saving || reason.trim().length < 3}>
                    {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Save allowlist
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
