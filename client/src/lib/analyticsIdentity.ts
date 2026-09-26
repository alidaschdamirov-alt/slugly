export type AnalyticsIdPrefix = "user" | "ws";

export function normalizeAnalyticsId(prefix: AnalyticsIdPrefix, value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return raw.startsWith(`${prefix}_`) ? raw : `${prefix}_${raw}`;
}

export function normalizeAnalyticsTraits(traits?: Record<string, unknown>) {
  if (!traits) return undefined;
  return Object.fromEntries(
    Object.entries(traits)
      .map(([key, value]) => {
        if ((key === "workspaceId" || key === "workspace_id") && value != null) {
          return [key, normalizeAnalyticsId("ws", value) ?? undefined];
        }
        return [key, value];
      })
      .filter(([, value]) => value !== undefined),
  );
}
