import { eq } from "drizzle-orm";
import { links } from "../drizzle/schema";
import { AUDIT_EVENTS } from "../shared/audit-events";
import { writeAuditEvent } from "./audit";
import {
  createNotification,
  createNotificationRecipients,
  getDb,
} from "./db";
import { quarantineLink } from "./linkQuarantine";
import { invalidateLinkCache } from "./redirect";
import { checkUrlSafety, type SafetyResult } from "./safeBrowsing";
import { notifyOwner } from "./_core/notification";

export interface RescanCandidate {
  id: number;
  userId: number;
  shortCode: string;
  destinationUrl: string;
}

export interface SafeBrowsingRescanDependencies {
  listActiveLinks: (limit: number) => Promise<RescanCandidate[]>;
  check: (url: string) => Promise<SafetyResult>;
  quarantine: (link: RescanCandidate, safety: SafetyResult) => Promise<void>;
  recordUnknown?: (link: RescanCandidate) => Promise<void>;
}

export interface SafeBrowsingRescanResult {
  scanned: number;
  quarantined: number;
  unknown: number;
  errors: number;
}

export async function runSafeBrowsingRescan(
  deps: SafeBrowsingRescanDependencies,
  limit = 250
): Promise<SafeBrowsingRescanResult> {
  const candidates = await deps.listActiveLinks(Math.max(1, Math.min(limit, 1000)));
  let quarantined = 0;
  let unknown = 0;
  let errors = 0;

  for (const link of candidates) {
    try {
      const safety = await deps.check(link.destinationUrl);
      if (safety.verdict === "malicious") {
        await deps.quarantine(link, safety);
        quarantined += 1;
      } else if (safety.verdict === "unknown") {
        unknown += 1;
        await deps.recordUnknown?.(link);
      }
    } catch (error) {
      errors += 1;
      console.error(`[SafeBrowsingRescan] Failed for link ${link.id}:`, error);
    }
  }

  return { scanned: candidates.length, quarantined, unknown, errors };
}

async function notifyQuarantinedLink(link: RescanCandidate, reason: string) {
  if (link.userId > 0) {
    const notificationId = await createNotification({
      title: "A link was quarantined for security review",
      body: `Your short link /r/${link.shortCode} was flagged during a security re-check and has been temporarily quarantined. Reason: ${reason}`,
      category: "alert",
      audience: { type: "users", userIds: [link.userId] },
      createdBy: null,
    });
    if (notificationId) {
      await createNotificationRecipients([
        { notificationId, userId: link.userId },
      ]);
    }
  }

  await notifyOwner({
    title: "Slugly security quarantine",
    content: `Link #${link.id} /r/${link.shortCode} was quarantined by the scheduled Safe Browsing re-scan. Reason: ${reason}`,
  });
}

export async function rescanActiveLinksWithSafeBrowsing(
  limit = 250
): Promise<SafeBrowsingRescanResult> {
  const database = await getDb();
  if (!database) throw new Error("Database not available");

  return runSafeBrowsingRescan(
    {
      listActiveLinks: async batchLimit =>
        database
          .select({
            id: links.id,
            userId: links.userId,
            shortCode: links.shortCode,
            destinationUrl: links.destinationUrl,
          })
          .from(links)
          .where(eq(links.status, "active"))
          .limit(batchLimit),
      check: checkUrlSafety,
      quarantine: async (link, safety) => {
        const reason =
          safety.reason || "Unsafe destination detected during scheduled re-scan";
        await quarantineLink({
          linkId: link.id,
          shortCode: link.shortCode,
          reason,
          threatTypes: safety.threatTypes,
          source: "scheduled-rescan",
        });
        invalidateLinkCache(link.shortCode);
        await notifyQuarantinedLink(link, reason);
      },
      recordUnknown: async link => {
        await writeAuditEvent({
          event: AUDIT_EVENTS.SAFETY_CHECK_UNKNOWN,
          actorId: 0,
          actorName: "system",
          targetType: "link",
          targetId: link.id,
          payload: {
            shortCode: link.shortCode,
            source: "scheduled-rescan",
          },
        });
      },
    },
    limit
  );
}
