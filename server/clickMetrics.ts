import { and, gte, inArray } from "drizzle-orm";
import { clicks } from "../drizzle/schema";

/**
 * Canonical user-facing click metric. Link cards count every recorded redirect,
 * so reports, charts and exports must use the same population.
 * Bot-filtered routing diagnostics remain separate and are labelled as human clicks.
 */
export function canonicalClickFilter(linkIds: number[], since?: number) {
  const linkFilter = inArray(clicks.linkId, linkIds);
  return since === undefined
    ? linkFilter
    : and(linkFilter, gte(clicks.timestamp, since));
}
