import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check, Copy, ExternalLink, Smartphone, Store, Globe2, BarChart3 } from "lucide-react";
import { useState } from "react";

type Props = {
  customDomain?: string | null;
  shortCode?: string | null;
  config?: Record<string, any> | null;
};

function StatusBadge({ ready, label }: { ready: boolean; label: string }) {
  return (
    <Badge variant={ready ? "default" : "secondary"} className="text-[10px]">
      {ready ? "Ready" : "Setup needed"} · {label}
    </Badge>
  );
}

export default function MobileDeepLinkGuide({ customDomain, shortCode, config }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const ios = config?.ios || {};
  const android = config?.android || {};
  const iosNativeReady = !!(customDomain && ios.teamId && ios.bundleId);
  const androidNativeReady = !!(customDomain && android.packageName && android.sha256CertFingerprints?.length);
  const callbackHost = customDomain ? `https://${customDomain}` : "https://slugly.io";
  const callbackUrl = `${callbackHost}/api/deeplinks/events`;
  const exampleCode = shortCode || "your-code";
  const callbackBody = JSON.stringify({
    shortCode: exampleCode,
    sessionId: "<slugly_dl_session from incoming link>",
    event: "app_open",
    platform: "<ios | android>",
    source: "app",
  }, null, 2);

  const copy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  const flow = [
    { icon: ExternalLink, title: "1. Visitor taps", text: "One short Slugly URL" },
    { icon: Smartphone, title: "2. App opens", text: "Universal/App Link or app scheme" },
    { icon: Store, title: "3. Store fallback", text: "If the app is not installed" },
    { icon: Globe2, title: "4. Web fallback", text: "Final safe destination" },
  ];

  return (
    <Card className="p-5">
      <div className="mb-4">
        <h3 className="flex items-center gap-2 font-medium">
          <Smartphone className="h-4 w-4 text-primary" />
          Mobile Deep Links
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          One short link opens the right mobile app when possible, then falls back to the App Store / Play Store and finally the web.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {flow.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-lg border bg-muted/20 p-3">
            <Icon className="mb-2 h-4 w-4 text-primary" />
            <p className="text-xs font-medium">{title}</p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{text}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">iOS</p>
            <StatusBadge ready={iosNativeReady} label="Universal Links" />
          </div>
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            <p>App scheme: {ios.scheme ? "configured" : "optional / missing"}</p>
            <p>Store fallback: {ios.appStoreUrl ? "configured" : "optional / missing"}</p>
            <p>Team ID + Bundle ID: {ios.teamId && ios.bundleId ? "configured" : "needed for Universal Links"}</p>
          </div>
        </div>

        <div className="rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Android</p>
            <StatusBadge ready={androidNativeReady} label="App Links" />
          </div>
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            <p>App scheme: {android.scheme ? "configured" : "optional / missing"}</p>
            <p>Store fallback: {android.playStoreUrl ? "configured" : "optional / missing"}</p>
            <p>Package + SHA-256: {android.packageName && android.sha256CertFingerprints?.length ? "configured" : "needed for App Links"}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-lg border bg-muted/20 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium">
              <BarChart3 className="h-4 w-4 text-primary" />
              App-open tracking
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              The browser automatically tracks attempts and store/web fallbacks. To measure real app opens, your app sends one callback after it handles the deep link.
            </p>
          </div>
          <Badge variant="outline">Callback API</Badge>
        </div>

        <div className="mt-3 space-y-3">
          <div>
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">POST endpoint</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1.5 text-xs" title={callbackUrl}>{callbackUrl}</code>
              <Button type="button" size="icon" variant="outline" className="h-8 w-8" onClick={() => copy("url", callbackUrl)}>
                {copied === "url" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          <div>
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">JSON body</p>
            <div className="relative">
              <pre className="overflow-x-auto rounded bg-background p-3 text-[11px] leading-5">{callbackBody}</pre>
              <Button type="button" size="icon" variant="outline" className="absolute right-2 top-2 h-7 w-7" onClick={() => copy("body", callbackBody)}>
                {copied === "body" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
          </div>

          <p className="text-[11px] leading-4 text-muted-foreground">
            Slugly adds <code>slugly_dl_session</code> and <code>slugly_code</code> to app-scheme, store, and web fallback URLs. Read these values in the app and send the callback with event <code>app_open</code>. For a native Universal/App Link that opens before Slugly loads, the app can generate its own session ID and still report the short code.
          </p>
        </div>
      </div>

      {customDomain ? (
        <div className="mt-4 rounded-lg border p-3 text-xs text-muted-foreground">
          Native association files are served automatically on <strong>{customDomain}</strong>:
          <code className="mt-2 block break-all">https://{customDomain}/.well-known/apple-app-site-association</code>
          <code className="mt-1 block break-all">https://{customDomain}/.well-known/assetlinks.json</code>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
          Custom schemes, store fallback, and web fallback work now. A verified custom domain is required for Apple Universal Links and Android App Links.
        </div>
      )}
    </Card>
  );
}
