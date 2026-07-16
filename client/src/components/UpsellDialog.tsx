import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ArrowUpCircle, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import { PLAN_DISPLAY_NAMES } from "../../../shared/plans";

interface LimitReachedError {
  type: "LIMIT_REACHED";
  resource: string;
  limit: number;
  current: number;
  currentPlan: string;
  nextPlan: string | null;
}

const RESOURCE_LABELS: Record<string, string> = {
  projects: "projects",
  links: "links",
  domains: "custom domains",
  seats: "team members",
  analyticsRetentionDays: "analytics retention days",
};

export function parseLimitError(message: string): LimitReachedError | null {
  try {
    const parsed = JSON.parse(message);
    if (parsed?.type === "LIMIT_REACHED") return parsed;
  } catch {
    // not a JSON limit error
  }
  return null;
}

interface UpsellDialogProps {
  error: LimitReachedError | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UpsellDialog({ error, open, onOpenChange }: UpsellDialogProps) {
  const [, setLocation] = useLocation();

  if (!error) return null;

  const resourceLabel = RESOURCE_LABELS[error.resource] || error.resource;
  const currentPlanName = PLAN_DISPLAY_NAMES[error.currentPlan as keyof typeof PLAN_DISPLAY_NAMES] || error.currentPlan;
  const nextPlanName = error.nextPlan
    ? PLAN_DISPLAY_NAMES[error.nextPlan as keyof typeof PLAN_DISPLAY_NAMES] || error.nextPlan
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <ArrowUpCircle className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle className="text-lg">Limit Reached</DialogTitle>
          </div>
          <DialogDescription className="text-base leading-relaxed">
            You've reached the maximum of <strong>{error.limit} {resourceLabel}</strong> on the <strong>{currentPlanName}</strong> plan.
          </DialogDescription>
        </DialogHeader>

        {nextPlanName && (
          <div className="mt-4 p-4 rounded-lg bg-primary/5 border border-primary/10">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Upgrade to {nextPlanName}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Get more {resourceLabel} and unlock additional features by upgrading your plan.
            </p>
          </div>
        )}

        <div className="flex gap-3 mt-4">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Maybe Later
          </Button>
          <Button className="flex-1" onClick={() => { onOpenChange(false); setLocation("/billing"); }}>
            <ArrowUpCircle className="h-4 w-4 mr-2" />
            Upgrade Plan
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
