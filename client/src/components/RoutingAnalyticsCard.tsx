import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FlaskConical, Globe, Monitor, Route } from "lucide-react";

type StatRow = {
  value: string | null;
  count: number;
};

type RoutingStats = {
  totalHumanClicks: number;
  countries: StatRow[];
  devices: StatRow[];
  variants: StatRow[];
};

type RoutingRule = {
  id: number;
  type: "geo" | "device" | "ab" | "deeplink" | "pixel";
  config: Record<string, any>;
  priority: number;
  enabled: boolean;
};

type Props = {
  rules?: RoutingRule[] | null;
  stats?: RoutingStats | null;
  days: number;
  onDaysChange?: (days: number) => void;
  onManage?: () => void;
};

function percent(count: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((count / total) * 100);
}

function countByValues(rows: StatRow[], values: string[]) {
  const wanted = new Set(values.map(value => value.toUpperCase()));
  return rows.reduce((sum, row) => {
    const value = (row.value || "").toUpperCase();
    return wanted.has(value) ? sum + Number(row.count || 0) : sum;
  }, 0);
}

function formatDestination(destination: string) {
  try {
    const parsed = new URL(destination);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    return `${parsed.hostname}${path}`;
  } catch {
    return destination;
  }
}

function MetricRow({
  label,
  destination,
  count,
  total,
  target,
}: {
  label: string;
  destination?: string;
  count: number;
  total: number;
  target?: number;
}) {
  const actual = percent(count, total);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-lg border bg-background px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          {typeof target === "number" && (
            <Badge variant="secondary" className="text-[10px]">
              target {target}%
            </Badge>
          )}
        </div>
        {destination && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground" title={destination}>
            → {formatDestination(destination)}
          </p>
        )}
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold tabular-nums">{count.toLocaleString()}</p>
        <p className="text-[11px] text-muted-foreground">{actual}%</p>
      </div>
    </div>
  );
}

