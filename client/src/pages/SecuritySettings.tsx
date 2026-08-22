import { useAuth } from "@/_core/hooks/useAuth";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getLoginUrl } from "@/const";
import { UserProfile } from "@clerk/react";
import { Loader2, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";

export default function SecuritySettings() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-md p-6 text-center">
          <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-primary" />
          <h1 className="text-xl font-semibold">Sign in to manage security</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your Slugly security settings are available after authentication.
          </p>
          <Button className="mt-5" onClick={() => (window.location.href = getLoginUrl())}>
            Sign in
          </Button>
        </Card>
      </div>
    );
  }

  const privileged = user.role === "admin" || user.role === "support";

  return (
    <AppShell>
      <div className="mb-6 flex items-center gap-3">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Security & 2FA</h1>
          <p className="text-sm text-muted-foreground">
            Manage your password, sign-in methods, active devices, and two-factor authentication.
          </p>
        </div>
      </div>

      <div className="mb-6 max-w-3xl">
        <Card className="p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Two-factor authentication</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Open the Security section below, choose an authenticator app, scan the QR code,
                and confirm the six-digit code. After enrollment, sign out and sign back in before
                opening privileged tools.
              </p>
            </div>
            {privileged ? (
              <Button variant="outline" onClick={() => setLocation("/admin")}>
                Open Admin Panel
              </Button>
            ) : null}
          </div>
        </Card>
      </div>

      <div className="max-w-5xl overflow-x-auto pb-4">
        <UserProfile routing="hash">
          <UserProfile.Page label="security" />
          <UserProfile.Page label="account" />
        </UserProfile>
      </div>
    </AppShell>
  );
}
