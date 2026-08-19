import { useAuth } from "@/_core/hooks/useAuth";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { ArrowLeft, Globe, Monitor, Chrome, Link2, Loader2, Copy, Check, Pencil, Trash2, QrCode, Pause, Play } from "lucide-react";
import { getCountryFlag, getBrowserIcon, getDeviceIcon } from "@/lib/analyticsHelpers";
import { getEffectiveLinkStatus, getEffectiveStatusClass, getEffectiveStatusLabel } from "@/lib/linkStatus";
import WorldMap from "@/components/WorldMap";
import LinkPreview from "@/components/LinkPreview";
import InlineQrCode from "@/components/InlineQrCode";
import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import TagInput from "@/components/TagInput";
import { QrCodeDialog } from "@/components/QrCodeDialog";
import CsvExportButton from "@/components/CsvExportButton";

export default function LinkAnalytics() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const linkId = parseInt(params.id || "0");
  const [copied, setCopied] = useState(false);
  const [days, setDays] = useState(30);
  const [editOpen, setEditOpen] = useState(false);
  const [editDest, setEditDest] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editUtmSource, setEditUtmSource] = useState("");
  const [editUtmMedium, setEditUtmMedium] = useState("");
  const [editUtmCampaign, setEditUtmCampaign] = useState("");
  const [editUtmTerm, setEditUtmTerm] = useState("");
  const [editUtmContent, setEditUtmContent] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  const { data, isLoading } = trpc.link.analytics.useQuery(
    { id: linkId, days },
    { enabled: !!user && linkId > 0 }
  );
  const utils = trpc.useUtils();

  const updateLink = trpc.link.update.useMutation({
    onSuccess: () => {
      utils.link.analytics.invalidate({ id: linkId });
      utils.tag.list.invalidate();
      setEditOpen(false);
      toast.success("Link updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleStatus = trpc.link.update.useMutation({
    onSuccess: () => {
      utils.link.analytics.invalidate({ id: linkId });
      toast.success("Status updated");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteLink = trpc.link.delete.useMutation({
    onSuccess: () => {
      toast.success("Link deleted");
      setLocation("/dashboard");
    },
    onError: (err) => toast.error(err.message),
  });

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!user) { window.location.href = getLoginUrl(); return null; }

  const shortUrl = data?.link
    ? data.customDomain
      ? `https://${data.customDomain}/${data.link.shortCode}`
      : `${window.location.origin}/r/${data.link.shortCode}`
    : "";
  const effectiveStatus = data?.link ? getEffectiveLinkStatus(data.link) : "active";
  const uniqueClicks = (data as any)?.uniqueClicks ?? (data as any)?.uniqueClickCount;

  const copyLink = () => {
    if (shortUrl) {
      navigator.clipboard.writeText(shortUrl);
      setCopied(true);
      toast.success("Copied!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const openEditDialog = () => {
    if (data?.link) {
      setEditDest(data.link.destinationUrl);
      setEditTitle(data.link.title || "");
      setEditTags(data.link.tags || []);
      setEditUtmSource(data.link.utmSource || "");
      setEditUtmMedium(data.link.utmMedium || "");
      setEditUtmCampaign(data.link.utmCampaign || "");
      setEditUtmTerm(data.link.utmTerm || "");
      setEditUtmContent(data.link.utmContent || "");
      setEditOpen(true);
    }
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateLink.mutate({
      id: linkId,
      destinationUrl: editDest,
      title: editTitle || undefined,
      tags: editTags.length > 0 ? editTags : undefined,
      utmSource: editUtmSource || undefined,
      utmMedium: editUtmMedium || undefined,
      utmCampaign: editUtmCampaign || undefined,
      utmTerm: editUtmTerm || undefined,
      utmContent: editUtmContent || undefined,
    });
  };

  const handleToggleStatus = () => {
    if (data?.link) {
      toggleStatus.mutate({
        id: linkId,
        status: data.link.status === "active" ? "paused" : "active",
      });
    }
  };

  const formatDateTime = (date: string | Date) => {
    return new Date(date).toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const hasSingleChartPoint = data?.clicksOverTime?.length === 1;

  return (
    <AppShell>
      <button onClick={() => window.history.back()} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : !data ? (
        <div className="text-center py-16"><p className="text-muted-foreground">Link not found</p></div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{data.link.title || data.link.shortCode}</h1>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <code className="text-sm bg-muted px-2 py-0.5 rounded font-mono">/r/{data.link.shortCode}</code>
                <button onClick={copyLink} className="p-1 hover:bg-muted rounded transition-colors">
                  {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                </button>
                <Badge variant="secondary" className={`text-xs border-0 ${getEffectiveStatusClass(effectiveStatus)}`}>
                  {getEffectiveStatusLabel(effectiveStatus)}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1 truncate max-w-lg">{data.link.destinationUrl}</p>
              {data.link.tags && data.link.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {data.link.tags.map((tag: string) => (
                    <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-muted-foreground">
                <span>Created: {formatDateTime(data.link.createdAt)}</span>
                {data.link.updatedAt && new Date(data.link.updatedAt).getTime() - new Date(data.link.createdAt).getTime() > 60000 && (
                  <span>Updated: {formatDateTime(data.link.updatedAt)}</span>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div
                className="w-16 h-16 bg-white rounded-lg p-1 border cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setQrOpen(true)}
                title="Click to enlarge QR code"
              >
                <InlineQrCode url={shortUrl} className="h-full w-full" />
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold">{data.clickCount.toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">total clicks</p>
                {typeof uniqueClicks === "number" && (
                  <p className="text-sm text-muted-foreground">{uniqueClicks.toLocaleString()} unique</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <Button variant="outline" size="sm" onClick={handleToggleStatus}>
                  {data.link.status === "active" ? <Pause className="h-3.5 w-3.5 mr-1.5" /> : <Play className="h-3.5 w-3.5 mr-1.5" />}
                  {data.link.status === "active" ? "Pause" : "Resume"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setQrOpen(true)}>
                  <QrCode className="h-3.5 w-3.5 mr-1.5" />
                  QR
                </Button>
                <Button variant="outline" size="sm" onClick={openEditDialog}>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Edit
                </Button>
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Delete
                </Button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-2">
              {[7, 14, 30, 90].map(d => (
                <Button key={d} variant={days === d ? "default" : "outline"} size="sm" onClick={() => setDays(d)}>
                  {d}d
                </Button>
              ))}
            </div>
            <CsvExportButton
              data={undefined}
              filename={`link-${data?.link.shortCode || linkId}-analytics`}
              onFetch={async () => {
                const result = await utils.analyticsExport.linkCsv.fetch({ linkId, days });
                return result as any[];
              }}
            />
          </div>

          <Card className="p-6">
            <h3 className="font-medium mb-4">Clicks Over Time</h3>
            {data.clicksOverTime.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                {hasSingleChartPoint ? (
                  <BarChart data={data.clicksOverTime}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                    <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                    <Tooltip />
                    <Bar dataKey="count" fill="oklch(0.55 0.22 270)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                ) : (
                  <AreaChart data={data.clicksOverTime}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                    <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                    <Tooltip />
                    <Area type="monotone" dataKey="count" stroke="oklch(0.55 0.22 270)" fill="oklch(0.55 0.22 270 / 0.2)" strokeWidth={2} />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-2">No click data yet</p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Share your short link to start seeing analytics. Clicks will appear here in real time as people visit your link.
                </p>
              </div>
            )}
          </Card>

          <LinkPreview url={data.link.destinationUrl} />

          <Card className="p-6">
            <h3 className="font-medium mb-4 flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              Geographic Distribution
            </h3>
            {data.countries.length > 0 ? (
              <WorldMap countries={data.countries} />
            ) : (
              <p className="text-sm text-muted-foreground">No country data yet</p>
            )}
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-6">
              <h3 className="font-medium mb-4 flex items-center gap-2"><Globe className="h-4 w-4 text-primary" />Top Countries</h3>
              {data.countries.length > 0 ? <StatsList rows={data.countries} total={data.clickCount} icon={(value) => getCountryFlag(value)} /> : <p className="text-sm text-muted-foreground">No data yet</p>}
            </Card>

            <Card className="p-6">
              <h3 className="font-medium mb-4 flex items-center gap-2"><Monitor className="h-4 w-4 text-primary" />Devices</h3>
              {data.devices.length > 0 ? <StatsList rows={data.devices} total={data.clickCount} icon={(value) => getDeviceIcon(value).emoji} label={(value) => getDeviceIcon(value).label} capitalize /> : <p className="text-sm text-muted-foreground">No data yet</p>}
            </Card>

            <Card className="p-6">
              <h3 className="font-medium mb-4 flex items-center gap-2"><Chrome className="h-4 w-4 text-primary" />Browsers</h3>
              {data.browsers.length > 0 ? (
                <div className="space-y-2.5">
                  {data.browsers.map((b: any, i: number) => {
                    const { name, color } = getBrowserIcon(b.value);
                    const pct = data.clickCount > 0 ? Math.round((b.count / data.clickCount) * 100) : 0;
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full shrink-0" style={{ backgroundColor: color, opacity: 0.8 }} />
                        <span className="text-sm flex-1">{name}</span>
                        <ProgressStat pct={pct} count={b.count} color={color} />
                      </div>
                    );
                  })}
                </div>
              ) : <p className="text-sm text-muted-foreground">No data yet</p>}
            </Card>

            <Card className="p-6">
              <h3 className="font-medium mb-4 flex items-center gap-2"><Link2 className="h-4 w-4 text-primary" />Top Referrers</h3>
              {data.referrers.length > 0 ? (
                <div className="space-y-2.5">
                  {data.referrers.map((r: any, i: number) => {
                    const pct = data.clickCount > 0 ? Math.round((r.count / data.clickCount) * 100) : 0;
                    const hostname = (() => { try { return new URL(r.value).hostname; } catch { return r.value || "Direct"; } })();
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-sm flex-1 truncate">{hostname}</span>
                        <ProgressStat pct={pct} count={r.count} />
                      </div>
                    );
                  })}
                </div>
              ) : <p className="text-sm text-muted-foreground">No data yet</p>}
            </Card>
          </div>
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Link</DialogTitle>
            <DialogDescription>Update the link details. The short code cannot be changed.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Destination URL</Label>
              <Input value={editDest} onChange={e => setEditDest(e.target.value)} type="url" required />
              <p className="text-xs text-muted-foreground">Changing the URL preserves all click history</p>
            </div>
            <div className="space-y-2"><Label>Title</Label><Input value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Optional title" /></div>
            <div className="space-y-2"><Label>Tags</Label><TagInput value={editTags} onChange={setEditTags} placeholder="Add tags..." /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">UTM Source</Label><Input value={editUtmSource} onChange={e => setEditUtmSource(e.target.value)} className="h-9 text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-xs">UTM Medium</Label><Input value={editUtmMedium} onChange={e => setEditUtmMedium(e.target.value)} className="h-9 text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-xs">UTM Campaign</Label><Input value={editUtmCampaign} onChange={e => setEditUtmCampaign(e.target.value)} className="h-9 text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-xs">UTM Term</Label><Input value={editUtmTerm} onChange={e => setEditUtmTerm(e.target.value)} className="h-9 text-sm" /></div>
              <div className="space-y-1.5 col-span-2"><Label className="text-xs">UTM Content</Label><Input value={editUtmContent} onChange={e => setEditUtmContent(e.target.value)} className="h-9 text-sm" /></div>
            </div>
            <Button type="submit" className="w-full" disabled={updateLink.isPending || !editDest}>{updateLink.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Save Changes</Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Link</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete this link and all its click history. The short code will be retired and never reused.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteLink.mutate({ id: linkId })} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete Link</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {data?.link && <QrCodeDialog open={qrOpen} onOpenChange={setQrOpen} url={shortUrl} title={data.link.shortCode} />}
    </AppShell>
  );
}

function ProgressStat({ pct, count, color }: { pct: number; count: number; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%`, ...(color ? { backgroundColor: color } : {}) }} />
      </div>
      <span className="text-sm font-medium tabular-nums w-8 text-right">{count}</span>
    </div>
  );
}

function StatsList({ rows, total, icon, label, capitalize }: { rows: any[]; total: number; icon?: (value: string) => string; label?: (value: string) => string; capitalize?: boolean }) {
  return (
    <div className="space-y-2.5">
      {rows.map((row: any, i: number) => {
        const value = row.value || "Unknown";
        const pct = total > 0 ? Math.round((row.count / total) * 100) : 0;
        return (
          <div key={i} className="flex items-center gap-2">
            {icon && <span className="text-lg leading-none">{icon(value)}</span>}
            <span className={`text-sm flex-1 ${capitalize ? "capitalize" : ""}`}>{label ? label(value) : value}</span>
            <ProgressStat pct={pct} count={row.count} />
          </div>
        );
      })}
    </div>
  );
}
