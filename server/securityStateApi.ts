import { Router, type Request, type Response } from "express";
import { inArray, like } from "drizzle-orm";
import { links, siteSettings } from "../drizzle/schema";
import { AUDIT_EVENTS } from "../shared/audit-events";
import { getAuditRequestContext, writeAuditEvent } from "./audit";
import { getDb, getLinkById, getLinksByUserId } from "./db";
import {
  clearLinkQuarantine,
  getLinkQuarantineState,
  quarantineLink,
  type LinkQuarantineState,
} from "./linkQuarantine";
import {
  getSecurityRateLimitSettings,
  saveSecurityRateLimitSettings,
} from "./rateLimit";
import { checkUrlSafety } from "./safeBrowsing";
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

function normalizeReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const reason = value.trim();
  return reason.length >= 3 && reason.length <= 1000 ? reason : null;
}

async function requireAdmin(req: Request, res: Response) {
  const user = await sdk.authenticateRequest(req);
  if (user.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return user;
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

securityStateRouter.post("/admin/quarantine/:id/review", async (req: Request, res: Response) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const linkId = Number(req.params.id);
    if (!Number.isInteger(linkId) || linkId <= 0) {
      return res.status(400).json({ error: "Invalid link id" });
    }

    const action = req.body?.action;
    if (action !== "rescan" && action !== "release") {
      return res.status(400).json({ error: "Action must be rescan or release" });
    }

    const reason = normalizeReason(req.body?.reason);
    if (!reason) {
      return res.status(400).json({ error: "A review reason is required (3-1000 characters)." });
    }

    const link = await getLinkById(linkId);
    if (!link) return res.status(404).json({ error: "Link not found" });

    const current = await getLinkQuarantineState(linkId);
    if (!current) {
      return res.status(409).json({ error: "Link is not currently quarantined" });
    }

    if (action === "release") {
      await clearLinkQuarantine({
        linkId,
        shortCode: link.shortCode,
        actorId: admin.id,
        actorName: admin.name || admin.email || "admin",
        reason: `Manual admin release: ${reason}`,
      });
      return res.json({ ok: true, action, verdict: "manual-release", released: true });
    }

    const safety = await checkUrlSafety(link.destinationUrl);
    if (safety.verdict === "clean") {
      await clearLinkQuarantine({
        linkId,
        shortCode: link.shortCode,
        actorId: admin.id,
        actorName: admin.name || admin.email || "admin",
        reason: `Admin re-scan passed: ${reason}`,
      });
      return res.json({ ok: true, action, verdict: safety.verdict, released: true });
    }

    if (safety.verdict === "malicious") {
      await quarantineLink({
        linkId,
        shortCode: link.shortCode,
        reason: safety.reason || "Destination remains unsafe after admin re-scan",
        threatTypes: safety.threatTypes,
        source: "admin",
        actorId: admin.id,
        actorName: admin.name || admin.email || "admin",
      });
      return res.status(409).json({
        ok: false,
        action,
        verdict: safety.verdict,
        released: false,
        reason: safety.reason || "Destination is still unsafe",
      });
    }

    return res.status(503).json({
      ok: false,
      action,
      verdict: "unknown",
      released: false,
      reason: safety.reason || "Security provider is unavailable. Quarantine remains in place.",
    });
  } catch (error: any) {
    const status = error?.code === "FORBIDDEN" ? 401 : 500;
    return res.status(status).json({
      error: status === 401 ? "Unauthorized" : error?.message || "Quarantine review failed",
    });
  }
});

securityStateRouter.get("/admin/rate-limits", async (req: Request, res: Response) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const database = await getDb();
    if (!database) return res.status(503).json({ error: "Database unavailable" });
    return res.json(await getSecurityRateLimitSettings(database));
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to load rate-limit settings" });
  }
});

securityStateRouter.put("/admin/rate-limits", async (req: Request, res: Response) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const reason = normalizeReason(req.body?.reason);
    if (!reason) {
      return res.status(400).json({ error: "A change reason is required (3-1000 characters)." });
    }

    const database = await getDb();
    if (!database) return res.status(503).json({ error: "Database unavailable" });
    const settings = await saveSecurityRateLimitSettings(database, req.body?.settings);

    await writeAuditEvent({
      event: AUDIT_EVENTS.SETTINGS_UPDATE,
      actorId: admin.id,
      actorName: admin.name || admin.email || "admin",
      targetType: "system",
      targetId: "security_rate_limits",
      payload: { settings },
      reason,
      ...getAuditRequestContext(req),
    });

    return res.json({ ok: true, settings });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to update rate-limit settings" });
  }
});
