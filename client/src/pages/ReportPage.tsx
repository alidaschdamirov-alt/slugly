import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { useSearch } from "wouter";
import { toast } from "sonner";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";

export default function ReportPage() {
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const prefilledCode = params.get("code") || "";

  const [shortCode, setShortCode] = useState(prefilledCode);
  const [reason, setReason] = useState("");
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance | null>(null);

  const submitReport = trpc.abuseReport.submit.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      toast.success("Report submitted. Thank you.");
    },
    onError: (err) => {
      toast.error(err.message);
      // Reset captcha on error so user can retry
      turnstileRef.current?.reset();
      setCaptchaToken(null);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shortCode.trim()) return;
    if (TURNSTILE_SITE_KEY && !captchaToken) {
      toast.error("Please complete the CAPTCHA verification.");
      return;
    }
    submitReport.mutate({
      shortCode: shortCode.trim(),
      reason: reason || undefined,
      reporterEmail: email || undefined,
      captchaToken: captchaToken || undefined,
    });
  };

  const handleCaptchaSuccess = useCallback((token: string) => {
    setCaptchaToken(token);
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle className="h-6 w-6 text-amber-600" />
          </div>
          <h1 className="text-xl font-semibold">Report a Link</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Help keep Slugly safe. Report links that are malicious, phishing, or violate our policies.
          </p>
        </div>

        {submitted ? (
          <Card className="p-8 text-center">
            <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
              <Check className="h-6 w-6 text-green-600" />
            </div>
            <h2 className="text-lg font-semibold mb-2">Report Submitted</h2>
            <p className="text-sm text-muted-foreground">
              We'll review this link and take action if it violates our policies. Thank you for helping keep the web safe.
            </p>
          </Card>
        ) : (
          <Card className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Short Code *</Label>
                <Input
                  value={shortCode}
                  onChange={e => setShortCode(e.target.value)}
                  placeholder="abc123"
                  required
                />
                <p className="text-xs text-muted-foreground">The short code from the URL (e.g., the "abc123" part)</p>
              </div>

              <div className="space-y-2">
                <Label>Reason (optional)</Label>
                <Textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Why is this link harmful? (phishing, malware, spam, etc.)"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Your Email (optional)</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
                <p className="text-xs text-muted-foreground">We'll notify you when we take action</p>
              </div>

              {TURNSTILE_SITE_KEY && (
                <div className="flex justify-center">
                  <Turnstile
                    ref={turnstileRef}
                    siteKey={TURNSTILE_SITE_KEY}
                    onSuccess={handleCaptchaSuccess}
                    onExpire={() => setCaptchaToken(null)}
                    options={{ theme: "light", size: "normal" }}
                  />
                </div>
              )}

              <Button type="submit" className="w-full" disabled={submitReport.isPending || !shortCode.trim() || (!!TURNSTILE_SITE_KEY && !captchaToken)}>
                {submitReport.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <AlertTriangle className="h-4 w-4 mr-2" />}
                Submit Report
              </Button>
            </form>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground mt-4">
          <a href="/" className="text-primary hover:underline">← Back to Slugly</a>
        </p>
      </div>
    </div>
  );
}
