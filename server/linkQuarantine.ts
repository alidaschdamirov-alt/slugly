import { AUDIT_EVENTS } from "../shared/audit-events";
import { writeAuditEvent } from "./audit";
import { getSiteSetting, setSiteSetting } from "./db";

export interface LinkQuarantineState {
  quarantined: true;
  reason: string;
  threatTypes: string[];
  source: "destination-update" | "scheduled-rescan" | "admin";
  createdAt: number;
  updatedAt: number;
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<number, { value: LinkQuarantineState | null; expiresAt: number }>();

function settingKey(linkId: number) {
  return `link_quarantine_${linkId}`;
}

export async function getLinkQuarantineState(linkId: number): Promise<LinkQuarantineState | null> {
  const cached = cache.get(linkId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const raw = await getSiteSetting(settingKey(linkId));
  let value: LinkQuarantineState | null = null;
  if (raw && raw !== "null") {
    try {
      const parsed = JSON.parse(raw) as LinkQuarantineState;
      if (parsed?.quarantined === true) value = parsed;
    } catch {
      value = null;
    }
  }

  cache.set(linkId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export async function quarantineLink(input: {
  linkId: number;
  shortCode?: string;
  reason: string;
  threatTypes?: string[];
  source: LinkQuarantineState["source"];
  actorId?: number;
  actorName?: string | null;
}) {
  const now = Date.now();
  const existing = await getLinkQuarantineState(input.linkId);
  const state: LinkQuarantineState = {
    quarantined: true,
    reason: input.reason,
    threatTypes: input.threatTypes || [],
    source: input.source,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  await setSiteSetting(settingKey(input.linkId), JSON.stringify(state));
  cache.set(input.linkId, { value: state, expiresAt: now + CACHE_TTL_MS });

  await writeAuditEvent({
    event: AUDIT_EVENTS.LINK_QUARANTINE,
    actorId: input.actorId ?? 0,
    actorName: input.actorName || "system",
    targetType: "link",
    targetId: input.linkId,
    payload: {
      shortCode: input.shortCode,
      source: input.source,
      reason: input.reason,
      threatTypes: input.threatTypes || [],
    },
  });

  return state;
}

export async function clearLinkQuarantine(input: {
  linkId: number;
  shortCode?: string;
  actorId?: number;
  actorName?: string | null;
  reason?: string;
}) {
  await setSiteSetting(settingKey(input.linkId), "null");
  cache.set(input.linkId, { value: null, expiresAt: Date.now() + CACHE_TTL_MS });

  await writeAuditEvent({
    event: AUDIT_EVENTS.LINK_RESUME,
    actorId: input.actorId ?? 0,
    actorName: input.actorName || "system",
    targetType: "link",
    targetId: input.linkId,
    payload: {
      shortCode: input.shortCode,
      source: "quarantine-release",
      reason: input.reason,
    },
  });
}
