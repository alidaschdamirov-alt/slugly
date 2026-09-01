import { randomBytes } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { getLinkByShortCode, recordDeepLinkEvent } from "./db";
import { getRulesForLink } from "./rules";

const EVENT_TYPES = new Set(["app_open", "store_fallback", "web_fallback"]);
const PLATFORMS = new Set(["ios", "android", "other"]);
const SESSION_RE = /^[A-Za-z0-9_-]{8,64}$/;
const SHORT_CODE_RE = /^[A-Za-z0-9_-]{3,32}$/;

export const deepLinksApiRouter = Router();

deepLinksApiRouter.post("/events", async (req: Request, res: Response) => {
  try {
    const shortCode = String(req.body?.shortCode || "").trim();
    const eventType = String(req.body?.event || "").trim();
    const platformRaw = String(req.body?.platform || "other").trim().toLowerCase();
    const sourceRaw = String(req.body?.source || "sdk").trim().toLowerCase();
    const providedSession = String(req.body?.sessionId || "").trim();

    if (!SHORT_CODE_RE.test(shortCode)) {
      return res.status(400).json({ error: "Invalid short code" });
    }
    if (!EVENT_TYPES.has(eventType)) {
      return res.status(400).json({ error: "Unsupported deep link event" });
    }

    const link = await getLinkByShortCode(shortCode);
    if (!link) return res.status(404).json({ error: "Link not found" });

    const rules = await getRulesForLink(link.id);
    if (!rules.some(rule => rule.type === "deeplink")) {
      return res.status(409).json({ error: "Mobile Deep Links are not enabled for this link" });
    }

    const sessionId = providedSession && SESSION_RE.test(providedSession)
      ? providedSession
      : randomBytes(12).toString("hex");
    const platform = PLATFORMS.has(platformRaw) ? platformRaw as "ios" | "android" | "other" : "other";
    const source = sourceRaw.replace(/[^a-z0-9_-]/g, "").slice(0, 32) || "sdk";

    await recordDeepLinkEvent({
      linkId: link.id,
      sessionId,
      eventType: eventType as "app_open" | "store_fallback" | "web_fallback",
      platform,
      source,
      timestamp: Date.now(),
    });

    return res.status(204).end();
  } catch (error) {
    console.error("[DeepLinks] Event callback failed:", error);
    return res.status(500).json({ error: "Failed to record deep link event" });
  }
});
