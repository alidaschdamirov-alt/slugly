import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function FeatureAccessSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("p-8 border-dashed", className)}>
      <div className="flex flex-col items-center text-center gap-4">
        <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
        <div className="space-y-2 w-full max-w-md">
          <div className="mx-auto h-4 w-48 rounded bg-muted animate-pulse" />
          <div className="mx-auto h-3 w-72 max-w-full rounded bg-muted animate-pulse" />
          <div className="mx-auto h-3 w-56 max-w-full rounded bg-muted animate-pulse" />
        </div>
        <div className="h-9 w-28 rounded-md bg-muted animate-pulse" />
      </div>
    </Card>
  );
}

export function FormPageSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("p-6", className)}>
      <div className="space-y-5">
        <div className="space-y-2">
          <div className="h-3 w-24 rounded bg-muted animate-pulse" />
          <div className="h-10 w-full rounded-md bg-muted animate-pulse" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="h-3 w-24 rounded bg-muted animate-pulse" />
            <div className="h-10 w-full rounded-md bg-muted animate-pulse" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-20 rounded bg-muted animate-pulse" />
            <div className="h-10 w-full rounded-md bg-muted animate-pulse" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-3 w-32 rounded bg-muted animate-pulse" />
          <div className="h-24 w-full rounded-md bg-muted animate-pulse" />
        </div>
        <div className="h-10 w-full rounded-md bg-muted animate-pulse" />
      </div>
    </Card>
  );
}

export function ListPageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <Card key={index} className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted animate-pulse" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-48 max-w-full rounded bg-muted animate-pulse" />
              <div className="h-3 w-64 max-w-full rounded bg-muted animate-pulse" />
            </div>
            <div className="hidden h-8 w-20 rounded-md bg-muted animate-pulse sm:block" />
          </div>
        </Card>
      ))}
    </div>
  );
}
