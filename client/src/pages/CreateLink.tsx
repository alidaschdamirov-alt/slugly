import { useAuth } from "@/_core/hooks/useAuth";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { trackEvent } from "@/lib/analytics";
import { ArrowLeft, Link2, Loader2, ChevronDown, ChevronUp, Copy, Check, Calendar, BarChart3 } from "lucide-react";
import { useState } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import TagInput from "@/components/TagInput";
import { UpsellDialog, parseLimitError } from "@/components/UpsellDialog";

export default function CreateLink() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const preselectedProject = params.get("project");

  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [projectId, setProjectId] = useState(preselectedProject || "");
  const [showUtm, setShowUtm] = useState(false);
  const [utmSource, setUtmSource] = useState("");
  const [utmMedium, setUtmMedium] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [utmTerm, setUtmTerm] = useState("");
  const [utmContent, setUtmContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [activeFrom, setActiveFrom] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [showScheduling, setShowScheduling] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [createdLinkId, setCreatedLinkId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [upsellError, setUpsellError] = useState<any>(null);
  const [upsellOpen, setUpsellOpen] = useState(false);

  const { data: projects } = trpc.project.list.useQuery(undefined, { enabled: !!user });
  const utils = trpc.useUtils();
  const createLink = trpc.link.create.useMutation({
    onSuccess: (data) => {
      setCreatedCode(data.shortCode);
      setCreatedLinkId(data.id);
      utils.link.list.invalidate();
      utils.tag.list.invalidate();
      utils.billing.status.invalidate();
      toast.success("Link created!");
      trackEvent("link_created", { shortCode: data.shortCode });
    },
    onError: (err) => {
      const limitErr = parseLimitError(err.message);
      if (limitErr) {
        setUpsellError(limitErr);
        setUpsellOpen(true);
      } else {
        toast.error(err.message);
      }
    },
  });

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!user) { window.location.href = getLoginUrl(); return null; }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createLink.mutate({
      destinationUrl: url,
      title: title || undefined,
      projectId: projectId ? parseInt(projectId) : undefined,
      customCode: customCode || undefined,
      tags: tags.length > 0 ? tags : undefined,
      utmSource: utmSource || undefined,
      utmMedium: utmMedium || undefined,
      utmCampaign: utmCampaign || undefined,
      utmTerm: utmTerm || undefined,
      utmContent: utmContent || undefined,
      activeFrom: activeFrom ? new Date(activeFrom).getTime() : undefined,
      expiresAt: expiresAt ? new Date(expiresAt).getTime() : undefined,
    });
  };

  const copyCreatedLink = () => {
    if (createdCode) {
      navigator.clipboard.writeText(`${window.location.origin}/r/${createdCode}`);
      setCopied(true);
      toast.success("Copied!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const resetForm = () => {
    setUrl("");
    setTitle("");
    setCustomCode("");
    setTags([]);
    setActiveFrom("");
    setExpiresAt("");
    setShowScheduling(false);
    setUtmSource("");
    setUtmMedium("");
    setUtmCampaign("");
    setUtmTerm("");
    setUtmContent("");
    setCreatedCode(null);
  };

  return (
    <AppShell>
      <button onClick={() => setLocation("/dashboard")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Create Link</h1>
          <Button variant="outline" size="sm" onClick={() => setLocation("/create/bulk")}>
            Bulk Create
          </Button>
        </div>

        {createdCode ? (
          <Card className="p-8">
            <div className="text-center">
              <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
                <Check className="h-6 w-6 text-green-600" />
              </div>
              <h2 className="text-lg font-semibold mb-2">Link Created!</h2>
              <p className="text-sm text-muted-foreground mb-4">Your short link is ready to share</p>
              <div className="flex items-center justify-center gap-2 mb-6">
                <code className="text-sm bg-muted px-3 py-1.5 rounded-md font-mono">
                  {window.location.origin}/r/{createdCode}
                </code>
                <button onClick={copyCreatedLink} className="p-2 hover:bg-muted rounded-md transition-colors">
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Next steps guidance */}
            <div className="border rounded-lg p-4 bg-muted/30 mb-6">
              <h3 className="text-sm font-medium mb-3">What's next?</h3>
              <div className="space-y-2.5">
                <div className="flex items-start gap-3 text-sm">
                  <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0 mt-0.5">1</span>
                  <span className="text-muted-foreground"><strong className="text-foreground">Share your link</strong> — paste it in social media, emails, or anywhere you want to track clicks</span>
                </div>
                <div className="flex items-start gap-3 text-sm">
                  <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0 mt-0.5">2</span>
                  <span className="text-muted-foreground"><strong className="text-foreground">Watch clicks roll in</strong> — see real-time analytics: countries, devices, referrers</span>
                </div>
                <div className="flex items-start gap-3 text-sm">
                  <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0 mt-0.5">3</span>
                  <span className="text-muted-foreground"><strong className="text-foreground">Optimize</strong> — use UTM tags and A/B test destinations</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={resetForm}>Create Another</Button>
              {createdLinkId && (
                <Button variant="outline" onClick={() => setLocation(`/link/${createdLinkId}/analytics`)}>
                  <BarChart3 className="h-4 w-4 mr-1.5" />
                  View Analytics
                </Button>
              )}
              <Button onClick={() => setLocation(projectId ? `/project/${projectId}` : "/dashboard")}>
                View Links
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="p-6">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label>Destination URL *</Label>
                <Input
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://example.com/landing-page"
                  type="url"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Title (optional)</Label>
                  <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Black Friday Landing" />
                </div>
                <div className="space-y-2">
                  <Label>Project</Label>
                  <Select value={projectId} onValueChange={setProjectId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects?.map(p => (
                        <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Tags</Label>
                <TagInput value={tags} onChange={setTags} placeholder="Add tags (press Enter)" />
              </div>

              <div className="space-y-2">
                <Label>Custom Short Code (optional)</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">{window.location.host}/r/</span>
                  <Input
                    value={customCode}
                    onChange={e => setCustomCode(e.target.value)}
                    placeholder="my-link"
                    pattern="[a-zA-Z0-9_-]+"
                  />
                </div>
              </div>

              <Separator />

              {/* Scheduling */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowScheduling(!showScheduling)}
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showScheduling ? <ChevronUp className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
                  Schedule & Expiry
                </button>
                {showScheduling && (
                  <div className="mt-4 space-y-3 pl-2 border-l-2 border-primary/20">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Active From (optional)</Label>
                        <Input
                          type="datetime-local"
                          value={activeFrom}
                          onChange={e => setActiveFrom(e.target.value)}
                          className="h-9 text-sm"
                        />
                        <p className="text-xs text-muted-foreground">Link won't redirect until this date</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Expires At (optional)</Label>
                        <Input
                          type="datetime-local"
                          value={expiresAt}
                          onChange={e => setExpiresAt(e.target.value)}
                          className="h-9 text-sm"
                        />
                        <p className="text-xs text-muted-foreground">Link stops redirecting after this date</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              {/* UTM Builder */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowUtm(!showUtm)}
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showUtm ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  UTM Parameters
                </button>
                {showUtm && (
                  <div className="mt-4 space-y-3 pl-2 border-l-2 border-primary/20">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Source</Label>
                        <Input value={utmSource} onChange={e => setUtmSource(e.target.value)} placeholder="facebook, google, newsletter" className="h-9 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Medium</Label>
                        <Input value={utmMedium} onChange={e => setUtmMedium(e.target.value)} placeholder="cpc, email, social" className="h-9 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Campaign</Label>
                        <Input value={utmCampaign} onChange={e => setUtmCampaign(e.target.value)} placeholder="black_friday_2024" className="h-9 text-sm" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Term</Label>
                        <Input value={utmTerm} onChange={e => setUtmTerm(e.target.value)} placeholder="running+shoes" className="h-9 text-sm" />
                      </div>
                      <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-xs">Content</Label>
                        <Input value={utmContent} onChange={e => setUtmContent(e.target.value)} placeholder="banner_top, cta_button" className="h-9 text-sm" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={createLink.isPending || !url}>
                {createLink.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Link2 className="h-4 w-4 mr-2" />}
                Create Short Link
              </Button>
            </form>
          </Card>
        )}
      </div>
      <UpsellDialog error={upsellError} open={upsellOpen} onOpenChange={setUpsellOpen} />
    </AppShell>
  );
}