export default function RoutingAnalyticsCard({
  rules,
  stats,
  days,
  onDaysChange,
  onManage,
}: Props) {
  const activeRules = (rules || []).filter(rule => rule.enabled);
  if (activeRules.length === 0) return null;

  const routingStats: RoutingStats = stats || {
    totalHumanClicks: 0,
    countries: [],
    devices: [],
    variants: [],
  };

  return (
    <Card className="p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 font-medium">
            <Route className="h-4 w-4 text-primary" />
            Routing Analytics
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Human traffic for the last {days} days. Country/device rows show traffic matching each condition; A/B rows show actual assigned variants.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onDaysChange && [7, 30, 90].map(option => (
            <Button
              key={option}
              type="button"
              variant={days === option ? "default" : "outline"}
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onDaysChange(option)}
            >
              {option}d
            </Button>
          ))}
          {onManage && (
            <Button type="button" variant="outline" size="sm" className="h-7" onClick={onManage}>
              Manage Routing
            </Button>
          )}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-muted/20 px-3 py-3">
          <p className="text-xs text-muted-foreground">Human clicks</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {routingStats.totalHumanClicks.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border bg-muted/20 px-3 py-3">
          <p className="text-xs text-muted-foreground">Active rules</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">{activeRules.length}</p>
        </div>
        <div className="col-span-2 rounded-lg border bg-muted/20 px-3 py-3 sm:col-span-1">
          <p className="text-xs text-muted-foreground">A/B assigned</p>
          <p className="mt-1 text-xl font-semibold tabular-nums">
            {routingStats.variants.reduce((sum, row) => sum + Number(row.count || 0), 0).toLocaleString()}
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {activeRules.map(rule => {
          if (rule.type === "geo") {
            const entries = Array.isArray(rule.config?.rules) ? rule.config.rules : [];
            const matchedCountries = new Set<string>();
            const rows = entries.map((entry: any, index: number) => {
              const countries = Array.isArray(entry?.countries)
                ? entry.countries.map((country: string) => String(country).toUpperCase())
                : [];
              countries.forEach((country: string) => matchedCountries.add(country));
              return {
                key: `${rule.id}-geo-${index}`,
                label: countries.join(", ") || "Country rule",
                destination: String(entry?.destination || ""),
                count: countByValues(routingStats.countries, countries),
              };
            });
            const matched = countByValues(routingStats.countries, Array.from(matchedCountries));
            const fallback = Math.max(routingStats.totalHumanClicks - matched, 0);

            return (
              <section key={rule.id}>
                <div className="mb-2 flex items-center gap-2">
                  <Globe className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-medium">Country routing</h4>
                  <Badge variant="outline" className="text-[10px]">priority {rule.priority}</Badge>
                </div>
                <div className="space-y-2">
                  {rows.map(row => (
                    <MetricRow
                      key={row.key}
                      label={row.label}
                      destination={row.destination}
                      count={row.count}
                      total={routingStats.totalHumanClicks}
                    />
                  ))}
                  {rule.config?.fallback && (
                    <MetricRow
                      label="Fallback / other countries"
                      destination={String(rule.config.fallback)}
                      count={fallback}
                      total={routingStats.totalHumanClicks}
                    />
                  )}
                </div>
              </section>
            );
          }

          if (rule.type === "device") {
            const entries = Array.isArray(rule.config?.rules) ? rule.config.rules : [];
            const matchedDevices = new Set<string>();
            const rows = entries.map((entry: any, index: number) => {
              const devices = Array.isArray(entry?.devices)
                ? entry.devices.map((device: string) => String(device).toLowerCase())
                : [];
              devices.forEach((device: string) => matchedDevices.add(device.toUpperCase()));
              return {
                key: `${rule.id}-device-${index}`,
                label: devices.join(", ") || "Device rule",
                destination: String(entry?.destination || ""),
                count: countByValues(routingStats.devices, devices),
              };
            });
            const matched = countByValues(routingStats.devices, Array.from(matchedDevices));
            const fallback = Math.max(routingStats.totalHumanClicks - matched, 0);

            return (
              <section key={rule.id}>
                <div className="mb-2 flex items-center gap-2">
                  <Monitor className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-medium">Device routing</h4>
                  <Badge variant="outline" className="text-[10px]">priority {rule.priority}</Badge>
                </div>
                <div className="space-y-2">
                  {rows.map(row => (
                    <MetricRow
                      key={row.key}
                      label={row.label}
                      destination={row.destination}
                      count={row.count}
                      total={routingStats.totalHumanClicks}
                    />
                  ))}
                  {rule.config?.fallback && (
                    <MetricRow
                      label="Fallback / other devices"
                      destination={String(rule.config.fallback)}
                      count={fallback}
                      total={routingStats.totalHumanClicks}
                    />
                  )}
                </div>
              </section>
            );
          }

          if (rule.type === "ab") {
            const variants = Array.isArray(rule.config?.variants) ? rule.config.variants : [];
            const assignedTotal = routingStats.variants.reduce(
              (sum, row) => sum + Number(row.count || 0),
              0
            );
            const totalWeight = variants.reduce(
              (sum: number, variant: any) => sum + Number(variant?.weight || 0),
              0
            );

            return (
              <section key={rule.id}>
                <div className="mb-2 flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-primary" />
                  <h4 className="text-sm font-medium">A/B destination test</h4>
                  <Badge variant="outline" className="text-[10px]">priority {rule.priority}</Badge>
                </div>
                <div className="space-y-2">
                  {variants.map((variant: any, index: number) => {
                    const name = String(variant?.name || `Variant ${index + 1}`);
                    const matched = routingStats.variants.find(
                      row => String(row.value || "") === name
                    );
                    const target = totalWeight > 0
                      ? Math.round((Number(variant?.weight || 0) / totalWeight) * 100)
                      : undefined;
                    return (
                      <MetricRow
                        key={`${rule.id}-ab-${name}`}
                        label={name}
                        destination={String(variant?.destination || "")}
                        count={Number(matched?.count || 0)}
                        total={assignedTotal}
                        target={target}
                      />
                    );
                  })}
                </div>
              </section>
            );
          }

          return (
            <section key={rule.id} className="rounded-lg border bg-muted/20 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium capitalize">{rule.type.replace("deeplink", "Deep link")} rule</p>
                  <p className="text-xs text-muted-foreground">
                    Active with priority {rule.priority}. Detailed outcome reporting for this rule type is not yet available.
                  </p>
                </div>
                <Badge variant="secondary">Active</Badge>
              </div>
            </section>
          );
        })}
      </div>
    </Card>
  );
}
