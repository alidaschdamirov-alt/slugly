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
import { ArrowLeft, Link2, Loader2, ChevronDown, ChevronUp, Copy, Check, Calendar, BarChart3, AlertTriangle, ArrowUpCircle, Globe, Route } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";
import TagInput from "@/components/TagInput";
import { UpsellDialog, parseLimitError } from "@/components/UpsellDialog";
import { getNextPlan } from "../../../shared/plans";
import { DESTINATION_URL_ERROR, normalizeDestinationUrl } from "@shared/validation/destination-url";

const CUSTOM_CODE_RE = /^[a-zA-Z0-9_-]+$/;

type CustomDomain = {
  id: number;
  hostname: string;
  verified: boolean;
};

type RoutingRuleDraft = {
  type: "geo" | "device" | "ab" | "deeplink";
  config: Record<string, any>;
  priority: number;
};

function getFriendlyError(message: string) {
  try {
    const parsed = JSON.parse(message);
    if (Array.isArray(parsed)) {
      const customCodeIssue = parsed.find((issue: any) => issue?.path?.includes("customCode"));
      if (customCodeIssue) return "Custom short code can contain only Latin letters, numbers, hyphens, and underscores.";
      const urlIssue = parsed.find((issue: any) => issue?.path?.includes("destinationUrl"));
      if (urlIssue) return DESTINATION_URL_ERROR;
    }
  } catch {
    // Not a JSON/Zod error.
  }

  if (message.includes("Invalid string") && message.includes("customCode")) {
    return "Custom short code can contain only Latin letters, numbers, hyphens, and underscores.";
  }

  if (message.includes("Enter a valid URL")) return DESTINATION_URL_ERROR;

  return message || "Something went wrong. Please try again.";
}

async function getApiError(response: Response) {
  try {
    const body = await response.json();
    return body?.error || body?.message || `Request failed with HTTP ${response.status}`;
  } catch {
    return `Request failed with HTTP ${response.status}`;
  }
}

