import { normalizeDestinationUrl } from "./validation/destination-url";

export type LinkStatus = "active" | "paused" | "scheduled" | "expired" | "broken" | "quarantine";

export interface LinkStatusInput {
  status?: "active" | "paused" | string | null;
  activeFrom?: number | string | Date | null;
  expiresAt?: number | string | Date | null;
  destinationUrl?: string | null;
  destinationInvalid?: boolean | number | null;
  quarantined?: boolean | number | null;
}

function toTimestamp(value: number | string | Date | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function isBrokenDestination(link: LinkStatusInput): boolean {
  if (link.destinationInvalid === true || link.destinationInvalid === 1) return true;
  if (!link.destinationUrl) return false;
  return normalizeDestinationUrl(link.destinationUrl) === null;
}

export function getLinkStatus(link: LinkStatusInput, now = Date.now()): LinkStatus {
  if (link.quarantined === true || link.quarantined === 1) return "quarantine";
  if (isBrokenDestination(link)) return "broken";
  if (link.status === "paused") return "paused";

  const activeFrom = toTimestamp(link.activeFrom);
  const expiresAt = toTimestamp(link.expiresAt);

  if (expiresAt && expiresAt <= now) return "expired";
  if (activeFrom && activeFrom > now) return "scheduled";
  return "active";
}

export function getLinkStatusLabel(status: LinkStatus): string {
  switch (status) {
    case "quarantine": return "Security quarantine";
    case "broken": return "Broken destination";
    case "paused": return "Paused";
    case "scheduled": return "Scheduled";
    case "expired": return "Expired";
    default: return "Active";
  }
}

export function getLinkStatusClass(status: LinkStatus): string {
  switch (status) {
    case "quarantine": return "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300";
    case "broken": return "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300";
    case "paused": return "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "scheduled": return "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "expired": return "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    default: return "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  }
}
