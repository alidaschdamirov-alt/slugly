import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import { clicks, links, users } from "../drizzle/schema";
import { getDb } from "./db";
import { escapeHtml, sendTemplatedEmail } from "./email";

export async function runWeeklyDigest() {
  const database = await getDb();
  if (!database) throw new Error("Database unavailable");

  const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const userRows = await database
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(isNotNull(users.email));

  const performanceRows = await database
    .select({
      userId: links.userId,
      shortCode: links.shortCode,
      clicks: sql<number>`COUNT(${clicks.id})`,
    })
    .from(links)
    .leftJoin(clicks, and(eq(clicks.linkId, links.id), gte(clicks.timestamp, since)))
    .groupBy(links.userId, links.id, links.shortCode);

  const byUser = new Map<number, Array<{ shortCode: string; clicks: number }>>();
  for (const row of performanceRows) {
    const current = byUser.get(row.userId) || [];
    current.push({ shortCode: row.shortCode, clicks: Number(row.clicks || 0) });
    byUser.set(row.userId, current);
  }

  let attempted = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const user of userRows) {
    if (!user.email) continue;
    const performance = (byUser.get(user.id) || []).sort((a, b) => b.clicks - a.clicks);
    if (performance.length === 0) {
      skipped += 1;
      continue;
    }

    const totalClicks = performance.reduce((sum, item) => sum + item.clicks, 0);
    const topLinksHtml = performance
      .slice(0, 5)
      .map(item => `<tr><td style="padding:6px 0">/r/${escapeHtml(item.shortCode)}</td><td style="padding:6px 0;text-align:right">${item.clicks.toLocaleString()} clicks</td></tr>`)
      .join("");

    attempted += 1;
    const result = await sendTemplatedEmail("weeklyDigest", user.email, {
      totalClicks: totalClicks.toLocaleString(),
      topLinksHtml,
    });
    if (result === null) {
      skipped += 1;
      continue;
    }
    if (result.success) sent += 1;
    else failed += 1;
  }

  if (failed > 0) {
    throw new Error(`Weekly digest failed for ${failed} of ${attempted} attempted recipients`);
  }

  return { processed: attempted, sent, failed, skipped };
}
