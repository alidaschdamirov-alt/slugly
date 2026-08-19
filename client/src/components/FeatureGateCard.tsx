import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpCircle, Lock, Sparkles } from "lucide-react";
import { useLocation } from "wouter";

interface FeatureGateCardProps {
  title: string;
  description: string;
  requiredPlan?: "Starter" | "Pro" | "Team";
  featureLabel?: string;
  compact?: boolean;
}

export default function FeatureGateCard({
  title,
  description,
  requiredPlan = "Pro",
  featureLabel,
  compact = false,
}: FeatureGateCardProps) {
  const [, setLocation] = useLocation();

  return (
    <Card className={compact ? "p-4 border-dashed" : "p-8 text-center border-dashed"}>
      <div className={compact ? "flex items-start gap-3" : "flex flex-col items-center"}>
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Lock className="h-5 w-5 text-primary" />
        </div>
        <div className={compact ? "min-w-0 flex-1" : "mt-3 max-w-md"}>
          <div className={compact ? "flex items-center gap-2 flex-wrap" : "flex items-center justify-center gap-2 flex-wrap"}>
            <h3 className="font-semibold">{title}</h3>
            <Badge variant="secondary" className="gap-1">
              <Sparkles className="h-3 w-3" />
              {requiredPlan}
            </Badge>
          </div>
          {featureLabel && (
            <p className="text-xs text-muted-foreground mt-1">Feature: {featureLabel}</p>
          )}
          <p className="text-sm text-muted-foreground mt-2">{description}</p>
          <Button
            className={compact ? "mt-3" : "mt-5"}
            size={compact ? "sm" : "default"}
            onClick={() => setLocation("/billing")}
          >
            <ArrowUpCircle className="h-4 w-4 mr-2" />
            View Plans
          </Button>
        </div>
      </div>
    </Card>
  );
}
