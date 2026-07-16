import { useAuth } from "@/_core/hooks/useAuth";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { ArrowLeft, Loader2, Zap, Copy, Check } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const CHANNELS = [
  { id: "facebook", label: "Facebook", source: "facebook", medium: "social" },
  { id: "instagram", label: "Instagram", source: "instagram", medium: "social" },
  { id: "x", label: "X (Twitter)", source: "x", medium: "social" },
  { id: "linkedin", label: "LinkedIn", source: "linkedin", medium: "social" },
  { id: "telegram", label: "Telegram", source: "telegram", medium: "social" },
  { id: "email", label: "Email", source: "email", medium: "email" },
  { id: "youtube", label: "YouTube", source: "youtube", medium: "video" },
  { id: "tiktok", label: "TikTok", source: "tiktok", medium: "social" },
];

export default function BulkCreate() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<"channels" | "urls">("channels");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [campaign, setCampaign] = useState("");
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [bulkUrls, setBulkUrls] = useState("");
  const [projectId, setProjectId] = useState("");
  const [createdLinks, setCreatedLinks] = useState<any[] | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const { data: projects } = trpc.project.list.useQuery(undefined, { enabled: !!user });
  const utils = trpc.useUtils();
  const createBulk = trpc.link.createBulk.useMutation({
    onSuccess: (data) => {
      setCreatedLinks(data);
      utils.link.list.invalidate();
      utils.tag.list.invalidate();
      toast.success(`${data.length} links created!`);
    },
    onError: (err) => toast.error(err.message),
  });

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!user) { window.location.href = getLoginUrl(); return null; }

  const handleChannelSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!destinationUrl || selectedChannels.length === 0) return;
    const links = selectedChannels.map(channelId => {
      const channel = CHANNELS.find(c => c.id === channelId)!;
      return {
        destinationUrl,
        title: `${campaign || "Campaign"} - ${channel.label}`,
        utmSource: channel.source,
        utmMedium: channel.medium,
        utmCampaign: campaign || undefined,
      };
    });
    createBulk.mutate({ projectId: projectId ? parseInt(projectId) : undefined, links });
  };

  const handleUrlsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const urls = bulkUrls.split("\n").map(u => u.trim()).filter(u => u.length > 0);
    if (urls.length === 0) return;
    const links = urls.map(url => ({ destinationUrl: url }));
    createBulk.mutate({ projectId: projectId ? parseInt(projectId) : undefined, links });
  };

  const copyLink = (shortCode: string, idx: number) => {
    navigator.clipboard.writeText(`${window.location.origin}/r/${shortCode}`);
    setCopiedIdx(idx);
    toast.success("Copied!");
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  return (
    <AppShell>
      <button onClick={() => setLocation("/create")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
        <ArrowLeft className="h-4 w-4" />
        Back to Single Create
      </button>

      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold tracking-tight mb-6">Bulk Create Links</h1>

        {createdLinks ? (
          <Card className="p-6">
            <h2 className="font-semibold mb-4">{createdLinks.length} Links Created</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {createdLinks.map((link, idx) => (
                <div key={link.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
                  <div className="min-w-0 flex-1">
                    <code className="text-xs font-mono">/r/{link.shortCode}</code>
                    {link.utmSource && <span className="text-xs text-muted-foreground ml-2">({link.utmSource})</span>}
                  </div>
                  <button onClick={() => copyLink(link.shortCode, idx)} className="p-1.5 hover:bg-muted rounded transition-colors">
                    {copiedIdx === idx ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-4">
              <Button variant="outline" onClick={() => { setCreatedLinks(null); setSelectedChannels([]); setBulkUrls(""); }}>Create More</Button>
              <Button onClick={() => setLocation(projectId ? `/project/${projectId}` : "/dashboard")}>View Links</Button>
            </div>
          </Card>
        ) : (
          <>
            {/* Mode toggle */}
            <div className="flex items-center gap-2 mb-6">
              <Button variant={mode === "channels" ? "default" : "outline"} size="sm" onClick={() => setMode("channels")}>
                <Zap className="h-4 w-4 mr-1.5" />
                By Channels
              </Button>
              <Button variant={mode === "urls" ? "default" : "outline"} size="sm" onClick={() => setMode("urls")}>
                Multiple URLs
              </Button>
            </div>

            <Card className="p-6">
              {mode === "channels" ? (
                <form onSubmit={handleChannelSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <Label>Destination URL *</Label>
                    <Input value={destinationUrl} onChange={e => setDestinationUrl(e.target.value)} placeholder="https://example.com/landing" type="url" required />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Campaign Name</Label>
                      <Input value={campaign} onChange={e => setCampaign(e.target.value)} placeholder="black_friday" />
                    </div>
                    <div className="space-y-2">
                      <Label>Project</Label>
                      <Select value={projectId} onValueChange={setProjectId}>
                        <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                        <SelectContent>
                          {projects?.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Select Channels *</Label>
                    <p className="text-xs text-muted-foreground">One short link will be created per channel with auto-generated UTM parameters</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                      {CHANNELS.map(channel => (
                        <label key={channel.id} className="flex items-center gap-2 p-2 rounded-md border hover:bg-muted/50 transition-colors cursor-pointer">
                          <Checkbox
                            checked={selectedChannels.includes(channel.id)}
                            onCheckedChange={(checked) => {
                              setSelectedChannels(prev =>
                                checked ? [...prev, channel.id] : prev.filter(c => c !== channel.id)
                              );
                            }}
                          />
                          <span className="text-sm">{channel.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={createBulk.isPending || !destinationUrl || selectedChannels.length === 0}>
                    {createBulk.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Create {selectedChannels.length} Links
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleUrlsSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <Label>Paste URLs (one per line) *</Label>
                    <Textarea
                      value={bulkUrls}
                      onChange={e => setBulkUrls(e.target.value)}
                      placeholder={"https://example.com/page-1\nhttps://example.com/page-2\nhttps://example.com/page-3"}
                      rows={6}
                    />
                    <p className="text-xs text-muted-foreground">{bulkUrls.split("\n").filter(u => u.trim()).length} URLs detected</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Project</Label>
                    <Select value={projectId} onValueChange={setProjectId}>
                      <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                      <SelectContent>
                        {projects?.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full" disabled={createBulk.isPending || !bulkUrls.trim()}>
                    {createBulk.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Create Links
                  </Button>
                </form>
              )}
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
