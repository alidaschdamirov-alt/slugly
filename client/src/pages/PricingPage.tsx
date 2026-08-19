import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles, Crown, Users, Zap, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";

const plans = [
  {
    key: "free",
    name: "Free",
    price: 0,
    description: "For getting started",
    icon: <Zap className="h-4 w-4" />,
    features: ["1 user project", "Up to 5 links", "30-day analytics", "Default Slugly domain", "1 seat"],
  },
  {
    key: "starter",
    name: "Starter",
    price: 9,
    description: "For solo creators",
    icon: <Sparkles className="h-4 w-4 text-blue-500" />,
    features: ["3 projects", "Unlimited links", "1-year analytics", "UTM templates", "Basic campaign dashboard", "Custom domains — coming soon"],
  },
  {
    key: "pro",
    name: "Pro",
    price: 24,
    description: "For marketing teams",
    icon: <Crown className="h-4 w-4 text-amber-500" />,
    badge: "Popular",
    features: ["Unlimited projects", "Unlimited links", "CSV export", "Bulk operations", "Geo/device targeting", "A/B testing", "3 seats", "Custom domains — coming soon"],
  },
  {
    key: "team",
    name: "Team",
    price: 79,
    description: "For organizations",
    icon: <Users className="h-4 w-4 text-purple-500" />,
    features: ["Everything in Pro", "2-year analytics", "White-label reports", "Extended roles", "10 seats", "Priority support", "Custom domains — coming soon"],
  },
];

export default function PricingPage() {
  const [, setLocation] = useLocation();

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 flex items-center justify-between gap-4">
          <button onClick={() => setLocation("/")} className="flex items-center gap-2 font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">S</span>
            Slugly
          </button>
          <Button onClick={() => setLocation("/auth")}>Get started</Button>
        </div>

        <section className="mx-auto mb-10 max-w-3xl text-center">
          <Badge variant="secondary" className="mb-4">Pricing</Badge>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">Simple plans for short links that need analytics.</h1>
          <p className="mt-4 text-muted-foreground">Start free, then upgrade when you need more links, campaigns, exports, roles, and client-ready reports.</p>
        </section>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => (
            <Card key={plan.key} className={`relative flex flex-col p-5 ${plan.key === "pro" ? "border-primary ring-1 ring-primary" : ""}`}>
              {plan.badge && <Badge className="absolute right-4 top-4 text-xs">{plan.badge}</Badge>}
              <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">{plan.icon}{plan.name}</h2>
              <p className="text-3xl font-bold">${plan.price}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
              <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
              <ul className="my-5 flex-1 space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Button variant={plan.key === "pro" ? "default" : "outline"} onClick={() => setLocation("/auth")}>
                Start with {plan.name}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Card>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">Stripe billing is not connected yet. Plan changes inside the app are currently internal workspace settings.</p>
      </div>
    </main>
  );
}
