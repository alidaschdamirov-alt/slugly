import { useAuth } from "@/_core/hooks/useAuth";
import AppShell from "@/components/AppShell";
import { QrCodeDialog } from "@/components/QrCodeDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  BarChart3,
  Check,
  Copy,
  ExternalLink,
  Globe2,
  Loader2,
  Pencil,
  Plus,
  QrCode,
  Route,
  Save,
  Smartphone,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";

type CustomDomain = { id: number; hostname: string; verified: boolean };

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}

export default function PageEditorPage() {
  const { user, loading: authLoading } = useAuth();
  const params = useParams();
  const pageId = Number(params.id || 0);
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [days, setDays] = useState(30);

  const { data: workspaceState } = trpc.workspace.current.useQuery(undefined, { enabled: !!user });
  const workspaceId = workspaceState?.workspace?.id;
  const { data: page, isLoading } = trpc.pages.get.useQuery({ id: pageId }, { enabled: !!user && pageId > 0 });
  const { data: analytics } = trpc.pages.analytics.useQuery({ id: pageId, days }, { enabled: !!user && pageId > 0 });
  const [customDomains, setCustomDomains] = useState<CustomDomain[]>([]);

  const [title, setTitle] = useState("");
  const [headline, setHeadline] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [accentColor, setAccentColor] = useState("#5A3FF0");
  const [backgroundColor, setBackgroundColor] = useState("#F7F7FC");
  const [textColor, setTextColor] = useState("#14152B");
  const [buttonStyle, setButtonStyle] = useState<"rounded" | "pill" | "square">("rounded");
  const [domainId, setDomainId] = useState("slugly");

  const [buttonOpen, setButtonOpen] = useState(false);
  const [editingButtonId, setEditingButtonId] = useState<number | null>(null);
  const [buttonLabel, setButtonLabel] = useState("");
  const [buttonSubtitle, setButtonSubtitle] = useState("");
  const [buttonUrl, setButtonUrl] = useState("");
  const [buttonVariant, setButtonVariant] = useState<"primary" | "secondary" | "outline">("primary");

  const [qrOpen, setQrOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!page) return;
    setTitle(page.title || "");
    setHeadline(page.headline || "");
    setDescription(page.description || "");
    setSlug(page.slug || "");
    setAvatarUrl(page.avatarUrl || "");
    setHeroImageUrl(page.heroImageUrl || "");
    setAccentColor(page.accentColor || "#5A3FF0");
    setBackgroundColor(page.backgroundColor || "#F7F7FC");
    setTextColor(page.textColor || "#14152B");
    setButtonStyle(page.buttonStyle || "rounded");
    setDomainId(page.domainId ? String(page.domainId) : "slugly");
  }, [page]);

  useEffect(() => {
    if (!user || !workspaceId) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/custom-domains", {
          headers: { "x-workspace-id": String(workspaceId) },
          credentials: "same-origin",
        });
        if (!response.ok) return;
        const body = await response.json();
        if (!cancelled) setCustomDomains((body?.domains || []).filter((domain: CustomDomain) => domain.verified));
      } catch {
        // Optional.
      }
    })();
    return () => { cancelled = true; };
  }, [user, workspaceId]);

  const updateMutation = trpc.pages.update.useMutation({
    onSuccess: () => {
      toast.success("Page saved");
      utils.pages.get.invalidate({ id: pageId });
      utils.pages.list.invalidate();
    },
    onError: error => toast.error(error.message || "Could not save Page"),
  });

  const addButtonMutation = trpc.pages.addButton.useMutation({
    onSuccess: () => {
      toast.success("CTA added and connected to Slugly");
      setButtonOpen(false);
      resetButtonForm();
      utils.pages.get.invalidate({ id: pageId });
      utils.pages.analytics.invalidate({ id: pageId, days });
      utils.workspace.current.invalidate();
    },
    onError: error => toast.error(error.message || "Could not add CTA"),
  });

  const updateButtonMutation = trpc.pages.updateButton.useMutation({
    onSuccess: () => {
      toast.success("CTA updated");
      setButtonOpen(false);
      resetButtonForm();
      utils.pages.get.invalidate({ id: pageId });
      utils.pages.analytics.invalidate({ id: pageId, days });
    },
    onError: error => toast.error(error.message || "Could not update CTA"),
  });

  const deleteButtonMutation = trpc.pages.deleteButton.useMutation({
    onSuccess: () => {
      toast.success("CTA removed");
      utils.pages.get.invalidate({ id: pageId });
      utils.pages.analytics.invalidate({ id: pageId, days });
    },
    onError: error => toast.error(error.message || "Could not remove CTA"),
  });

  function resetButtonForm() {
    setEditingButtonId(null);
    setButtonLabel("");
    setButtonSubtitle("");
    setButtonUrl("");
    setButtonVariant("primary");
  }

  const savePage = (status?: "draft" | "published") => {
    if (!title.trim()) return toast.error("Title is required");
    if (slug.length < 3 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug)) {
      return toast.error("Slug must use lowercase letters, numbers and hyphens.");
    }
    updateMutation.mutate({
      id: pageId,
      title: title.trim(),
      headline: headline.trim() || null,
      description: description.trim() || null,
      slug,
      avatarUrl: avatarUrl.trim() || null,
      heroImageUrl: heroImageUrl.trim() || null,
      accentColor,
      backgroundColor,
      textColor,
      buttonStyle,
      domainId: domainId === "slugly" ? null : Number(domainId),
      status,
    });
  };

  const editButton = (button: any) => {
    setEditingButtonId(button.id);
    setButtonLabel(button.label);
    setButtonSubtitle(button.subtitle || "");
    setButtonUrl(button.destinationUrl || "");
    setButtonVariant(button.style || "primary");
    setButtonOpen(true);
  };

  const submitButton = () => {
    if (!buttonLabel.trim()) return toast.error("CTA label is required");
    try {
      new URL(buttonUrl);
    } catch {
      return toast.error("Enter a valid destination URL");
    }
    if (editingButtonId) {
      updateButtonMutation.mutate({
        id: editingButtonId,
        pageId,
        label: buttonLabel.trim(),
        subtitle: buttonSubtitle.trim() || null,
        destinationUrl: buttonUrl,
        style: buttonVariant,
      });
    } else {
      addButtonMutation.mutate({
        pageId,
        label: buttonLabel.trim(),
        subtitle: buttonSubtitle.trim() || undefined,
        destinationUrl: buttonUrl,
        style: buttonVariant,
      });
    }
  };

  const previewDomain = customDomains.find(domain => String(domain.id) === domainId);
  const currentPublicUrl = previewDomain
    ? `https://${previewDomain.hostname}/`
    : `https://slugly.io/${page?.type === "bio" ? "bio" : "page"}/${slug || "your-page"}`;

  const radiusClass = buttonStyle === "pill" ? "rounded-full" : buttonStyle === "square" ? "rounded-md" : "rounded-2xl";

  const buttonClickMap = useMemo(() => {
    const map = new Map<number, any>();
    for (const stat of analytics?.buttons || []) map.set(stat.id, stat);
    return map;
  }, [analytics]);

  const copyPublicUrl = async () => {
    await navigator.clipboard.writeText(page?.publicUrl || currentPublicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (authLoading || isLoading) {
    return <AppShell><div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></AppShell>;
  }
  if (!user) {
    window.location.href = getLoginUrl();
    return null;
  }
  if (!page) {
    return <AppShell><Card className="p-8 text-center">Page not found.</Card></AppShell>;
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/pages")}><ArrowLeft className="h-4 w-4" /></Button>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold">{page.title}</h1>
                <Badge variant={page.status === "published" ? "default" : "secondary"}>{page.status}</Badge>
                <Badge variant="outline">{page.type === "bio" ? "Link-in-bio" : "Landing Page"}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{page.publicUrl}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={copyPublicUrl}>{copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}Copy URL</Button>
            <Button variant="outline" onClick={() => setQrOpen(true)}><QrCode className="mr-2 h-4 w-4" />QR</Button>
            {page.status === "published" && <Button variant="outline" asChild><a href={page.publicUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Open</a></Button>}
            <Button variant="outline" onClick={() => savePage()} disabled={updateMutation.isPending}><Save className="mr-2 h-4 w-4" />Save</Button>
            <Button onClick={() => savePage(page.status === "published" ? "draft" : "published")} disabled={updateMutation.isPending}>
              {page.status === "published" ? "Unpublish" : "Publish"}
            </Button>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <div className="space-y-5">
            <Card className="p-5">
              <h2 className="font-semibold">Page content & design</h2>
              <p className="mt-1 text-xs text-muted-foreground">Edit the public experience. Preview updates immediately; Save publishes the configuration to Slugly.</p>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Title *</Label>
                  <Input value={title} onChange={e => setTitle(e.target.value)} />
                </div>
                <div>
                  <Label>Public slug</Label>
                  <Input value={slug} onChange={e => setSlug(slugify(e.target.value))} />
                </div>
                <div className="sm:col-span-2">
                  <Label>{page.type === "bio" ? "Display headline" : "Hero headline"}</Label>
                  <Input value={headline} onChange={e => setHeadline(e.target.value)} placeholder={page.type === "bio" ? "Creator, marketer, founder…" : "A clear headline for your campaign"} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Description</Label>
                  <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="Tell visitors what this page is about…" />
                </div>

                {page.type === "bio" ? (
                  <div className="sm:col-span-2">
                    <Label>Avatar / logo URL</Label>
                    <Input value={avatarUrl} onChange={e => setAvatarUrl(e.target.value)} placeholder="https://..." />
                  </div>
                ) : (
                  <div className="sm:col-span-2">
                    <Label>Hero image URL</Label>
                    <Input value={heroImageUrl} onChange={e => setHeroImageUrl(e.target.value)} placeholder="https://..." />
                  </div>
                )}

                <div>
                  <Label>Resolver domain</Label>
                  <Select value={domainId} onValueChange={setDomainId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="slugly">slugly.io</SelectItem>
                      {customDomains.map(domain => <SelectItem key={domain.id} value={String(domain.id)}>{domain.hostname} · root page</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Button shape</Label>
                  <Select value={buttonStyle} onValueChange={value => setButtonStyle(value as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rounded">Rounded</SelectItem>
                      <SelectItem value="pill">Pill</SelectItem>
                      <SelectItem value="square">Square</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Accent</Label>
                  <div className="flex gap-2"><Input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)} className="w-14 p-1" /><Input value={accentColor} onChange={e => setAccentColor(e.target.value)} /></div>
                </div>
                <div>
                  <Label>Background</Label>
                  <div className="flex gap-2"><Input type="color" value={backgroundColor} onChange={e => setBackgroundColor(e.target.value)} className="w-14 p-1" /><Input value={backgroundColor} onChange={e => setBackgroundColor(e.target.value)} /></div>
                </div>
                <div>
                  <Label>Text</Label>
                  <div className="flex gap-2"><Input type="color" value={textColor} onChange={e => setTextColor(e.target.value)} className="w-14 p-1" /><Input value={textColor} onChange={e => setTextColor(e.target.value)} /></div>
                </div>
                <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
                  <Globe2 className="mb-1 h-4 w-4 text-primary" />
                  {previewDomain ? <>Page root: <strong>{previewDomain.hostname}</strong>. CTA links use the same branded short domain.</> : <>Public path: <strong>/{page.type === "bio" ? "bio" : "page"}/{slug}</strong>. CTA links use slugly.io/r/…</>}
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">CTA buttons</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Every button creates a dedicated Slugly short link. That is what connects Pages to Routing, A/B, Mobile Deep Links and link-level analytics.</p>
                </div>
                <Button onClick={() => { resetButtonForm(); setButtonOpen(true); }}><Plus className="mr-2 h-4 w-4" />Add CTA</Button>
              </div>

              <div className="mt-4 space-y-2">
                {page.buttons.length > 0 ? page.buttons.map((button: any) => {
                  const stat = buttonClickMap.get(button.id);
                  return (
                    <div key={button.id} className="rounded-lg border p-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{button.label}</p>
                            <Badge variant="outline" className="text-[10px]">{button.style}</Badge>
                            {!button.enabled && <Badge variant="secondary" className="text-[10px]">disabled</Badge>}
                          </div>
                          {button.subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{button.subtitle}</p>}
                          <p className="mt-1 truncate text-[11px] text-muted-foreground">{button.destinationUrl}</p>
                          <p className="mt-1 text-[11px] text-muted-foreground">{stat?.totalClicks || 0} clicks · {stat?.uniqueClicks || 0} unique · {button.shortUrl}</p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <div className="flex items-center gap-2 rounded-md border px-2">
                            <Switch checked={button.enabled} onCheckedChange={checked => updateButtonMutation.mutate({ id: button.id, pageId, enabled: checked })} />
                            <span className="text-[11px] text-muted-foreground">Active</span>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => setLocation(`/link/${button.linkId}/rules`)}><Route className="mr-1.5 h-3.5 w-3.5" />Routing</Button>
                          <Button variant="outline" size="sm" onClick={() => setLocation(`/link/${button.linkId}/analytics`)}><BarChart3 className="mr-1.5 h-3.5 w-3.5" />Analytics</Button>
                          <Button variant="ghost" size="icon" onClick={() => editButton(button)}><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => {
                            if (window.confirm(`Remove CTA "${button.label}"?`)) deleteButtonMutation.mutate({ id: button.id, pageId });
                          }}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Add your first CTA. Slugly will create and track its short link automatically.</div>
                )}
              </div>
            </Card>

            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Page Analytics</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Page views plus all connected CTA clicks.</p>
                </div>
                <div className="flex gap-1">
                  {[7, 30, 90].map(option => <Button key={option} size="sm" variant={days === option ? "default" : "outline"} onClick={() => setDays(option)}>{option}d</Button>)}
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Views</p><p className="mt-1 text-2xl font-semibold">{analytics?.views?.toLocaleString() || 0}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Unique views</p><p className="mt-1 text-2xl font-semibold">{analytics?.uniqueViews?.toLocaleString() || 0}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">CTA clicks</p><p className="mt-1 text-2xl font-semibold">{analytics?.totalClicks?.toLocaleString() || 0}</p></div>
                <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Page CTR</p><p className="mt-1 text-2xl font-semibold">{analytics?.ctr || 0}%</p></div>
              </div>
              {(analytics?.countries?.length || analytics?.devices?.length) ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border p-3"><p className="text-xs font-medium">Top countries</p><p className="mt-2 text-xs text-muted-foreground">{(analytics?.countries || []).map((item: any) => `${item.value}: ${item.count}`).join(" · ") || "—"}</p></div>
                  <div className="rounded-lg border p-3"><p className="text-xs font-medium">Devices</p><p className="mt-2 text-xs text-muted-foreground">{(analytics?.devices || []).map((item: any) => `${item.value}: ${item.count}`).join(" · ") || "—"}</p></div>
                </div>
              ) : null}
            </Card>
          </div>

          <div className="xl:sticky xl:top-[86px] xl:self-start">
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <div><p className="text-sm font-semibold">Live preview</p><p className="text-[11px] text-muted-foreground">{currentPublicUrl}</p></div>
                <Smartphone className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mx-auto max-w-[390px] overflow-hidden rounded-[30px] border shadow-sm" style={{ backgroundColor, color: textColor }}>
                <div className="min-h-[650px] p-5">
                  {page.type === "landing" && heroImageUrl && <img src={heroImageUrl} alt="" className="mb-6 h-48 w-full rounded-2xl object-cover" />}
                  <div className={page.type === "bio" ? "pt-8 text-center" : "pt-6"}>
                    {page.type === "bio" && (
                      avatarUrl ? <img src={avatarUrl} alt="" className="mx-auto h-20 w-20 rounded-full object-cover shadow" /> :
                      <div className="mx-auto grid h-20 w-20 place-items-center rounded-full text-2xl font-bold text-white" style={{ backgroundColor: accentColor }}>{title.slice(0,1).toUpperCase()}</div>
                    )}
                    <p className={`${page.type === "bio" ? "mt-5 text-2xl" : "text-3xl"} font-bold tracking-tight`}>{headline || title || "Your headline"}</p>
                    {description && <p className="mt-3 whitespace-pre-line text-sm leading-6 opacity-70">{description}</p>}
                    <div className="mt-6 space-y-2.5">
                      {page.buttons.filter((button: any) => button.enabled).map((button: any) => (
                        <div
                          key={button.id}
                          className={`flex items-center justify-between border px-4 py-3 text-left ${radiusClass}`}
                          style={button.style === "primary" ? { backgroundColor: accentColor, color: "#fff", borderColor: accentColor } : button.style === "secondary" ? { backgroundColor: "rgba(255,255,255,.7)", borderColor: "rgba(0,0,0,.08)" } : { backgroundColor: "transparent", borderColor: textColor }}
                        >
                          <div><p className="text-sm font-semibold">{button.label}</p>{button.subtitle && <p className="mt-0.5 text-[10px] opacity-65">{button.subtitle}</p>}</div>
                          <span>↗</span>
                        </div>
                      ))}
                      {page.buttons.length === 0 && <div className={`border border-dashed p-4 text-xs opacity-50 ${radiusClass}`}>Your CTA buttons will appear here.</div>}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={buttonOpen} onOpenChange={open => { setButtonOpen(open); if (!open) resetButtonForm(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingButtonId ? "Edit CTA" : "Add CTA"}</DialogTitle>
            <DialogDescription>
              This CTA is backed by its own Slugly short link, so you can add Routing, A/B tests and Deep Links after saving.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Label *</Label><Input value={buttonLabel} onChange={e => setButtonLabel(e.target.value)} placeholder="Visit our website" /></div>
            <div><Label>Subtitle</Label><Input value={buttonSubtitle} onChange={e => setButtonSubtitle(e.target.value)} placeholder="Optional supporting text" /></div>
            <div><Label>Destination URL *</Label><Input value={buttonUrl} onChange={e => setButtonUrl(e.target.value)} placeholder="https://example.com" /></div>
            <div>
              <Label>Style</Label>
              <Select value={buttonVariant} onValueChange={value => setButtonVariant(value as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary">Primary</SelectItem>
                  <SelectItem value="secondary">Secondary</SelectItem>
                  <SelectItem value="outline">Outline</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={submitButton} disabled={addButtonMutation.isPending || updateButtonMutation.isPending}>
              {(addButtonMutation.isPending || updateButtonMutation.isPending) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              {editingButtonId ? "Save CTA" : "Add connected CTA"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <QrCodeDialog open={qrOpen} onOpenChange={setQrOpen} url={page.publicUrl} title={page.title} />
    </AppShell>
  );
}
