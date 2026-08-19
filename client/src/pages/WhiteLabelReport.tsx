import { useAuth } from "@/_core/hooks/useAuth";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import FeatureGateCard from "@/components/FeatureGateCard";
import { Loader2, Palette, Save, Upload } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";

export default function WhiteLabelReport() {
  const { user, loading: authLoading } = useAuth();
  const { data: billingStatus, isLoading: billingLoading } = trpc.billing.status.useQuery(undefined, { enabled: !!user });
  const canUseBranding = billingStatus?.planConfig?.features?.whiteLabelReports === true;
  const { data: branding, isLoading } = trpc.branding.get.useQuery(undefined, {
    enabled: !!user && canUseBranding,
  });
  const utils = trpc.useUtils();

  const [logoUrl, setLogoUrl] = useState("");
  const [brandColor, setBrandColor] = useState("#5A3FF0");
  const [companyName, setCompanyName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [website, setWebsite] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (branding) {
      setLogoUrl(branding.logoUrl || "");
      setBrandColor(branding.brandColor || "#5A3FF0");
      setCompanyName(branding.companyName || "");
      setContactEmail(branding.contactEmail || "");
      setWebsite(branding.website || "");
    }
  }, [branding]);

  const updateBranding = trpc.branding.update.useMutation({
    onSuccess: () => {
      toast.success("Branding saved");
      utils.branding.get.invalidate();
    },
    onError: err => {
      if (err.message.includes("requires Team")) {
        toast.error("White-label branding requires Team plan.");
      } else {
        toast.error(err.message);
      }
    },
  });

  const uploadLogo = trpc.branding.uploadLogo.useMutation({
    onSuccess: data => {
      setLogoUrl(data.logoUrl);
      toast.success("Logo uploaded");
      utils.branding.get.invalidate();
    },
    onError: err => {
      if (err.message.includes("requires Team")) {
        toast.error("White-label branding requires Team plan.");
      } else {
        toast.error(err.message);
      }
    },
  });

  if (authLoading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  if (!user) {
    window.location.href = getLoginUrl();
    return null;
  }

  const handleSave = () => {
    if (!canUseBranding) {
      toast.info("White-label branding requires Team plan.");
      return;
    }
    updateBranding.mutate({
      logoUrl: logoUrl || null,
      brandColor,
      companyName: companyName || null,
      contactEmail: contactEmail || null,
      website: website || null,
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canUseBranding) {
      toast.info("White-label branding requires Team plan.");
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be under 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadLogo.mutate({
        base64,
        filename: file.name,
        contentType: file.type,
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Palette className="h-5 w-5" />
            White-Label Branding
          </h1>
          <p className="text-muted-foreground mt-1">
            Customize branding for exported reports. Your agency's identity
            replaces Slugly in all generated reports. (Team plan)
          </p>
        </div>

        {billingLoading ? (
          <Card className="p-8 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Checking plan access...
          </Card>
        ) : !canUseBranding ? (
          <FeatureGateCard
            title="White-label branding requires Team"
            description="Customize reports with your company name, logo, color palette, contact email, and website for client-ready deliverables."
            requiredPlan="Team"
            featureLabel="White-label branding"
          />
        ) : (
          <Card className="p-6">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label>Company Name</Label>
                  <Input
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    placeholder="Your Agency Name"
                  />
                  <p className="text-xs text-muted-foreground">
                    Displayed in report headers instead of "Slugly"
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Logo</Label>
                  <div className="flex items-center gap-3">
                    {logoUrl && (
                      <img
                        src={logoUrl}
                        alt="Logo"
                        className="h-10 max-w-[140px] object-contain border rounded p-1"
                      />
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadLogo.isPending}
                    >
                      {uploadLogo.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <Upload className="h-4 w-4 mr-1" />
                      )}
                      Upload Logo
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Recommended: 400x100px PNG with transparent background. Max
                    2MB.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Brand Color</Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={brandColor}
                      onChange={e => setBrandColor(e.target.value)}
                      className="h-9 w-12 rounded border cursor-pointer"
                    />
                    <Input
                      value={brandColor}
                      onChange={e => setBrandColor(e.target.value)}
                      className="w-28 font-mono"
                      maxLength={7}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Used for accents, chart colors, and headers in reports
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Contact Email (optional)</Label>
                  <Input
                    value={contactEmail}
                    onChange={e => setContactEmail(e.target.value)}
                    placeholder="reports@youragency.com"
                    type="email"
                  />
                  <p className="text-xs text-muted-foreground">
                    Shown in report footer for client inquiries
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Website (optional)</Label>
                  <Input
                    value={website}
                    onChange={e => setWebsite(e.target.value)}
                    placeholder="https://youragency.com"
                  />
                  <p className="text-xs text-muted-foreground">
                    Linked in report footer
                  </p>
                </div>

                {/* Preview */}
                <div className="border rounded-lg p-4 mt-4">
                  <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">
                    Report Header Preview
                  </p>
                  <div
                    className="flex items-center gap-3 pb-3 border-b"
                    style={{ borderColor: brandColor }}
                  >
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt="Logo"
                        className="h-8 max-w-[120px] object-contain"
                      />
                    ) : (
                      <div
                        className="h-8 w-8 rounded"
                        style={{ backgroundColor: brandColor }}
                      />
                    )}
                    <span className="font-semibold">
                      {companyName || "Your Agency"}
                    </span>
                  </div>
                  <div className="mt-3 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">
                      Campaign Performance Report
                    </p>
                    <p className="text-xs mt-1">
                      Period: Jun 1 – Jun 21, 2026 • Generated:{" "}
                      {new Date().toLocaleDateString()}
                    </p>
                  </div>
                  {(contactEmail || website) && (
                    <div className="mt-3 pt-2 border-t text-xs text-muted-foreground">
                      {contactEmail && <span>{contactEmail}</span>}
                      {contactEmail && website && <span className="mx-2">•</span>}
                      {website && <span>{website}</span>}
                    </div>
                  )}
                </div>

                <Button
                  onClick={handleSave}
                  disabled={updateBranding.isPending}
                  className="w-full"
                >
                  {updateBranding.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Branding
                </Button>
              </div>
            )}
          </Card>
        )}
      </div>
    </AppShell>
  );
}