export default function CreateLink() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const preselectedProject = params.get("project");

  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const [title, setTitle] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [customCodeError, setCustomCodeError] = useState("");
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
  const [scheduleError, setScheduleError] = useState("");
  const [showScheduling, setShowScheduling] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [createdLinkId, setCreatedLinkId] = useState<number | null>(null);
  const [createdShortUrl, setCreatedShortUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [upsellError, setUpsellError] = useState<any>(null);
  const [upsellOpen, setUpsellOpen] = useState(false);
  const [customDomains, setCustomDomains] = useState<CustomDomain[]>([]);
  const [selectedDomainId, setSelectedDomainId] = useState("slugly");
  const [showRouting, setShowRouting] = useState(false);
  const [routingType, setRoutingType] = useState<"geo" | "device" | "ab" | "deeplink">("geo");
  const [geoCountries, setGeoCountries] = useState("");
  const [geoDestination, setGeoDestination] = useState("");
  const [deviceTypes, setDeviceTypes] = useState<string[]>([]);
  const [deviceDestination, setDeviceDestination] = useState("");
  const [abDestinationA, setAbDestinationA] = useState("");
  const [abDestinationB, setAbDestinationB] = useState("");
  const [abWeightA, setAbWeightA] = useState(50);
  const [abWeightB, setAbWeightB] = useState(50);
  const [deepIosScheme, setDeepIosScheme] = useState("");
  const [deepIosStore, setDeepIosStore] = useState("");
  const [deepIosTeamId, setDeepIosTeamId] = useState("");
  const [deepIosBundleId, setDeepIosBundleId] = useState("");
  const [deepAndroidScheme, setDeepAndroidScheme] = useState("");
  const [deepAndroidStore, setDeepAndroidStore] = useState("");
  const [deepAndroidPackage, setDeepAndroidPackage] = useState("");
  const [deepAndroidFingerprint, setDeepAndroidFingerprint] = useState("");
  const [deepWebFallback, setDeepWebFallback] = useState("");
  const [routingError, setRoutingError] = useState("");
  const pendingRoutingRuleRef = useRef<RoutingRuleDraft | null>(null);

  const { data: projects } = trpc.project.list.useQuery(undefined, { enabled: !!user });
  const { data: workspaceState, isLoading: workspaceLoading } = trpc.workspace.current.useQuery(undefined, { enabled: !!user });
  const utils = trpc.useUtils();

  const plan = workspaceState?.workspace?.plan || "free";
  const workspaceId = workspaceState?.workspace?.id;
  const linkLimit = workspaceState?.planConfig?.limits?.links ?? -1;
  const linkUsage = workspaceState?.usage?.links ?? 0;
  const linkLimitReached = linkLimit !== -1 && linkUsage >= linkLimit;
  const linksRemaining = linkLimit === -1 ? null : Math.max(linkLimit - linkUsage, 0);
  const nearLinkLimit = linkLimit !== -1 && !linkLimitReached && linksRemaining !== null && linksRemaining <= 1;
  const selectedDomain = customDomains.find(domain => String(domain.id) === selectedDomainId);
  const routingFeatures = workspaceState?.planConfig?.features;
  const canUseGeoRouting = !!routingFeatures?.geoTarget;
  const canUseAbRouting = !!routingFeatures?.abTest;
  const canUseDeepLinks = !!routingFeatures?.deepLinks;
  const canUseRouting = canUseGeoRouting || canUseAbRouting || canUseDeepLinks;

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
        // Custom domains are optional. The default Slugly domain remains available.
      }
    })();
    return () => { cancelled = true; };
  }, [user, workspaceId]);

  const createRoutingRule = trpc.linkRules.create.useMutation();

  const createLink = trpc.link.create.useMutation({
    onSuccess: async (data) => {
      let shortUrl = `${window.location.origin}/r/${data.shortCode}`;
      if (selectedDomainId !== "slugly" && workspaceId) {
        try {
          const response = await fetch(`/api/custom-domains/links/${data.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "x-workspace-id": String(workspaceId),
            },
            credentials: "same-origin",
            body: JSON.stringify({ domainId: Number(selectedDomainId) }),
          });
          if (!response.ok) throw new Error(await getApiError(response));
          const body = await response.json();
          shortUrl = body.shortUrl || shortUrl;
        } catch (error: any) {
          toast.error(`Link was created, but the custom domain could not be attached: ${error?.message || "unknown error"}`);
        }
      }

      let routingCreated = false;
      const pendingRoutingRule = pendingRoutingRuleRef.current;
      if (pendingRoutingRule) {
        try {
          await createRoutingRule.mutateAsync({
            linkId: data.id,
            type: pendingRoutingRule.type,
            config: pendingRoutingRule.config,
            priority: pendingRoutingRule.priority,
          });
          routingCreated = true;
        } catch (error: any) {
          toast.error(`Link was created, but the routing rule could not be added: ${error?.message || "unknown error"}`);
        } finally {
          pendingRoutingRuleRef.current = null;
        }
      }

      setCreatedCode(data.shortCode);
      setCreatedLinkId(data.id);
      setCreatedShortUrl(shortUrl);
      utils.link.list.invalidate();
      utils.tag.list.invalidate();
      utils.workspace.current.invalidate();
      utils.billing.status.invalidate();
      toast.success(
        routingCreated
          ? "Link and routing rule created!"
          : selectedDomainId !== "slugly"
            ? "Branded short link created!"
            : "Link created!"
      );
      trackEvent("link_created", {
        shortCode: data.shortCode,
        custom_domain: selectedDomainId !== "slugly",
        routing_rule: routingCreated ? pendingRoutingRule?.type : undefined,
      });
    },
    onError: (err) => {
      const limitErr = parseLimitError(err.message);
      if (limitErr) {
        setUpsellError(limitErr);
        setUpsellOpen(true);
      } else {
        const message = getFriendlyError(err.message);
        if (message === DESTINATION_URL_ERROR) setUrlError(message);
        else toast.error(message);
      }
    },
  });

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!user) { window.location.href = getLoginUrl(); return null; }

  const openLinkLimitUpsell = () => {
    setUpsellError({
      type: "LIMIT_REACHED",
      resource: "links",
      limit: linkLimit,
      current: linkUsage,
      currentPlan: plan,
      nextPlan: getNextPlan(plan as any),
    });
    setUpsellOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setUrlError("");
    setCustomCodeError("");
    setScheduleError("");
    setRoutingError("");
    pendingRoutingRuleRef.current = null;

    if (linkLimitReached) {
      openLinkLimitUpsell();
      return;
    }

    const normalizedUrl = normalizeDestinationUrl(url);
    if (!normalizedUrl) {
      setUrlError(DESTINATION_URL_ERROR);
      return;
    }

    const cleanedCustomCode = customCode.trim();
    if (cleanedCustomCode && !CUSTOM_CODE_RE.test(cleanedCustomCode)) {
      setCustomCodeError("Only Latin letters, numbers, hyphens, and underscores are allowed.");
      return;
    }

    const activeFromTs = activeFrom ? new Date(activeFrom).getTime() : undefined;
    const expiresAtTs = expiresAt ? new Date(expiresAt).getTime() : undefined;
    const now = Date.now();

    if (expiresAtTs && expiresAtTs <= now) {
      setScheduleError("Expiry date must be in the future.");
      return;
    }

    if (activeFromTs && expiresAtTs && activeFromTs >= expiresAtTs) {
      setScheduleError("Active-from date must be before expiry date.");
      return;
    }

    if (showRouting) {
      if (!canUseRouting) {
        setRoutingError("Smart Routing requires Pro plan or higher.");
        return;
      }

      if (routingType === "geo") {
        const countries = geoCountries
          .split(",")
          .map(country => country.trim().toUpperCase())
          .filter(Boolean);
        if (countries.length === 0 || countries.some(country => !/^[A-Z]{2}$/.test(country))) {
          setRoutingError("Enter one or more 2-letter ISO country codes, for example AZ, AE, US.");
          return;
        }
        const destination = normalizeDestinationUrl(geoDestination);
        if (!destination) {
          setRoutingError("Enter a valid destination URL for the country routing rule.");
          return;
        }
        if (destination !== geoDestination) setGeoDestination(destination);
        pendingRoutingRuleRef.current = {
          type: "geo",
          config: { rules: [{ countries, destination }] },
          priority: 1,
        };
      } else if (routingType === "device") {
        if (deviceTypes.length === 0) {
          setRoutingError("Choose at least one device type.");
          return;
        }
        const destination = normalizeDestinationUrl(deviceDestination);
        if (!destination) {
          setRoutingError("Enter a valid destination URL for the device routing rule.");
          return;
        }
        if (destination !== deviceDestination) setDeviceDestination(destination);
        pendingRoutingRuleRef.current = {
          type: "device",
          config: { rules: [{ devices: deviceTypes, destination }] },
          priority: 1,
        };
      } else if (routingType === "ab") {
        const destinationA = normalizeDestinationUrl(abDestinationA);
        const destinationB = normalizeDestinationUrl(abDestinationB);
        if (!destinationA || !destinationB) {
          setRoutingError("Enter valid destination URLs for both A/B variants.");
          return;
        }
        if (abWeightA <= 0 || abWeightB <= 0) {
          setRoutingError("A/B variant weights must be greater than zero.");
          return;
        }
        if (destinationA !== abDestinationA) setAbDestinationA(destinationA);
        if (destinationB !== abDestinationB) setAbDestinationB(destinationB);
        pendingRoutingRuleRef.current = {
          type: "ab",
          config: {
            variants: [
              { name: "A", destination: destinationA, weight: abWeightA },
              { name: "B", destination: destinationB, weight: abWeightB },
            ],
          },
          priority: 1,
        };
      } else {
        const fallback = normalizeDestinationUrl(deepWebFallback || normalizedUrl);
        const fingerprints = deepAndroidFingerprint.split(",").map(value => value.trim().toUpperCase()).filter(Boolean);
        if (!fallback) {
          setRoutingError("Enter a valid web fallback URL for the mobile deep link.");
          return;
        }
        if (!deepIosScheme.trim() && !deepAndroidScheme.trim() && !deepIosTeamId.trim() && !deepAndroidPackage.trim()) {
          setRoutingError("Configure at least iOS or Android app opening.");
          return;
        }
        if ((deepIosTeamId.trim() && !deepIosBundleId.trim()) || (!deepIosTeamId.trim() && deepIosBundleId.trim())) {
          setRoutingError("Apple Team ID and Bundle ID must be provided together.");
          return;
        }
        if ((deepAndroidPackage.trim() && fingerprints.length === 0) || (!deepAndroidPackage.trim() && fingerprints.length > 0)) {
          setRoutingError("Android package name and SHA-256 fingerprint must be provided together.");
          return;
        }
        pendingRoutingRuleRef.current = {
          type: "deeplink",
          config: {
            ios: (deepIosScheme || deepIosStore || deepIosTeamId || deepIosBundleId) ? {
              scheme: deepIosScheme.trim() || undefined,
              appStoreUrl: deepIosStore.trim() || undefined,
              teamId: deepIosTeamId.trim().toUpperCase() || undefined,
              bundleId: deepIosBundleId.trim() || undefined,
            } : undefined,
            android: (deepAndroidScheme || deepAndroidStore || deepAndroidPackage || deepAndroidFingerprint) ? {
              scheme: deepAndroidScheme.trim() || undefined,
              playStoreUrl: deepAndroidStore.trim() || undefined,
              packageName: deepAndroidPackage.trim() || undefined,
              sha256CertFingerprints: fingerprints.length ? fingerprints : undefined,
            } : undefined,
            webFallback: fallback,
            fallbackDelayMs: 2200,
          },
          priority: 1,
        };
      }
    }

    if (normalizedUrl !== url) setUrl(normalizedUrl);

    trackEvent("link_create_clicked", {
      has_custom_code: !!cleanedCustomCode,
      has_project: !!projectId,
      has_utm: !!(utmSource || utmMedium || utmCampaign || utmTerm || utmContent),
      has_schedule: !!(activeFrom || expiresAt),
      has_custom_domain: selectedDomainId !== "slugly",
      has_routing: !!pendingRoutingRuleRef.current,
      routing_type: pendingRoutingRuleRef.current?.type,
    });

    createLink.mutate({
      destinationUrl: normalizedUrl,
      title: title || undefined,
      projectId: projectId ? parseInt(projectId) : undefined,
      customCode: cleanedCustomCode || undefined,
      tags: tags.length > 0 ? tags : undefined,
      utmSource: utmSource || undefined,
      utmMedium: utmMedium || undefined,
      utmCampaign: utmCampaign || undefined,
      utmTerm: utmTerm || undefined,
      utmContent: utmContent || undefined,
      activeFrom: activeFromTs,
      expiresAt: expiresAtTs,
    });
  };

  const copyCreatedLink = () => {
    const shortUrl = createdShortUrl || (createdCode ? `${window.location.origin}/r/${createdCode}` : null);
    if (shortUrl) {
      navigator.clipboard.writeText(shortUrl);
      trackEvent("link_copy_clicked", { source: "create_success", shortCode: createdCode || "" });
      setCopied(true);
      toast.success("Copied!");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const resetForm = () => {
    setUrl("");
    setUrlError("");
    setTitle("");
    setCustomCode("");
    setCustomCodeError("");
    setTags([]);
    setActiveFrom("");
    setExpiresAt("");
    setScheduleError("");
    setShowScheduling(false);
    setUtmSource("");
    setUtmMedium("");
    setUtmCampaign("");
    setUtmTerm("");
    setUtmContent("");
    setCreatedCode(null);
    setCreatedLinkId(null);
    setCreatedShortUrl(null);
    setSelectedDomainId("slugly");
    setShowRouting(false);
    setRoutingType("geo");
    setGeoCountries("");
    setGeoDestination("");
    setDeviceTypes([]);
    setDeviceDestination("");
    setAbDestinationA("");
    setAbDestinationB("");
    setAbWeightA(50);
    setAbWeightB(50);
    setDeepIosScheme("");
    setDeepIosStore("");
    setDeepIosTeamId("");
    setDeepIosBundleId("");
    setDeepAndroidScheme("");
    setDeepAndroidStore("");
    setDeepAndroidPackage("");
    setDeepAndroidFingerprint("");
    setDeepWebFallback("");
    setRoutingError("");
    pendingRoutingRuleRef.current = null;
  };

  const shortCodePrefix = selectedDomain ? `${selectedDomain.hostname}/` : `${window.location.host}/r/`;

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
                <code className="text-sm bg-muted px-3 py-1.5 rounded-md font-mono break-all">{createdShortUrl || `${window.location.origin}/r/${createdCode}`}</code>
                <button onClick={copyCreatedLink} className="p-2 hover:bg-muted rounded-md transition-colors">
                  {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="border rounded-lg p-4 bg-muted/30 mb-6">
              <h3 className="text-sm font-medium mb-3">What's next?</h3>
              <div className="space-y-2.5">
                <Step number="1" title="Share your link" text="paste it in social media, emails, or anywhere you want to track clicks" />
                <Step number="2" title="Watch clicks roll in" text="see real-time analytics: countries, devices, referrers" />
                <Step number="3" title="Optimize" text="use UTM tags and A/B test destinations" />
              </div>
            </div>

            <div className="flex gap-3 justify-center flex-wrap">
              <Button variant="outline" onClick={resetForm}>Create Another</Button>
              {createdLinkId && (
                <>
                  <Button variant="outline" onClick={() => setLocation(`/link/${createdLinkId}/analytics`)}>
                    <BarChart3 className="h-4 w-4 mr-1.5" />
                    View Analytics
                  </Button>
                  <Button variant="outline" onClick={() => setLocation(`/link/${createdLinkId}/rules`)}>
                    <Route className="h-4 w-4 mr-1.5" />
                    Manage Routing
                  </Button>
                </>
              )}
              <Button onClick={() => setLocation(projectId ? `/project/${projectId}` : "/dashboard")}>View Links</Button>
            </div>
          </Card>
        ) : (
          <Card className="p-6">
            <LimitNotice
              loading={workspaceLoading}
              limit={linkLimit}
              usage={linkUsage}
              remaining={linksRemaining}
              reached={linkLimitReached}
              near={nearLinkLimit}
              onUpgrade={openLinkLimitUpsell}
            />

            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div className="space-y-2">
                <Label>Destination URL *</Label>
                <Input
                  value={url}
                  onChange={e => { setUrl(e.target.value); setUrlError(""); }}
                  onBlur={() => { const normalized = normalizeDestinationUrl(url); if (normalized) setUrl(normalized); }}
                  placeholder="https://example.com/landing-page"
                  aria-invalid={!!urlError}
                  disabled={linkLimitReached}
                  required
                />
                {urlError && <p className="text-xs text-destructive">{urlError}</p>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Title (optional)</Label>
                  <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Black Friday Landing" disabled={linkLimitReached} />
                </div>
                <div className="space-y-2">
                  <Label>Project</Label>
                  <Select value={projectId} onValueChange={setProjectId} disabled={linkLimitReached}>
                    <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                    <SelectContent>
                      {projects?.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Short Domain</Label>
                <Select value={selectedDomainId} onValueChange={setSelectedDomainId} disabled={linkLimitReached}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose short domain" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="slugly">slugly.io (default)</SelectItem>
                    {customDomains.map(domain => (
                      <SelectItem key={domain.id} value={String(domain.id)}>{domain.hostname}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">Verified custom domains create branded links without the /r/ prefix.</p>
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setLocation("/domains")}>
                    <Globe className="h-3.5 w-3.5 mr-1" /> Manage domains
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Tags</Label>
                <TagInput value={tags} onChange={setTags} placeholder="Add tags (press Enter)" />
              </div>

              <div className="space-y-2">
                <Label>Custom Short Code (optional)</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground whitespace-nowrap">{shortCodePrefix}</span>
                  <Input
                    value={customCode}
                    onChange={e => { setCustomCode(e.target.value); setCustomCodeError(""); }}
                    placeholder="my-link"
                    aria-invalid={!!customCodeError}
                    disabled={linkLimitReached}
                  />
                </div>
                {customCodeError ? <p className="text-xs text-destructive">{customCodeError}</p> : <p className="text-xs text-muted-foreground">Use Latin letters, numbers, hyphens, or underscores.</p>}
              </div>

              <Separator />

              <div>
                <button
                  type="button"
                  onClick={() => {
                    if (!canUseRouting) {
                      setLocation("/billing");
                      return;
                    }
                    setShowRouting(!showRouting);
                    setRoutingError("");
                  }}
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                  disabled={linkLimitReached}
                >
                  <Route className="h-4 w-4" />
                  Smart Routing
                  {!canUseRouting && <span className="text-xs text-primary">(Pro)</span>}
                  {canUseRouting && (showRouting ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
                </button>

                {!canUseRouting ? (
                  <div className="mt-3 rounded-lg border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
                    Route visitors by country, device, or A/B variant. Smart Routing is available on Pro and Team plans.
                    <Button type="button" variant="link" size="sm" className="h-auto px-1 text-xs" onClick={() => setLocation("/billing")}>
                      View plans
                    </Button>
                  </div>
                ) : showRouting ? (
                  <div className="mt-4 space-y-4 pl-2 border-l-2 border-primary/20">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Initial Routing Rule</Label>
                      <Select
                        value={routingType}
                        onValueChange={(value) => {
                          setRoutingType(value as "geo" | "device" | "ab");
                          setRoutingError("");
                        }}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="geo">Country targeting</SelectItem>
                          <SelectItem value="device">Device targeting</SelectItem>
                          {canUseAbRouting && <SelectItem value="ab">A/B traffic split</SelectItem>}
                          {canUseDeepLinks && <SelectItem value="deeplink">Mobile deep link</SelectItem>}
                        </SelectContent>
                      </Select>
                    </div>

                    {routingType === "geo" && (
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Countries</Label>
                          <Input
                            value={geoCountries}
                            onChange={event => { setGeoCountries(event.target.value); setRoutingError(""); }}
                            placeholder="AZ, AE, US"
                            className="h-9 text-sm"
                          />
                          <p className="text-xs text-muted-foreground">Comma-separated 2-letter ISO country codes.</p>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Redirect these countries to</Label>
                          <Input
                            value={geoDestination}
                            onChange={event => { setGeoDestination(event.target.value); setRoutingError(""); }}
                            placeholder="https://example.com/azerbaijan"
                            className="h-9 text-sm"
                          />
                        </div>
                      </div>
                    )}

                    {routingType === "device" && (
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Device Types</Label>
                          <div className="flex flex-wrap gap-2">
                            {["mobile", "tablet", "desktop"].map(device => (
                              <Button
                                key={device}
                                type="button"
                                size="sm"
                                variant={deviceTypes.includes(device) ? "default" : "outline"}
                                className="h-8 capitalize"
                                onClick={() => {
                                  setDeviceTypes(current =>
                                    current.includes(device)
                                      ? current.filter(item => item !== device)
                                      : [...current, device]
                                  );
                                  setRoutingError("");
                                }}
                              >
                                {device}
                              </Button>
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Redirect selected devices to</Label>
                          <Input
                            value={deviceDestination}
                            onChange={event => { setDeviceDestination(event.target.value); setRoutingError(""); }}
                            placeholder="https://m.example.com"
                            className="h-9 text-sm"
                          />
                        </div>
                      </div>
                    )}

                    {routingType === "ab" && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-[1fr_90px] gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Variant A URL</Label>
                            <Input value={abDestinationA} onChange={event => { setAbDestinationA(event.target.value); setRoutingError(""); }} placeholder="https://example.com/a" className="h-9 text-sm" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Weight</Label>
                            <Input type="number" min={1} value={abWeightA} onChange={event => setAbWeightA(Number(event.target.value) || 0)} className="h-9 text-sm" />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-[1fr_90px] gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Variant B URL</Label>
                            <Input value={abDestinationB} onChange={event => { setAbDestinationB(event.target.value); setRoutingError(""); }} placeholder="https://example.com/b" className="h-9 text-sm" />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Weight</Label>
                            <Input type="number" min={1} value={abWeightB} onChange={event => setAbWeightB(Number(event.target.value) || 0)} className="h-9 text-sm" />
                          </div>
                        </div>
                      </div>
                    )}

                    {routingType === "deeplink" && (
                      <div className="space-y-4">
                        <div className="rounded-lg border bg-muted/30 p-3">
                          <p className="text-xs font-medium">Mobile Deep Link flow</p>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground md:grid-cols-4">
                            <div className="rounded border bg-background p-2">1. Short link</div>
                            <div className="rounded border bg-background p-2">2. Open app</div>
                            <div className="rounded border bg-background p-2">3. App Store / Play Store</div>
                            <div className="rounded border bg-background p-2">4. Web fallback</div>
                          </div>
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            You can start with only an app scheme + fallback. Add native app IDs and a verified custom domain later for Universal Links / Android App Links.
                          </p>
                        </div>

                        <div>
                          <p className="mb-2 text-xs font-medium">iOS</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <TextField label="App Scheme" value={deepIosScheme} onChange={setDeepIosScheme} placeholder="myapp://product/123" disabled={linkLimitReached} />
                            <TextField label="App Store URL" value={deepIosStore} onChange={setDeepIosStore} placeholder="https://apps.apple.com/app/..." disabled={linkLimitReached} />
                            <TextField label="Apple Team ID" value={deepIosTeamId} onChange={(value) => setDeepIosTeamId(value.toUpperCase())} placeholder="ABCDE12345" disabled={linkLimitReached} />
                            <TextField label="Bundle ID" value={deepIosBundleId} onChange={setDeepIosBundleId} placeholder="com.company.app" disabled={linkLimitReached} />
                          </div>
                        </div>

                        <div>
                          <p className="mb-2 text-xs font-medium">Android</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <TextField label="App Scheme" value={deepAndroidScheme} onChange={setDeepAndroidScheme} placeholder="myapp://product/123" disabled={linkLimitReached} />
                            <TextField label="Play Store URL" value={deepAndroidStore} onChange={setDeepAndroidStore} placeholder="https://play.google.com/store/apps/details?id=..." disabled={linkLimitReached} />
                            <TextField label="Package Name" value={deepAndroidPackage} onChange={setDeepAndroidPackage} placeholder="com.company.app" disabled={linkLimitReached} />
                            <TextField label="SHA-256 Certificate Fingerprint" value={deepAndroidFingerprint} onChange={setDeepAndroidFingerprint} placeholder="AA:BB:CC:..." disabled={linkLimitReached} />
                          </div>
                        </div>

                        <TextField label="Web Fallback" value={deepWebFallback} onChange={setDeepWebFallback} placeholder={url || "https://example.com"} disabled={linkLimitReached} />
                        <div className="rounded-lg border p-3 text-[11px] text-muted-foreground">
                          {selectedDomainId !== "slugly"
                            ? "Verified branded domain selected: native Universal/App Link association can be enabled when the app IDs above are filled in."
                            : "Using slugly.io: custom schemes and store/web fallback work, but native Universal Links / App Links require a verified custom domain."}
                        </div>
                      </div>
                    )}
                    {routingError && <p className="text-xs text-destructive">{routingError}</p>}
                    <p className="text-xs text-muted-foreground">
                      This creates the first routing rule with the link. Add more rules, Deep Links, and retargeting pixels from Manage Routing after creation.
                    </p>
                  </div>
                ) : null}
              </div>

              <Separator />

              <div>
                <button type="button" onClick={() => setShowScheduling(!showScheduling)} className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" disabled={linkLimitReached}>
                  {showScheduling ? <ChevronUp className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
                  Schedule & Expiry
                </button>
                {showScheduling && (
                  <div className="mt-4 space-y-3 pl-2 border-l-2 border-primary/20">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Active From (optional)</Label>
                        <Input type="datetime-local" value={activeFrom} onChange={e => { setActiveFrom(e.target.value); setScheduleError(""); }} className="h-9 text-sm" disabled={linkLimitReached} />
                        <p className="text-xs text-muted-foreground">Link won't redirect until this date</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Expires At (optional)</Label>
                        <Input type="datetime-local" value={expiresAt} onChange={e => { setExpiresAt(e.target.value); setScheduleError(""); }} className="h-9 text-sm" disabled={linkLimitReached} />
                        <p className="text-xs text-muted-foreground">Link stops redirecting after this date</p>
                      </div>
                    </div>
                    {scheduleError && <p className="text-xs text-destructive">{scheduleError}</p>}
                  </div>
                )}
              </div>

              <Separator />

              <div>
                <button type="button" onClick={() => setShowUtm(!showUtm)} className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" disabled={linkLimitReached}>
                  {showUtm ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  UTM Parameters
                </button>
                {showUtm && (
                  <div className="mt-4 space-y-3 pl-2 border-l-2 border-primary/20">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <TextField label="Source" value={utmSource} onChange={setUtmSource} placeholder="facebook, google, newsletter" disabled={linkLimitReached} />
                      <TextField label="Medium" value={utmMedium} onChange={setUtmMedium} placeholder="cpc, email, social" disabled={linkLimitReached} />
                      <TextField label="Campaign" value={utmCampaign} onChange={setUtmCampaign} placeholder="black_friday_2024" disabled={linkLimitReached} />
                      <TextField label="Term" value={utmTerm} onChange={setUtmTerm} placeholder="running+shoes" disabled={linkLimitReached} />
                      <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-xs">Content</Label>
                        <Input value={utmContent} onChange={e => setUtmContent(e.target.value)} placeholder="banner_top, cta_button" className="h-9 text-sm" disabled={linkLimitReached} />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={createLink.isPending || workspaceLoading || !url.trim() || linkLimitReached}>
                {createLink.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : linkLimitReached ? <ArrowUpCircle className="h-4 w-4 mr-2" /> : <Link2 className="h-4 w-4 mr-2" />}
                {linkLimitReached ? "Upgrade to Create More Links" : selectedDomainId !== "slugly" ? "Create Branded Short Link" : "Create Short Link"}
              </Button>
            </form>
          </Card>
        )}
      </div>
      <UpsellDialog error={upsellError} open={upsellOpen} onOpenChange={setUpsellOpen} />
    </AppShell>
  );
}

function LimitNotice({ loading, limit, usage, remaining, reached, near, onUpgrade }: { loading: boolean; limit: number; usage: number; remaining: number | null; reached: boolean; near: boolean; onUpgrade: () => void }) {
  if (loading) {
    return <div className="mb-5 h-14 rounded-lg bg-muted/60 animate-pulse" />;
  }
  if (limit === -1) {
    return <div className="mb-5 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">Links usage: <strong className="text-foreground">{usage.toLocaleString()}</strong> / unlimited</div>;
  }
  if (reached) {
    return (
      <div className="mb-5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-destructive">Link limit reached</p>
            <p className="text-xs text-muted-foreground mt-0.5">You are using {usage}/{limit} links. Upgrade your plan before creating another short link.</p>
          </div>
          <Button type="button" size="sm" onClick={onUpgrade}>Upgrade</Button>
        </div>
      </div>
    );
  }
  return (
    <div className={`mb-5 rounded-lg border px-4 py-3 text-sm ${near ? "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/20 dark:text-amber-200" : "bg-muted/30 text-muted-foreground"}`}>
      Links usage: <strong className={near ? "text-amber-900 dark:text-amber-100" : "text-foreground"}>{usage}/{limit}</strong>
      {remaining !== null && <span className="ml-1">— {remaining} remaining.</span>}
      {near && <span className="ml-1 font-medium">You are close to your plan limit.</span>}
    </div>
  );
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="flex items-center justify-center h-5 w-5 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0 mt-0.5">{number}</span>
      <span className="text-muted-foreground"><strong className="text-foreground">{title}</strong> — {text}</span>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, disabled }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; disabled?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="h-9 text-sm" disabled={disabled} />
    </div>
  );
}