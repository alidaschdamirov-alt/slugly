import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import FeatureGateCard from "@/components/FeatureGateCard";
import RoutingAnalyticsCard from "@/components/RoutingAnalyticsCard";
import { toast } from "sonner";
import { useState } from "react";
import { useParams } from "wouter";
import { ArrowLeft, Plus, Trash2, Globe, Smartphone, FlaskConical, Link2, Eye, Loader2 } from "lucide-react";

type RuleType = "geo" | "device" | "ab" | "deeplink" | "pixel";

const RULE_LABELS: Record<RuleType, { label: string; icon: any; description: string }> = {
  geo: { label: "Geo-targeting", icon: Globe, description: "Redirect based on visitor's country" },
  device: { label: "Device targeting", icon: Smartphone, description: "Redirect based on device type" },
  ab: { label: "A/B Test", icon: FlaskConical, description: "Split traffic between variants" },
  deeplink: { label: "Deep Link", icon: Link2, description: "Open mobile app with web fallback" },
  pixel: { label: "Retargeting Pixel", icon: Eye, description: "Fire tracking pixels before redirect" },
};

export default function LinkRules() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const params = useParams<{ linkId: string }>();
  const linkId = parseInt(params.linkId || "0");
  const utils = trpc.useUtils();
  const [routingDays, setRoutingDays] = useState(30);

  const { data: billingStatus, isLoading: billingLoading } = trpc.billing.status.useQuery(undefined, { enabled: !!user });
  const features = billingStatus?.planConfig?.features;
  const canUseRedirectRules = !!features && (
    features.geoTarget ||
    features.abTest ||
    features.deepLinks ||
    features.pixels
  );

  const { data: rules, isLoading } = trpc.linkRules.list.useQuery(
    { linkId },
    { enabled: !!linkId && canUseRedirectRules }
  );
  const { data: pixels } = trpc.pixels.list.useQuery(undefined, { enabled: canUseRedirectRules });
  const { data: routingAnalytics } = trpc.link.analytics.useQuery(
    { id: linkId, days: routingDays },
    { enabled: !!linkId && canUseRedirectRules }
  );

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<RuleType>("geo");

  // Geo rule state
  const [geoCountries, setGeoCountries] = useState("");
  const [geoDestination, setGeoDestination] = useState("");

  // Device rule state
  const [deviceTypes, setDeviceTypes] = useState<string[]>([]);
  const [deviceDestination, setDeviceDestination] = useState("");

  // A/B state
  const [abVariants, setAbVariants] = useState([
    { name: "A", destination: "", weight: 50 },
    { name: "B", destination: "", weight: 50 },
  ]);

  // Deep link state
  const [iosScheme, setIosScheme] = useState("");
  const [iosAppStore, setIosAppStore] = useState("");
  const [androidScheme, setAndroidScheme] = useState("");
  const [androidPlayStore, setAndroidPlayStore] = useState("");
  const [webFallback, setWebFallback] = useState("");

  // Pixel state
  const [selectedPixelIds, setSelectedPixelIds] = useState<number[]>([]);
  const [pixelDelay, setPixelDelay] = useState(1500);

  const createMutation = trpc.linkRules.create.useMutation({
    onSuccess: () => {
      toast.success("Rule created");
      setAddDialogOpen(false);
      utils.linkRules.list.invalidate({ linkId });
      utils.link.analytics.invalidate({ id: linkId, days: routingDays });
    },
    onError: (err) => {
      if (err.message?.includes("higher plan") || err.message?.includes("require")) {
        toast.error("Redirect rules require Pro plan or higher.");
      } else {
        toast.error(err.message);
      }
    },
  });

  const deleteMutation = trpc.linkRules.delete.useMutation({
    onSuccess: () => {
      toast.success("Rule deleted");
      utils.linkRules.list.invalidate({ linkId });
      utils.link.analytics.invalidate({ id: linkId, days: routingDays });
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleMutation = trpc.linkRules.update.useMutation({
    onSuccess: () => {
      utils.linkRules.list.invalidate({ linkId });
      utils.link.analytics.invalidate({ id: linkId, days: routingDays });
    },
    onError: (err) => toast.error(err.message),
  });

  const handleCreate = () => {
    if (!canUseRedirectRules) {
      toast.info("Redirect rules require Pro plan or higher.");
      return;
    }

    let config: Record<string, any> = {};
    switch (selectedType) {
      case "geo":
        config = { rules: [{ countries: geoCountries.split(",").map(c => c.trim().toUpperCase()), destination: geoDestination }] };
        break;
      case "device":
        config = { rules: [{ devices: deviceTypes, destination: deviceDestination }] };
        break;
      case "ab":
        config = { variants: abVariants.filter(v => v.destination) };
        break;
      case "deeplink":
        config = {
          ios: iosScheme ? { scheme: iosScheme, appStoreUrl: iosAppStore } : undefined,
          android: androidScheme ? { scheme: androidScheme, playStoreUrl: androidPlayStore } : undefined,
          webFallback,
        };
        break;
      case "pixel":
        config = { pixelIds: selectedPixelIds, delayMs: pixelDelay };
        break;
    }
    createMutation.mutate({ linkId, type: selectedType, config, priority: (rules?.length || 0) + 1 });
  };

  if (!user) return null;

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Redirect Rules</h1>
            <p className="text-sm text-muted-foreground">Configure advanced redirect behavior for this link.</p>
          </div>
        </div>

        {billingLoading ? (
          <Card><CardContent className="flex items-center justify-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Checking plan access...</CardContent></Card>
        ) : !canUseRedirectRules ? (
          <FeatureGateCard
            title="Redirect rules require Pro"
            description="Unlock geo targeting, device redirects, A/B tests, deep links, and retargeting pixels for advanced campaigns."
            requiredPlan="Pro"
            featureLabel="Redirect rules"
          />
        ) : (
          <>
            <RoutingAnalyticsCard
              rules={(routingAnalytics?.routingRules || rules || []) as any}
              stats={routingAnalytics?.routingStats as any}
              days={routingDays}
              onDaysChange={setRoutingDays}
            />

            {/* Existing rules */}
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading rules...</div>
            ) : rules && rules.length > 0 ? (
              <div className="space-y-3">
                {rules.map((rule: any) => {
                  const meta = RULE_LABELS[rule.type as RuleType];
                  const Icon = meta?.icon || Globe;
                  return (
                    <Card key={rule.id}>
                      <CardContent className="flex items-center justify-between py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Icon className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-sm">{meta?.label || rule.type}</p>
                            <p className="text-xs text-muted-foreground">
                              Priority: {rule.priority} | {rule.enabled ? "Active" : "Disabled"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={rule.enabled}
                            onCheckedChange={(checked) => toggleMutation.mutate({ id: rule.id, linkId, enabled: checked })}
                          />
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate({ id: rule.id, linkId })}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Globe className="h-10 w-10 text-muted-foreground mb-3" />
                  <p className="font-medium">No redirect rules</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Add rules to customize where visitors are redirected based on location, device, or A/B tests.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Add rule button */}
            <Button onClick={() => setAddDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Rule
            </Button>
          </>
        )}

        {/* Add rule dialog */}
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Redirect Rule</DialogTitle>
              <DialogDescription>
                Configure advanced redirect behavior. Rules are available on Pro and higher plans.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Rule Type</Label>
                <Select value={selectedType} onValueChange={(v) => setSelectedType(v as RuleType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(RULE_LABELS).map(([key, meta]) => (
                      <SelectItem key={key} value={key}>{meta.label} — {meta.description}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Geo config */}
              {selectedType === "geo" && (
                <div className="space-y-3">
                  <div>
                    <Label>Countries (comma-separated ISO codes)</Label>
                    <Input value={geoCountries} onChange={(e) => setGeoCountries(e.target.value)} placeholder="US, CA, GB" />
                  </div>
                  <div>
                    <Label>Redirect to URL</Label>
                    <Input value={geoDestination} onChange={(e) => setGeoDestination(e.target.value)} placeholder="https://example.com/us" />
                  </div>
                </div>
              )}

              {/* Device config */}
              {selectedType === "device" && (
                <div className="space-y-3">
                  <div>
                    <Label>Device Types</Label>
                    <div className="flex gap-2 mt-1">
                      {["mobile", "tablet", "desktop"].map(d => (
                        <Badge
                          key={d}
                          variant={deviceTypes.includes(d) ? "default" : "outline"}
                          className="cursor-pointer"
                          onClick={() => setDeviceTypes(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])}
                        >
                          {d}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label>Redirect to URL</Label>
                    <Input value={deviceDestination} onChange={(e) => setDeviceDestination(e.target.value)} placeholder="https://m.example.com" />
                  </div>
                </div>
              )}

              {/* A/B config */}
              {selectedType === "ab" && (
                <div className="space-y-3">
                  {abVariants.map((v, i) => (
                    <div key={i} className="grid grid-cols-[1fr_2fr_60px] gap-2 items-end">
                      <div>
                        <Label>Name</Label>
                        <Input value={v.name} onChange={(e) => {
                          const copy = [...abVariants];
                          copy[i] = { ...copy[i], name: e.target.value };
                          setAbVariants(copy);
                        }} />
                      </div>
                      <div>
                        <Label>URL</Label>
                        <Input value={v.destination} onChange={(e) => {
                          const copy = [...abVariants];
                          copy[i] = { ...copy[i], destination: e.target.value };
                          setAbVariants(copy);
                        }} placeholder="https://..." />
                      </div>
                      <div>
                        <Label>Weight</Label>
                        <Input type="number" value={v.weight} onChange={(e) => {
                          const copy = [...abVariants];
                          copy[i] = { ...copy[i], weight: parseInt(e.target.value) || 0 };
                          setAbVariants(copy);
                        }} />
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => setAbVariants([...abVariants, { name: String.fromCharCode(65 + abVariants.length), destination: "", weight: 50 }])}>
                    + Add Variant
                  </Button>
                </div>
              )}

              {/* Deep link config */}
              {selectedType === "deeplink" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>iOS Scheme</Label>
                      <Input value={iosScheme} onChange={(e) => setIosScheme(e.target.value)} placeholder="myapp://path" />
                    </div>
                    <div>
                      <Label>App Store URL</Label>
                      <Input value={iosAppStore} onChange={(e) => setIosAppStore(e.target.value)} placeholder="https://apps.apple.com/..." />
                    </div>
                    <div>
                      <Label>Android Scheme</Label>
                      <Input value={androidScheme} onChange={(e) => setAndroidScheme(e.target.value)} placeholder="myapp://path" />
                    </div>
                    <div>
                      <Label>Play Store URL</Label>
                      <Input value={androidPlayStore} onChange={(e) => setAndroidPlayStore(e.target.value)} placeholder="https://play.google.com/..." />
                    </div>
                  </div>
                  <div>
                    <Label>Web Fallback URL</Label>
                    <Input value={webFallback} onChange={(e) => setWebFallback(e.target.value)} placeholder="https://example.com" />
                  </div>
                </div>
              )}

              {/* Pixel config */}
              {selectedType === "pixel" && (
                <div className="space-y-3">
                  <div>
                    <Label>Select Pixels</Label>
                    {pixels && pixels.length > 0 ? (
                      <div className="flex flex-wrap gap-2 mt-1">
                        {pixels.map((p: any) => (
                          <Badge
                            key={p.id}
                            variant={selectedPixelIds.includes(p.id) ? "default" : "outline"}
                            className="cursor-pointer"
                            onClick={() => setSelectedPixelIds(prev => prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id])}
                          >
                            {p.name} ({p.type})
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-1">No pixels configured. Add them in workspace settings first.</p>
                    )}
                  </div>
                  <div>
                    <Label>Interstitial Delay (ms)</Label>
                    <Input type="number" value={pixelDelay} onChange={(e) => setPixelDelay(parseInt(e.target.value) || 1500)} />
                  </div>
                </div>
              )}

              <Button className="w-full" onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating..." : "Create Rule"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
