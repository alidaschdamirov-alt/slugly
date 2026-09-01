import { useAuth } from "@/_core/hooks/useAuth";
import AppShell from "@/components/AppShell";
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
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import {
  ExternalLink,
  FileText,
  Globe2,
  LayoutTemplate,
  Link2,
  Loader2,
  Plus,
  Smartphone,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type CustomDomain = { id: number; hostname: string; verified: boolean };

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export default function PagesPage() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: workspaceState } = trpc.workspace.current.useQuery(undefined, { enabled: !!user });
  const { data: pages, isLoading } = trpc.pages.list.useQuery(undefined, { enabled: !!user });
  const workspaceId = workspaceState?.workspace?.id;

  const [createOpen, setCreateOpen] = useState(false);
  const [type, setType] = useState<"bio" | "landing">("bio");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [domainId, setDomainId] = useState("slugly");
  const [customDomains, setCustomDomains] = useState<CustomDomain[]>([]);

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
        // Custom domains are optional.
      }
    })();
    return () => { cancelled = true; };
  }, [user, workspaceId]);

  const createMutation = trpc.pages.create.useMutation({
    onSuccess: data => {
      toast.success(type === "bio" ? "Bio Page created" : "Landing Page created");
      setCreateOpen(false);
      utils.pages.list.invalidate();
      setLocation(`/pages/${data.id}`);
    },
    onError: error => toast.error(error.message || "Could not create Page"),
  });

  const deleteMutation = trpc.pages.delete.useMutation({
    onSuccess: () => {
      toast.success("Page removed");
      utils.pages.list.invalidate();
    },
    onError: error => toast.error(error.message || "Could not remove Page"),
  });

  const startCreate = (nextType: "bio" | "landing") => {
    setType(nextType);
    setTitle("");
    setSlug("");
    setSlugTouched(false);
    setDomainId("slugly");
    setCreateOpen(true);
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (!slugTouched) setSlug(slugify(value));
  };

  const handleCreate = () => {
    if (!title.trim()) return toast.error("Page title is required");
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug) || slug.length < 3) {
      return toast.error("Slug must be at least 3 characters and use lowercase letters, numbers, and hyphens.");
    }
    createMutation.mutate({
      type,
      title: title.trim(),
      slug,
      domainId: domainId === "slugly" ? null : Number(domainId),
    });
  };

  if (authLoading) {
    return <AppShell><div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></AppShell>;
  }
  if (!user) {
    window.location.href = getLoginUrl();
    return null;
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <div className="rounded-lg bg-primary/10 p-2"><LayoutTemplate className="h-5 w-5 text-primary" /></div>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Product</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">Pages</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Build Link-in-bio profiles and lightweight landing pages. Every CTA is a real Slugly link, so Routing, A/B testing, Mobile Deep Links, QR Codes and Analytics stay connected.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setLocation("/domains")}><Globe2 className="mr-2 h-4 w-4" />Domains</Button>
            <Button onClick={() => startCreate("bio")}><Plus className="mr-2 h-4 w-4" />Create Page</Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="overflow-hidden">
            <div className="grid min-h-[240px] gap-5 p-6 sm:grid-cols-[1fr_150px]">
              <div>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10"><Smartphone className="h-5 w-5 text-primary" /></div>
                <h2 className="text-xl font-semibold">Link-in-bio</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Profile, avatar, bio and tracked buttons for Instagram, TikTok, LinkedIn, creators and personal brands.</p>
                <Button className="mt-5" variant="outline" onClick={() => startCreate("bio")}>Create Bio Page</Button>
              </div>
              <div className="rounded-[28px] border bg-muted/30 p-3 shadow-sm">
                <div className="mx-auto mt-3 h-12 w-12 rounded-full bg-primary/20" />
                <div className="mx-auto mt-3 h-2 w-20 rounded bg-foreground/20" />
                <div className="mt-5 space-y-2">
                  <div className="h-9 rounded-full bg-primary" />
                  <div className="h-9 rounded-full border bg-background" />
                  <div className="h-9 rounded-full border bg-background" />
                </div>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="grid min-h-[240px] gap-5 p-6 sm:grid-cols-[1fr_170px]">
              <div>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10"><FileText className="h-5 w-5 text-primary" /></div>
                <h2 className="text-xl font-semibold">Landing Page</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">A focused campaign page with hero, headline, copy and CTAs connected to Slugly routing and campaign analytics.</p>
                <Button className="mt-5" variant="outline" onClick={() => startCreate("landing")}>Create Landing Page</Button>
              </div>
              <div className="rounded-2xl border bg-muted/30 p-3 shadow-sm">
                <div className="h-20 rounded-xl bg-primary/15" />
                <div className="mt-3 h-3 w-3/4 rounded bg-foreground/20" />
                <div className="mt-2 h-2 w-full rounded bg-foreground/10" />
                <div className="mt-1 h-2 w-4/5 rounded bg-foreground/10" />
                <div className="mt-4 h-9 rounded-xl bg-primary" />
              </div>
            </div>
          </Card>
        </div>

        <section>
          <div className="mb-3">
            <h2 className="text-lg font-semibold">Your Pages</h2>
            <p className="text-xs text-muted-foreground">Published and draft experiences in this workspace.</p>
          </div>
          {isLoading ? (
            <Card className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></Card>
          ) : pages && pages.length > 0 ? (
            <div className="grid gap-3">
              {pages.map((page: any) => (
                <Card key={page.id} className="p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">{page.type === "bio" ? "Bio" : "Landing"}</span>
                        <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${page.status === "published" ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" : "bg-muted text-muted-foreground"}`}>{page.status}</span>
                        <p className="font-semibold">{page.title}</p>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{page.publicUrl}</p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                        <span>{page.buttonCount} CTAs</span>
                        <span>{page.domainHostname || "slugly.io"}</span>
                        <span>/{page.slug}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {page.status === "published" && <Button variant="outline" size="sm" asChild><a href={page.publicUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Open</a></Button>}
                      <Button size="sm" onClick={() => setLocation(`/pages/${page.id}`)}><Link2 className="mr-1.5 h-3.5 w-3.5" />Manage</Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => {
                        if (window.confirm(`Delete ${page.title}? Its Page buttons will be paused.`)) deleteMutation.mutate({ id: page.id });
                      }}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="flex flex-col items-center justify-center py-12 text-center">
              <LayoutTemplate className="mb-3 h-9 w-9 text-muted-foreground" />
              <p className="font-medium">No Pages yet</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">Create a Link-in-bio or Landing Page and connect every CTA to Slugly.</p>
            </Card>
          )}
        </section>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create {type === "bio" ? "Link-in-bio" : "Landing Page"}</DialogTitle>
            <DialogDescription>Start with the identity and public URL. You can design, add CTAs and publish next.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Page title</Label>
              <Input value={title} onChange={e => handleTitleChange(e.target.value)} placeholder={type === "bio" ? "Ali Dashdamirov" : "Summer Campaign"} />
            </div>
            <div>
              <Label>Slug</Label>
              <div className="flex items-center rounded-md border bg-muted/20 pl-3">
                <span className="text-xs text-muted-foreground">slugly.io/{type === "bio" ? "bio" : "page"}/</span>
                <Input value={slug} onChange={e => { setSlug(slugify(e.target.value)); setSlugTouched(true); }} className="border-0 bg-transparent shadow-none focus-visible:ring-0" placeholder="your-page" />
              </div>
            </div>
            <div>
              <Label>Custom domain (optional)</Label>
              <Select value={domainId} onValueChange={setDomainId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="slugly">Use slugly.io</SelectItem>
                  {customDomains.map(domain => <SelectItem key={domain.id} value={String(domain.id)}>{domain.hostname} · root page</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">With a custom domain the Page opens at the domain root, e.g. https://links.brand.com/.</p>
            </div>
            <Button className="w-full" onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Create and customize
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
