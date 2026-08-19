import { useAuth } from "@/_core/hooks/useAuth";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { Search, QrCode, Loader2, LayoutGrid, List } from "lucide-react";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { QrCodeDialog } from "@/components/QrCodeDialog";

export default function QrCodesPage() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [selectedLink, setSelectedLink] = useState<{ shortCode: string; url: string; title?: string } | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  const { data: links, isLoading } = trpc.link.list.useQuery(undefined, { enabled: !!user });
  const { data: domains } = trpc.domain.list.useQuery(undefined, { enabled: !!user });

  const filteredLinks = useMemo(() => {
    if (!links) return [];
    if (!search) return links;
    const s = search.toLowerCase();
    return links.filter(l =>
      l.shortCode.toLowerCase().includes(s) ||
      l.destinationUrl.toLowerCase().includes(s) ||
      (l.title && l.title.toLowerCase().includes(s))
    );
  }, [links, search]);

  const getQrUrl = (link: any) => {
    if (link.domainId && domains) {
      const domain = domains.find((d: any) => d.id === link.domainId && d.verified);
      if (domain) return `https://${domain.hostname}/${link.shortCode}`;
    }
    return `${window.location.origin}/r/${link.shortCode}`;
  };

  const openQr = (link: any) => {
    setSelectedLink({
      shortCode: link.shortCode,
      url: getQrUrl(link),
      title: link.title || link.shortCode,
    });
    setQrOpen(true);
  };

  if (authLoading) {
    return <AppShell><div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></AppShell>;
  }
  if (!user) {
    window.location.href = getLoginUrl();
    return null;
  }

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl overflow-x-hidden px-0 py-8 sm:px-4">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="shrink-0 rounded-lg bg-primary/10 p-2">
              <QrCode className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold">QR Codes</h1>
              <p className="truncate text-sm text-muted-foreground">Generate QR codes for any of your short links</p>
            </div>
          </div>
          <div className="flex w-fit items-center gap-1 rounded-lg border p-0.5">
            <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="sm" className="h-7 w-7 p-0" onClick={() => setViewMode("list")} title="List view">
              <List className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="sm" className="h-7 w-7 p-0" onClick={() => setViewMode("grid")} title="Grid view">
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search links by slug, title, or destination..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>

        {isLoading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : filteredLinks.length === 0 ? (
          <Card className="p-8 text-center">
            <QrCode className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">{search ? "No links match your search." : "No links yet. Create a link to generate QR codes."}</p>
          </Card>
        ) : viewMode === "list" ? (
          <div className="space-y-2">
            {filteredLinks.map((link) => (
              <Card key={link.id} className="flex min-w-0 cursor-pointer flex-col gap-3 p-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:gap-4" onClick={() => openQr(link)}>
                <div className="w-fit rounded-md bg-muted p-2"><QrCode className="h-5 w-5 text-muted-foreground" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <code className="truncate text-sm font-mono font-medium">/r/{link.shortCode}</code>
                    {link.status === "paused" && <span className="shrink-0 rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">Paused</span>}
                  </div>
                  {link.title && <p className="mt-0.5 truncate text-xs text-muted-foreground">{link.title}</p>}
                  <p className="truncate text-xs text-muted-foreground/70">{link.destinationUrl}</p>
                </div>
                <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
                  <span className="whitespace-nowrap text-sm text-muted-foreground">{link.clickCount.toLocaleString()} clicks</span>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={(e) => { e.stopPropagation(); openQr(link); }}>
                    <QrCode className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Generate</span>
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {filteredLinks.map((link) => (
              <Card key={link.id} className="flex min-w-0 cursor-pointer flex-col items-center gap-3 p-4 text-center transition-colors hover:bg-muted/30" onClick={() => openQr(link)}>
                <div className="rounded-lg bg-muted p-3"><QrCode className="h-8 w-8 text-muted-foreground" /></div>
                <div className="w-full min-w-0">
                  <code className="block truncate text-xs font-mono font-medium">/r/{link.shortCode}</code>
                  {link.title && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{link.title}</p>}
                  <p className="mt-1 text-[11px] text-muted-foreground/60">{link.clickCount.toLocaleString()} clicks</p>
                </div>
                {link.status === "paused" && <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">Paused</span>}
              </Card>
            ))}
          </div>
        )}
      </div>

      {selectedLink && <QrCodeDialog open={qrOpen} onOpenChange={setQrOpen} url={selectedLink.url} title={selectedLink.shortCode} />}
    </AppShell>
  );
}
