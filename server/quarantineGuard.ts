import { Router, type Request, type Response } from "express";
import { getLinkByShortCode } from "./db";
import { getLinkQuarantineState } from "./linkQuarantine";
import { isLinkSoftDeleted, isUserSoftDeleted } from "./softDelete";

export const quarantineGuardRouter = Router();

quarantineGuardRouter.get(
  "/:shortCode([a-zA-Z0-9_-]{3,32})",
  async (req: Request, res: Response, next) => {
    try {
      const link = await getLinkByShortCode(req.params.shortCode);
      if (!link) return next();

      const removed = await isLinkSoftDeleted(link.id) || (link.userId > 0 && await isUserSoftDeleted(link.userId));
      if (removed) {
        res.setHeader("Cache-Control", "no-store");
        return res.status(410).send(renderRemovedPage(req.params.shortCode));
      }

      const quarantine = await getLinkQuarantineState(link.id);
      if (!quarantine) return next();

      res.setHeader("Cache-Control", "no-store");
      return res.status(451).send(
        renderQuarantinePage(
          req.params.shortCode,
          quarantine.reason,
          quarantine.threatTypes
        )
      );
    } catch (error) {
      console.error("[QuarantineGuard] Failed to check link state:", error);
      return next();
    }
  }
);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderRemovedPage(shortCode: string) {
  const safeCode = escapeHtml(shortCode);
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link unavailable - Slugly</title>
<style>body{font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#F4F4FB;color:#14152B}.card{max-width:440px;padding:36px;text-align:center;background:white;border-radius:18px;box-shadow:0 10px 35px rgba(20,21,43,.08)}h1{font-size:24px}p{color:#6F6F8C;line-height:1.6}a{color:#5A3FF0;text-decoration:none;font-weight:600}</style></head>
<body><main class="card"><h1>Link unavailable</h1><p><strong>/r/${safeCode}</strong> has been removed and is no longer available.</p><p><a href="/">Back to Slugly</a></p></main></body></html>`;
}

export function renderQuarantinePage(
  shortCode: string,
  reason: string,
  threatTypes: string[] = []
) {
  const safeCode = escapeHtml(shortCode);
  const safeReason = escapeHtml(reason || "This destination requires a security review.");
  const threatText = threatTypes.length
    ? `<p class="meta">Security signal: ${escapeHtml(threatTypes.join(", "))}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Security Review - Slugly</title>
  <style>
    body{font-family:'Hanken Grotesk',system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#F4F4FB;color:#14152B}
    .card{width:min(520px,calc(100% - 32px));box-sizing:border-box;background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:32px;text-align:center;box-shadow:0 10px 35px rgba(20,21,43,.08)}
    .icon{font-size:2.8rem;margin-bottom:14px}h1{font-size:1.45rem;margin:0 0 10px;font-weight:750}p{color:#626276;line-height:1.6;margin:8px 0}.reason{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:10px;padding:12px 14px;margin:18px 0}.meta{font-size:.8rem}.actions{margin-top:22px;display:flex;justify-content:center;gap:12px;flex-wrap:wrap}a{color:#5A3FF0;text-decoration:none;font-weight:650}.btn{display:inline-block;padding:10px 16px;border-radius:9px;background:#5A3FF0;color:white}.secondary{padding:10px 6px}
  </style>
</head>
<body>
  <main class="card">
    <div class="icon">🛡️</div>
    <h1>This link is under security review</h1>
    <p>Slugly has temporarily quarantined <strong>/r/${safeCode}</strong>. For your safety, we are not redirecting to its destination.</p>
    <div class="reason">${safeReason}</div>
    ${threatText}
    <p>If you own this link and believe it was flagged incorrectly, submit a report so the case can be reviewed.</p>
    <div class="actions">
      <a class="btn" href="/report?code=${encodeURIComponent(shortCode)}">Request review</a>
      <a class="secondary" href="/">Back to Slugly</a>
    </div>
  </main>
</body>
</html>`;
}
