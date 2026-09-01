import { useAuth } from "@/_core/hooks/useAuth";
import AppShell from "@/components/AppShell";
import { QrCodeDialog } from "@/components/QrCodeDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { buildGs1DigitalLinkPath, validateGtin } from "@shared/gs1";
import {
  BarChart3,
  Boxes,
  Check,
  Copy,
  ExternalLink,
  Globe2,
  Loader2,
  Package,
  QrCode,
  Route,
  ScanLine,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type CustomDomain = {
  id: number;
  hostname: string;
  verified: boolean;
};

export default function ProductQrPage() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: workspaceState } = trpc.workspace.current.useQuery(undefined, { enabled: !!user });
  const { data: products, isLoading } = trpc.productQr.list.useQuery(undefined, { enabled: !!user });
  const workspaceId = workspaceState?.workspace?.id;

  const [customDomains, setCustomDomains] = useState<CustomDomain[]>([]);
  const [productName, setProductName] = useState("");
  const [brand, setBrand] = useState("");
  const [gtin, setGtin] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [batchLot, setBatchLot] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [domainId, setDomainId] = useState("slugly");
  const [qrOpen, setQrOpen] = useState(false);
  const [qrUrl, setQrUrl] = useState("");
  const [qrTitle, setQrTitle] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);

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
        // Branded GS1 resolvers are optional.
      }
    })();
    return () => { cancelled = true; };
  }, [user, workspaceId]);

  const gtinState = useMemo(() => validateGtin(gtin), [gtin]);
  const previewPath = gtinState.valid && gtinState.normalized14
    ? buildGs1DigitalLinkPath(gtinState.normalized14, {
        batchLot,
        serialNumber,
        expiryDate,
      })
    : "/01/09520123456788";

  const selectedDomain = customDomains.find(domain => String(domain.id) === domainId);
  const previewOrigin = selectedDomain ? `https://${selectedDomain.hostname}` : "https://slugly.io/p/{product-id}";

  const createMutation = trpc.productQr.create.useMutation({
    onSuccess: (data) => {
      toast.success("GS1 Product QR created");
      setQrUrl(data.digitalLinkUrl);
      setQrTitle(productName || "product");
      setQrOpen(true);
      setProductName("");
      setBrand("");
      setGtin("");
      setDestinationUrl("");
      setBatchLot("");
      setSerialNumber("");
      setExpiryDate("");
      setDomainId("slugly");
      utils.productQr.list.invalidate();
      utils.link.list.invalidate();
      utils.workspace.current.invalidate();
    },
    onError: error => toast.error(error.message || "Could not create Product QR"),
  });

  const deleteMutation = trpc.productQr.delete.useMutation({
    onSuccess: () => {
      toast.success("Product QR removed");
      utils.productQr.list.invalidate();
      utils.link.list.invalidate();
    },
    onError: error => toast.error(error.message || "Could not remove Product QR"),
  });

  const handleCreate = () => {
    const validated = validateGtin(gtin);
    if (!validated.valid) {
      toast.error(validated.error || "Enter a valid GTIN");
      return;
    }
    if (!productName.trim()) {
      toast.error("Product name is required");
      return;
    }
    if (!destinationUrl.trim()) {
      toast.error("Destination URL is required");
      return;
    }

    createMutation.mutate({
      gtin,
      productName: productName.trim(),
      brand: brand.trim() || undefined,
      destinationUrl: destinationUrl.trim(),
      batchLot: batchLot.trim() || undefined,
      serialNumber: serialNumber.trim() || undefined,
      expiryDate: expiryDate || undefined,
      domainId: domainId === "slugly" ? null : Number(domainId),
    });
  };

  const copyUrl = async (id: number, url: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  if (authLoading) {
    return (
      <AppShell>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (!user) {
    window.location.href = getLoginUrl();
    return null;
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <div className="rounded-lg bg-primary/10 p-2">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Product</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">GS1 Product QR</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Create a 2D QR Code for packaging with a valid GTIN and GS1 Digital Link. Change the destination later without reprinting the package, and use Slugly routing + analytics behind the code.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setLocation("/domains")}>
              <Globe2 className="mr-2 h-4 w-4" />
              Resolver Domain
            </Button>
            <Button variant="outline" onClick={() => setLocation("/qr")}>
              <QrCode className="mr-2 h-4 w-4" />
              Regular QR Codes
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Card className="p-4">
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Boxes className="h-4 w-4 text-primary" />
            </div>
            <p className="text-sm font-semibold">1. Identify the product</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Enter GTIN-8, GTIN-12, GTIN-13 or GTIN-14. Slugly validates the check digit and stores the GS1 14-digit representation.</p>
          </Card>
          <Card className="p-4">
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <ScanLine className="h-4 w-4 text-primary" />
            </div>
            <p className="text-sm font-semibold">2. Print one 2D code</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">The QR contains a GS1 Digital Link such as /01/GTIN, with optional lot, serial and expiry data.</p>
          </Card>
          <Card className="p-4">
            <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <Route className="h-4 w-4 text-primary" />
            </div>
            <p className="text-sm font-semibold">3. Route + measure</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">The Product QR resolves through a normal Slugly link, so country/device routing, A/B tests, deep links and click analytics stay available.</p>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="p-5">
            <div className="mb-5">
              <h2 className="text-lg font-semibold">Create Product QR</h2>
              <p className="mt-1 text-xs text-muted-foreground">QR Code with GS1 Digital Link syntax for product packaging.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Product name *</Label>
                <Input value={productName} onChange={e => setProductName(e.target.value)} placeholder="Organic Milk 1L" />
              </div>
              <div>
                <Label>Brand</Label>
                <Input value={brand} onChange={e => setBrand(e.target.value)} placeholder="Brand name" />
              </div>
              <div>
                <Label>GTIN *</Label>
                <Input value={gtin} onChange={e => setGtin(e.target.value)} placeholder="9520123456788" inputMode="numeric" />
                {gtin && (
                  <p className={`mt-1 text-[11px] ${gtinState.valid ? "text-green-600" : "text-destructive"}`}>
                    {gtinState.valid ? `Valid · encoded as ${gtinState.normalized14}` : gtinState.error}
                  </p>
                )}
              </div>
              <div className="sm:col-span-2">
                <Label>Destination URL *</Label>
                <Input value={destinationUrl} onChange={e => setDestinationUrl(e.target.value)} placeholder="https://brand.com/products/milk" />
                <p className="mt-1 text-[11px] text-muted-foreground">You can change this destination later; the printed Product QR stays the same.</p>
              </div>
              <div>
                <Label>Batch / Lot (AI 10)</Label>
                <Input value={batchLot} onChange={e => setBatchLot(e.target.value)} placeholder="ABC123" maxLength={20} />
              </div>
              <div>
                <Label>Serial number (AI 21)</Label>
                <Input value={serialNumber} onChange={e => setSerialNumber(e.target.value)} placeholder="12345" maxLength={20} />
              </div>
              <div>
                <Label>Expiry date (AI 17)</Label>
                <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
              </div>
              <div>
                <Label>Resolver domain</Label>
                <Select value={domainId} onValueChange={setDomainId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="slugly">slugly.io</SelectItem>
                    {customDomains.map(domain => (
                      <SelectItem key={domain.id} value={String(domain.id)}>{domain.hostname}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button className="mt-5 w-full" onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
              Create GS1 Product QR
            </Button>
          </Card>

          <Card className="p-5">
            <div className="mb-4">
              <p className="text-sm font-semibold">Digital Link preview</p>
              <p className="mt-1 text-xs text-muted-foreground">This is the web address that will be encoded in the 2D QR symbol.</p>
            </div>
            <div className="rounded-xl border bg-muted/30 p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">GS1 Digital Link</p>
              <code className="mt-2 block break-all text-sm">{previewOrigin}{previewPath}</code>
            </div>
            <div className="mt-4 space-y-3 text-xs text-muted-foreground">
              <div className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /><span><strong className="text-foreground">GTIN = AI (01).</strong> Slugly pads shorter GTIN formats to the 14-digit GS1 representation.</span></div>
              <div className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /><span><strong className="text-foreground">Lot and serial are optional.</strong> When supplied, they become GS1 key qualifiers in the Digital Link path.</span></div>
              <div className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /><span><strong className="text-foreground">Expiry is optional.</strong> It is encoded as GS1 AI (17) in the query string.</span></div>
            </div>
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-[11px] leading-5 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
              This module currently generates <strong>QR Code with GS1 Digital Link</strong>. Retail POS support for 2D symbols still varies by market, so packaging teams should validate scanner/POS requirements before replacing an existing EAN/UPC symbol.
            </div>
          </Card>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Product QR library</h2>
              <p className="text-xs text-muted-foreground">Your packaging codes, destinations and scan performance.</p>
            </div>
          </div>

          {isLoading ? (
            <Card className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></Card>
          ) : products && products.length > 0 ? (
            <div className="grid gap-3">
              {products.map((product: any) => (
                <Card key={product.id} className="p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{product.productName}</p>
                        {product.brand && <span className="rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{product.brand}</span>}
                        <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">GTIN {product.sourceGtin}</span>
                      </div>
                      <code className="mt-2 block max-w-3xl truncate text-xs text-muted-foreground" title={product.digitalLinkUrl}>{product.digitalLinkUrl}</code>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                        <span>{product.clickCount.toLocaleString()} scans</span>
                        <span>{product.uniqueClicks.toLocaleString()} unique</span>
                        {product.batchLot && <span>Lot {product.batchLot}</span>}
                        {product.serialNumber && <span>Serial {product.serialNumber}</span>}
                        {product.expiryDate && <span>Expiry {product.expiryDate}</span>}
                        <span>{product.domainHostname || "slugly.io resolver"}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => copyUrl(product.id, product.digitalLinkUrl)}>
                        {copiedId === product.id ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                        Copy
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => { setQrUrl(product.digitalLinkUrl); setQrTitle(product.productName); setQrOpen(true); }}>
                        <QrCode className="mr-1.5 h-3.5 w-3.5" /> QR
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setLocation(`/link/${product.linkId}/rules`)}>
                        <Route className="mr-1.5 h-3.5 w-3.5" /> Routing
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setLocation(`/link/${product.linkId}/analytics`)}>
                        <BarChart3 className="mr-1.5 h-3.5 w-3.5" /> Analytics
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => {
                        if (window.confirm(`Remove Product QR for ${product.productName}? The printed GS1 URL will stop resolving.`)) {
                          deleteMutation.mutate({ id: product.id });
                        }
                      }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="mb-3 h-9 w-9 text-muted-foreground" />
              <p className="font-medium">No Product QR codes yet</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">Create your first GTIN-based GS1 Digital Link for packaging above.</p>
            </Card>
          )}
        </div>
      </div>

      <QrCodeDialog
        open={qrOpen}
        onOpenChange={setQrOpen}
        url={qrUrl}
        title={qrTitle}
      />
    </AppShell>
  );
}
