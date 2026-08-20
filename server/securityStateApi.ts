import { Router, type Request, type Response } from "express";
import { inArray, like } from "drizzle-orm";
import { links, siteSettings } from "../drizzle/schema";
import { getDb, getLinksByUserId } from "./db";
import { getLinkQuarantineState, type LinkQuarantineState } from "./linkQuarantine";
import { sdk } from "./_core/sdk";

export const securityStateRouter = Router();

function parseIds(value: unknown): number[] {
  if (typeof value !== "string") return [];
  return Array.from(
    new Set(
      value
        .split(",")
        .map(part => Number(part.trim()))
        .filter(id => Number.isInteger(id) && id > 0)
    )
  ).slice(0, 200);
}

securityStateRouter.get("/links", async (req: Request, res: Response) => {
  try {
    const user = await sdk.authenticateRequest(req);
    const ids = parseIds(req.query.ids);
    if (ids.length === 0) return res.json({ states: {} });

    const userLinks = await getLinksByUserId(user.id);
    const ownedIds = new Set(
      userLinks.filter(link => ids.includes(link.id)).map(link => link.id)
    );

    const states: Record<number, LinkQuarantineState> = {};
    await Promise.all(
      ids.map(async id => {
        if (!ownedIds.has(id)) return;
        const state = await getLinkQuarantineState(id);
        if (state) states[id] = state;
      })
    );

    return res.json({ states });
  } catch (error: any) {
    const status = error?.code === "FORBIDDEN" ? 401 : 500;
    return res.status(status).json({
      error: status === 401 ? "Unauthorized" : "Failed to load security state",
    });
  }
});

securityStateRouter.get("/admin/quarantine", async (req: Request, res: Response) => {
  try {
    const user = await sdk.authenticateRequest(req);
    if (user.role !== "admin" && user.role !== "support") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const database = await getDb();
    if (!database) return res.status(503).json({ error: "Database unavailable" });

    const rows = await database
      .select({ key: siteSettings.key, value: siteSettings.value })
      .from(siteSettings)
      .where(like(siteSettings.key, "link_quarantine_%"));

    const parsed = rows.flatMap(row => {
      const id = Number(row.key.slice("link_quarantine_".length));
      if (!Number.isInteger(id) || id <= 0 || !row.value || row.value === "null") return [];
      try {
        const state = JSON.parse(row.value) as LinkQuarantineState;
        return state?.quarantined === true ? [{ id, state }] : [];
      } catch {
        return [];
      }
    });

    if (parsed.length === 0) return res.json({ links: [] });

    const ids = parsed.map(item => item.id);
    const linkRows = await database
      .select({
        id: links.id,
        userId: links.userId,
        shortCode: links.shortCode,
        destinationUrl: links.destinationUrl,
        status: links.status,
        createdAt: links.createdAt,
      })
      .from(links)
      .where(inArray(links.id, ids));
    const linkMap = new Map(linkRows.map(link => [link.id, link]));

    const result = parsed
      .map(item => {
        const link = linkMap.get(item.id);
        return link ? { ...link, quarantine: item.state } : null;
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.quarantine.updatedAt - a.quarantine.updatedAt);

    return res.json({ links: result });
  } catch (error: any) {
    const status = error?.code === "FORBIDDEN" ? 401 : 500;
    return res.status(status).json({
      error: status === 401 ? "Unauthorized" : "Failed to load quarantine queue",
    });
  }
});
