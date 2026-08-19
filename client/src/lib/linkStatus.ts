export type LinkScheduleStatus = "active" | "paused" | "scheduled" | "expired";

export interface LinkScheduleInput {
  status?: "active" | "paused" | string | null;
  activeFrom?: number | string | Date | null;
  expiresAt?: number | string | Date | null;
}

function toTimestamp(value: number | string | Date | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

export function getEffectiveLinkStatus(link: LinkScheduleInput, now = Date.now()): LinkScheduleStatus {
  if (link.status === "paused") return "paused";

  const activeFrom = toTimestamp(link.activeFrom);
  const expiresAt = toTimestamp(link.expiresAt);

  if (expiresAt && expiresAt <= now) return "expired";
  if (activeFrom && activeFrom > now) return "scheduled";
  return "active";
}

export function getEffectiveStatusLabel(status: LinkScheduleStatus): string {
  switch (status) {
    case "paused": return "Paused";
    case "scheduled": return "Scheduled";
    case "expired": return "Expired";
    default: return "Active";
  }
}

export function getEffectiveStatusClass(status: LinkScheduleStatus): string {
  switch (status) {
    case "paused": return "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "scheduled": return "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "expired": return "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    default: return "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  }
}
