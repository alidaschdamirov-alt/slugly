import { useQuery } from "@tanstack/react-query";

export interface LinkQuarantineState {
  quarantined: true;
  reason: string;
  threatTypes: string[];
  source: "destination-update" | "scheduled-rescan" | "admin";
  createdAt: number;
  updatedAt: number;
}

export type LinkSecurityStates = Record<number, LinkQuarantineState>;

async function fetchLinkSecurityStates(ids: number[]): Promise<LinkSecurityStates> {
  if (ids.length === 0) return {};
  const params = new URLSearchParams({ ids: ids.join(",") });
  const response = await fetch(`/api/security/links?${params.toString()}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error("Unable to load link security state.");
  }
  const data = (await response.json()) as { states?: LinkSecurityStates };
  return data.states || {};
}

export function useLinkSecurityStates(ids: number[], enabled = true) {
  const stableIds = Array.from(new Set(ids.filter(id => Number.isInteger(id) && id > 0)))
    .sort((a, b) => a - b)
    .slice(0, 200);
  const key = stableIds.join(",");

  return useQuery({
    queryKey: ["link-security-states", key],
    queryFn: () => fetchLinkSecurityStates(stableIds),
    enabled: enabled && stableIds.length > 0,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });
}

export function applyLinkSecurityState<T extends { id: number }>(
  link: T,
  states: LinkSecurityStates | undefined
): T & { quarantined: boolean; quarantine?: LinkQuarantineState } {
  const quarantine = states?.[link.id];
  return {
    ...link,
    quarantined: !!quarantine,
    ...(quarantine ? { quarantine } : {}),
  };
}
