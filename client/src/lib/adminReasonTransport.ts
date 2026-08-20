export const DESTRUCTIVE_ADMIN_PROCEDURES: Record<string, string> = {
  "admin.suspendUser": "Reason for suspending this user",
  "admin.banUser": "Reason for banning this user",
  "admin.deleteUser": "Reason for permanently deleting this user",
  "admin.deleteLink": "Reason for permanently deleting this link",
  "admin.cleanupExpiredAnonymous": "Reason for bulk cleanup of expired anonymous links",
};

export class AdminActionReasonRequiredError extends Error {
  constructor() {
    super("Administrative action canceled: a reason is required.");
    this.name = "AdminActionReasonRequiredError";
  }
}

function extractProcedures(url: string): string[] {
  try {
    const parsed = new URL(url, typeof window !== "undefined" ? window.location.origin : "https://slugly.invalid");
    const marker = "/api/trpc/";
    const index = parsed.pathname.indexOf(marker);
    if (index < 0) return [];
    return decodeURIComponent(parsed.pathname.slice(index + marker.length))
      .split(",")
      .map(value => value.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function getPayload(parsed: any, index: number, batch: boolean): Record<string, unknown> | null {
  const entry = batch ? parsed?.[String(index)] : parsed;
  if (!entry || typeof entry !== "object") return null;
  if (entry.json && typeof entry.json === "object" && !Array.isArray(entry.json)) {
    return entry.json as Record<string, unknown>;
  }
  return entry as Record<string, unknown>;
}

export function injectAdminReasons(
  url: string,
  body: unknown,
  askReason: (label: string, procedure: string) => string | null
): unknown {
  const procedures = extractProcedures(url);
  if (procedures.length === 0 || typeof body !== "string" || body.length === 0) return body;
  if (!procedures.some(procedure => DESTRUCTIVE_ADMIN_PROCEDURES[procedure])) return body;

  let parsed: any;
  try {
    parsed = JSON.parse(body);
  } catch {
    return body;
  }

  const batch = procedures.length > 1 || Object.keys(parsed || {}).some(key => /^\d+$/.test(key));

  procedures.forEach((procedure, index) => {
    const label = DESTRUCTIVE_ADMIN_PROCEDURES[procedure];
    if (!label) return;
    const payload = getPayload(parsed, index, batch);
    if (!payload) return;
    if (typeof payload.reason === "string" && payload.reason.trim().length >= 3) return;

    const reason = askReason(label, procedure)?.trim() || "";
    if (reason.length < 3) throw new AdminActionReasonRequiredError();
    payload.reason = reason.slice(0, 1000);
  });

  return JSON.stringify(parsed);
}
