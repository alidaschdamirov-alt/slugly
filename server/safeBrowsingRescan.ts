import { eq } from "drizzle-orm";
import { links } from "../drizzle/schema";
import { AUDIT_EVENTS } from "../shared/audit-events";
import { writeAuditEvent } from "./audit";
import { getDb } from "./db";
import { invalidateLinkCache } from "./redirect";
import { checkUrlSafety } from "./safeBrowsing";

export interface RescanCandidate {
  id: number;
  shortCode: string;
  destinationUrl: string;
}

export interface SafeBrowsingRescanDependencies {
  listActiveLinks: (limit: number) => Promise<RescanCandidate[]>;
  check: (url: string) => Promise<{ safe: boolean; reason?: string }>;
  quarantine: (link: RescanCandidate, reason?: string) => Promise<void>;
}

export interface SafeBrowsingRescanResult {
  scanned: number;
  quarantined: number;
  errors: number;
}

export async function runSafeBrowsingRescan(
  deps: SafeBrowsingRescanDependencies,
  limit = 250
): Promise<SafeBrowsingRescanResult> {
  const candidates = await deps.listActiveLinks(Math.max(1, Math.min(limit, 1000)));
  let quarantined = 0;
  let errors = 0;

  for (const link of candidates) {
    try {
      const safety = await deps.check(link.destinationUrl);
      if (!safety.safe) {
        await deps.quarantine(link, safety.reason);
        quarantined += 1;
      }
    } catch (error) {
      errors += 1;
      console.error(`[SafeBrowsingRescan] Failed for link ${link.id}:`, error);
    }
  }

  return { scanned: candidates.length, quarantined, errors };
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
            shortCode: links.shortCode,
            destinationUrl: links.destinationUrl,
          })
          .from(links)
          .where(eq(links.status, "active"))
          .limit(batchLimit),
      check: checkUrlSafety,
      quarantine: async (link, reason) => {
        await database
          .update(links)
          .set({ status: "paused" })
          .where(eq(links.id, link.id));

        invalidateLinkCache(link.shortCode);

        await writeAuditEvent({
          event: AUDIT_EVENTS.LINK_QUARANTINE,
          actorId: 0,
          actorName: "system",
          targetType: "link",
          targetId: link.id,
          payload: {
            shortCode: link.shortCode,
            destinationUrl: link.destinationUrl,
            source: "safe-browsing-rescan",
            reason: reason || "Unsafe destination detected during scheduled re-scan",
          },
        });
      },
    },
    limit
  );
}
