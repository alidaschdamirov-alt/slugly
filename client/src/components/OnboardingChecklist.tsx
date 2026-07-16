import { Card } from "@/components/ui/card";
import { Check, Circle, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";

interface Step {
  label: string;
  done: boolean;
  href?: string;
}

interface OnboardingChecklistProps {
  steps: Step[];
  title?: string;
  subtitle?: string;
}

export function OnboardingChecklist({ steps, title = "Get started with Slugly", subtitle }: OnboardingChecklistProps) {
  const [, setLocation] = useLocation();
  const completedCount = steps.filter(s => s.done).length;
  const allDone = completedCount === steps.length;

  if (allDone) return null;

  return (
    <Card className="p-5 mb-6 border-primary/20 bg-primary/[0.03]">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-sm">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <span className="text-xs font-medium text-muted-foreground">
          {completedCount}/{steps.length}
        </span>
      </div>
      {/* Progress bar */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${(completedCount / steps.length) * 100}%` }}
        />
      </div>
      <div className="space-y-2">
        {steps.map((step, i) => {
          const isNext = !step.done && steps.slice(0, i).every(s => s.done);
          return (
            <button
              key={i}
              onClick={() => step.href && !step.done && setLocation(step.href)}
              disabled={step.done || !step.href}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors text-left ${
                step.done
                  ? "text-muted-foreground"
                  : isNext
                    ? "bg-primary/10 text-foreground hover:bg-primary/15 cursor-pointer"
                    : "text-muted-foreground"
              }`}
            >
              {step.done ? (
                <Check className="h-4 w-4 text-green-500 shrink-0" />
              ) : (
                <Circle className={`h-4 w-4 shrink-0 ${isNext ? "text-primary" : "text-muted-foreground/50"}`} />
              )}
              <span className={step.done ? "line-through" : ""}>{step.label}</span>
              {isNext && step.href && <ArrowRight className="h-3.5 w-3.5 ml-auto text-primary" />}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
