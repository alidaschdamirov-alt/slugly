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

  if (authLoading) {
    return <AppShell><div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></AppShell>;
  }
  if (!user) {
    window.location.href = getLoginUrl();
    return null;
  }

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <QrCode className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">QR Codes</h1>
              <p className="text-sm text-muted-foreground">Generate QR codes for any of your short links</p>
            </div>
          </div>
          {/* View mode toggle */}
          <div className="flex items-center gap-1 border rounded-lg p-0.5">
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setViewMode("list")}
              title="List view"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setViewMode("grid")}
              title="Grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search links by slug, title, or destination..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Links */}
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredLinks.length === 0 ? (
          <Card className="p-8 text-center">
            <QrCode className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              {search ? "No links match your search." : "No links yet. Create a link to generate QR codes."}
            </p>
          </Card>
        ) : viewMode === "list" ? (
          /* List View */
          <div className="space-y-2">
            {filteredLinks.map((link) => (
              <Card
                key={link.id}
                className="p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => {
                  setSelectedLink({
                    shortCode: link.shortCode,
                    url: getQrUrl(link),
                    title: link.title || link.shortCode,
                  });
                  setQrOpen(true);
                }}
              >
                <div className="p-2 rounded-md bg-muted">
                  <QrCode className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono font-medium">/r/{link.shortCode}</code>
                    {link.status === "paused" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">Paused</span>
                    )}
                  </div>
                  {link.title && <p className="text-xs text-muted-foreground truncate mt-0.5">{link.title}</p>}
                  <p className="text-xs text-muted-foreground/70 truncate">{link.destinationUrl}</p>
                </div>
                <div className="flex items-center gap-2 flex-none">
                  <span className="text-sm text-muted-foreground">{link.clickCount.toLocaleString()} clicks</span>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <QrCode className="h-3.5 w-3.5" />
                    Generate
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          /* Grid View */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {filteredLinks.map((link) => (
              <Card
                key={link.id}
                className="p-4 flex flex-col items-center gap-3 hover:bg-muted/30 transition-colors cursor-pointer text-center"
                onClick={() => {
                  setSelectedLink({
                    shortCode: link.shortCode,
                    url: getQrUrl(link),
                    title: link.title || link.shortCode,
                  });
                  setQrOpen(true);
                }}
              >
                <div className="p-3 rounded-lg bg-muted">
                  <QrCode className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="min-w-0 w-full">
                  <code className="text-xs font-mono font-medium block truncate">/r/{link.shortCode}</code>
                  {link.title && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{link.title}</p>}
                  <p className="text-[11px] text-muted-foreground/60 mt-1">{link.clickCount.toLocaleString()} clicks</p>
                </div>
                {link.status === "paused" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">Paused</span>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* QR Code Dialog */}
      {selectedLink && (
        <QrCodeDialog
          open={qrOpen}
          onOpenChange={setQrOpen}
          url={selectedLink.url}
          title={selectedLink.shortCode}
        />
      )}
    </AppShell>
  );
}
