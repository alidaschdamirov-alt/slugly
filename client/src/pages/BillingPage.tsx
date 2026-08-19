import { useAuth } from "@/_core/hooks/useAuth";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import { Check, Loader2, Sparkles, AlertTriangle, CreditCard, ExternalLink, Crown, Users, Zap } from "lucide-react";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";

interface PlanTier {
  key: "free" | "starter" | "pro" | "team";
  name: string;
  price: number;
  description: string;
  icon: React.ReactNode;
  features: string[];
}

const PLAN_TIERS: PlanTier[] = [
  {
    key: "free",
    name: "Free",
    price: 0,
    description: "For getting started",
    icon: <Zap className="h-4 w-4" />,
    features: [
      "1 project",
      "Up to 5 links",
      "30-day analytics",
      "Default domain only",
      "1 seat",
    ],
  },
  {
    key: "starter",
    name: "Starter",
    price: 9,
    description: "For solo creators",
    icon: <Sparkles className="h-4 w-4 text-blue-500" />,
    features: [
      "3 projects",
      "Unlimited links",
      "1-year analytics",
      "Custom domains — coming soon",
      "UTM templates",
      "Basic campaign dashboard",
      "1 seat",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    price: 24,
    description: "For marketing teams",
    icon: <Crown className="h-4 w-4 text-amber-500" />,
    features: [
      "Unlimited projects",
      "Unlimited links",
      "1-year analytics",
      "Custom domains — coming soon",
      "Full campaign dashboard",
      "CSV export",
      "Bulk operations",
      "Geo/device targeting",
      "A/B testing",
      "Deep links & pixels",
      "3 seats",
    ],
  },
  {
    key: "team",
    name: "Team",
    price: 79,
    description: "For organizations",
    icon: <Users className="h-4 w-4 text-purple-500" />,
    features: [
      "Everything in Pro",
      "Custom domains — coming soon",
      "2-year analytics",
      "White-label reports",
      "Extended roles (viewer/editor)",
      "10 seats",
      "Priority support",
    ],
  },
];

export default function BillingPage() {
  const { user, loading: authLoading } = useAuth();
  const { data: billing, isLoading } = trpc.billing.status.useQuery(undefined, { enabled: !!user });
  const utils = trpc.useUtils();

  const changePlan = trpc.billing.changePlan.useMutation({
    onSuccess: (data) => {
      toast.success(`Plan changed to ${data.plan}!`);
      utils.billing.status.invalidate();
      utils.auth.me.invalidate();
      utils.workspace.current.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!user) { window.location.href = getLoginUrl(); return null; }

  const currentPlan = (billing?.plan || "free") as PlanTier["key"];
  const usage = billing?.usage;
  const planConfig = billing?.planConfig;

  // Determine if over limits (for downgrade warning)
  const isOverLimit = usage && planConfig && (
    (planConfig.limits.projects !== -1 && usage.projects > planConfig.limits.projects) ||
    (planConfig.limits.links !== -1 && usage.links > planConfig.limits.links)
  );

  const planOrder = ["free", "starter", "pro", "team"];
  const currentIndex = planOrder.indexOf(currentPlan);

  const handleChangePlan = (plan: PlanTier["key"]) => {
    if (plan === currentPlan) return;
    const targetIndex = planOrder.indexOf(plan);
    const action = targetIndex > currentIndex ? "upgrade" : "downgrade";
    trackEvent(`${action}_clicked`, { from: currentPlan, to: plan });
    changePlan.mutate({ plan });
  };

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
          <p className="text-muted-foreground mt-1">Manage your workspace plan</p>
        </div>

        <Card className="p-4 mb-6 border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-900/10">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-yellow-800 dark:text-yellow-300">Custom domain routing is coming soon</p>
              <p className="text-yellow-700 dark:text-yellow-400 mt-1">
                Domains can be verified now, but paid plans do not rely on custom-domain traffic routing until the routing infrastructure is live.
              </p>
            </div>
          </div>
        </Card>

        {/* Downgrade Warning */}
        {isOverLimit && (
          <Card className="p-5 mb-6 border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium text-amber-800 dark:text-amber-200 mb-1">Over Plan Limits</h3>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  You have {usage.projects} project{usage.projects !== 1 ? "s" : ""} and {usage.links} link{usage.links !== 1 ? "s" : ""},
                  which exceeds your current plan limits.
                  Excess resources are <strong>frozen as read-only</strong> — links still redirect but cannot be edited.
                  Upgrade to restore full access.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Payment Failed Notice */}
        {billing?.paymentFailed && (
          <Card className="p-5 mb-6 border-destructive/50 bg-destructive/5">
            <div className="flex items-start gap-3">
              <CreditCard className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <h3 className="font-medium text-destructive mb-1">Payment Failed</h3>
                <p className="text-sm text-muted-foreground">
                  Your last payment attempt failed. Please update your payment method to avoid downgrade.
                </p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => toast.info("Stripe Customer Portal coming soon")}>
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Update Payment Method
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* 4-Tier Plan Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {PLAN_TIERS.map((tier) => {
            const isCurrent = currentPlan === tier.key;
            const tierIndex = planOrder.indexOf(tier.key);
            const isUpgrade = tierIndex > currentIndex;
            const isDowngrade = tierIndex < currentIndex;

            return (
              <Card key={tier.key} className={`p-5 flex flex-col ${isCurrent ? "border-primary ring-1 ring-primary" : ""}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold flex items-center gap-1.5">
                    {tier.icon}
                    {tier.name}
                  </h3>
                  {isCurrent && <Badge variant="default" className="text-xs">Current</Badge>}
                </div>
                <p className="text-2xl font-bold mb-0.5">
                  ${tier.price}<span className="text-sm font-normal text-muted-foreground">/mo</span>
                </p>
                <p className="text-xs text-muted-foreground mb-4">{tier.description}</p>
                <ul className="space-y-2 mb-5 flex-1">
                  {tier.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {isCurrent ? (
                  <Button variant="outline" className="w-full" disabled>Current Plan</Button>
                ) : isUpgrade ? (
                  <Button className="w-full" onClick={() => handleChangePlan(tier.key)} disabled={changePlan.isPending}>
                    {changePlan.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    Upgrade
                  </Button>
                ) : (
                  <Button variant="outline" className="w-full" onClick={() => handleChangePlan(tier.key)} disabled={changePlan.isPending}>
                    {changePlan.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    Switch
                  </Button>
                )}
              </Card>
            );
          })}
        </div>

        {/* Usage Summary */}
        {usage && planConfig && (
          <Card className="p-6 mt-6">
            <h3 className="font-medium mb-4">Current Usage</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <UsageStat label="Projects" current={usage.projects} limit={planConfig.limits.projects} />
              <UsageStat label="Links" current={usage.links} limit={planConfig.limits.links} />
              <UsageStat label="Domains" current={usage.domains} limit={planConfig.limits.domains} />
              <UsageStat label="Seats" current={usage.members} limit={planConfig.limits.seats} />
            </div>
          </Card>
        )}

        <p className="text-xs text-muted-foreground mt-6 text-center">
          Plan changes take effect immediately. On downgrade, excess resources become read-only (links still redirect).
          Stripe billing integration coming soon for automated payments.
        </p>
      </div>
    </AppShell>
  );
}

function UsageStat({ label, current, limit }: { label: string; current: number; limit: number }) {
  const isUnlimited = limit === -1;
  const isOver = !isUnlimited && current > limit;
  return (
    <div className={`p-3 rounded-lg border ${isOver ? "border-amber-500/50 bg-amber-50 dark:bg-amber-950/20" : "bg-muted/30"}`}>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-lg font-semibold ${isOver ? "text-amber-600" : ""}`}>
        {current}{" "}
        <span className="text-xs font-normal text-muted-foreground">
          / {isUnlimited ? "∞" : limit}
        </span>
      </p>
    </div>
  );
}
