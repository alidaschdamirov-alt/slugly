import { Router, type Request, type Response } from "express";
import { getLinkByShortCode } from "./db";
import { isLinkSoftDeleted, isUserSoftDeleted } from "./softDelete";

export const softDeleteGuardRouter = Router();

softDeleteGuardRouter.get("/:shortCode([a-zA-Z0-9_-]{3,32})", async (req: Request, res: Response, next) => {
  try {
    const link = await getLinkByShortCode(req.params.shortCode);
    if (!link) return next();
    const deleted = await isLinkSoftDeleted(link.id) || (link.userId > 0 && await isUserSoftDeleted(link.userId));
    if (!deleted) return next();
    return res.status(410).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link unavailable - Slugly</title><style>body{font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#F4F4FB;color:#14152B}.card{max-width:440px;padding:36px;text-align:center;background:white;border-radius:18px;box-shadow:0 10px 35px rgba(20,21,43,.08)}h1{font-size:24px}p{color:#6F6F8C;line-height:1.6}</style></head><body><div class="card"><h1>Link unavailable</h1><p>This Slugly link has been removed and is no longer available.</p></div></body></html>`);
  } catch {
    return next();
  }
});
