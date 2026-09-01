import { createHash } from "node:crypto";
import { Router, type Request, type Response } from "express";
import {
  getLinkById,
  getPageButtons,
  getPublishedPageBySlug,
  recordPageView,
} from "./db";
import type { Page } from "../drizzle/schema";

export const pagesPublicRouter = Router();

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function deviceFromUa(userAgent: string) {
  if (/ipad|tablet|kindle|silk/i.test(userAgent)) return "tablet";
  if (/mobi|iphone|ipod|android/i.test(userAgent)) return "mobile";
  return "desktop";
}

function isBot(userAgent: string) {
  return /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|discordbot|twitterbot|linkedinbot/i.test(userAgent);
}

function getCountry(req: Request) {
  const headerNames = [
    "cf-ipcountry",
    "x-vercel-ip-country",
    "x-appengine-country",
    "x-client-geo-country",
    "x-geo-country",
    "x-country-code",
  ];
  for (const name of headerNames) {
    const value = req.headers[name];
    if (typeof value === "string" && value.trim()) return value.trim().toUpperCase();
  }
  return null;
}

function getClientIp(req: Request) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return req.ip || req.socket.remoteAddress || "";
}

export async function getPublicPageModel(page: Page, brandedHost = false) {
  const buttons = await getPageButtons(page.id);
  const enriched = await Promise.all(
    buttons
      .filter(button => button.enabled)
      .map(async button => {
        const link = await getLinkById(button.linkId);
        if (!link || link.status !== "active") return null;
        return {
          ...button,
          href: brandedHost ? `/${link.shortCode}` : `/r/${link.shortCode}`,
          destinationUrl: link.destinationUrl,
          shortCode: link.shortCode,
        };
      })
  );
  return { page, buttons: enriched.filter(Boolean) as NonNullable<(typeof enriched)[number]>[] };
}

export function renderPublicPageHtml(model: Awaited<ReturnType<typeof getPublicPageModel>>) {
  const { page, buttons } = model;
  const radius = page.buttonStyle === "pill" ? "999px" : page.buttonStyle === "square" ? "8px" : "16px";
  const title = page.headline || page.title;
  const description = page.description || "";
  const avatar = page.avatarUrl
    ? `<img class="avatar" src="${escapeHtml(page.avatarUrl)}" alt="${escapeHtml(page.title)}" referrerpolicy="no-referrer">`
    : `<div class="avatar fallback">${escapeHtml(page.title.slice(0, 1).toUpperCase())}</div>`;
  const hero = page.heroImageUrl
    ? `<img class="hero-image" src="${escapeHtml(page.heroImageUrl)}" alt="" referrerpolicy="no-referrer">`
    : "";

  const buttonMarkup = buttons.map(button => {
    const styleClass = button.style === "outline" ? "outline" : button.style === "secondary" ? "secondary" : "primary";
    return `<a class="cta ${styleClass}" href="${escapeHtml(button.href)}" rel="nofollow">
      <span class="cta-copy"><strong>${escapeHtml(button.label)}</strong>${button.subtitle ? `<small>${escapeHtml(button.subtitle)}</small>` : ""}</span>
      <span class="arrow">↗</span>
    </a>`;
  }).join("");

  const body = page.type === "bio"
    ? `<main class="shell bio">
        ${avatar}
        <h1>${escapeHtml(title)}</h1>
        ${description ? `<p class="description">${escapeHtml(description)}</p>` : ""}
        <section class="buttons">${buttonMarkup || `<div class="empty">Links coming soon.</div>`}</section>
      </main>`
    : `<main class="shell landing">
        ${hero}
        <div class="hero-copy">
          <div class="eyebrow">${escapeHtml(page.title)}</div>
          <h1>${escapeHtml(title)}</h1>
          ${description ? `<p class="description">${escapeHtml(description)}</p>` : ""}
          <section class="buttons landing-buttons">${buttonMarkup || `<div class="empty">Calls to action coming soon.</div>`}</section>
        </div>
      </main>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="description" content="${escapeHtml(description.slice(0, 180))}">
  <meta name="robots" content="index,follow">
  <title>${escapeHtml(title)} · Slugly</title>
  <style>
    :root{--accent:${page.accentColor};--bg:${page.backgroundColor};--text:${page.textColor};--radius:${radius}}
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--bg);color:var(--text)}
    body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:28px 16px}
    .shell{width:min(100%,760px);margin:0 auto}.bio{width:min(100%,560px);text-align:center;padding-top:36px}
    .avatar{width:96px;height:96px;border-radius:50%;object-fit:cover;border:4px solid rgba(255,255,255,.9);box-shadow:0 14px 40px rgba(17,24,39,.12)}
    .fallback{display:grid;place-items:center;margin:0 auto;background:var(--accent);color:#fff;font-weight:800;font-size:34px}
    h1{font-size:clamp(32px,7vw,58px);line-height:1.02;letter-spacing:-.045em;margin:20px 0 12px}.bio h1{font-size:clamp(28px,6vw,42px)}
    .description{font-size:16px;line-height:1.65;opacity:.72;max-width:620px;margin:0 auto 28px;white-space:pre-line}
    .buttons{display:grid;gap:12px;margin-top:26px}.cta{display:flex;align-items:center;justify-content:space-between;gap:14px;text-decoration:none;border-radius:var(--radius);padding:16px 18px;transition:transform .15s ease,box-shadow .15s ease;border:1px solid transparent}
    .cta:hover{transform:translateY(-1px)}.cta.primary{background:var(--accent);color:#fff;box-shadow:0 10px 30px color-mix(in srgb,var(--accent) 24%,transparent)}
    .cta.secondary{background:rgba(255,255,255,.78);color:var(--text);border-color:rgba(17,24,39,.08)}.cta.outline{background:transparent;color:var(--text);border-color:color-mix(in srgb,var(--text) 28%,transparent)}
    .cta-copy{display:grid;text-align:left;gap:3px}.cta strong{font-size:15px}.cta small{font-size:12px;opacity:.66;font-weight:500}.arrow{font-size:18px;opacity:.72}
    .hero-image{width:100%;max-height:420px;object-fit:cover;border-radius:26px;box-shadow:0 24px 70px rgba(17,24,39,.12);margin-bottom:34px}
    .landing{padding-top:28px}.hero-copy{max-width:680px}.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.16em;font-weight:800;color:var(--accent)}.landing .description{margin-left:0}.landing-buttons{max-width:560px}
    .empty{padding:18px;border:1px dashed rgba(17,24,39,.18);border-radius:var(--radius);font-size:14px;opacity:.55}
    .powered{width:min(100%,560px);margin:34px auto 0;text-align:center;font-size:11px;opacity:.46}.powered a{color:inherit}
    @media(max-width:600px){body{padding:18px 14px}.landing{padding-top:10px}.hero-image{border-radius:20px;margin-bottom:24px}.cta{padding:15px 16px}}
  </style>
</head>
<body>
  ${body}
  <footer class="powered">Powered by <a href="https://slugly.io/">Slugly</a></footer>
</body>
</html>`;
}

export async function recordPublicPageView(req: Request, page: Page) {
  const userAgent = String(req.headers["user-agent"] || "");
  const ipHash = createHash("sha256").update(getClientIp(req)).digest("hex");
  await recordPageView({
    pageId: page.id,
    timestamp: Date.now(),
    country: getCountry(req),
    deviceType: deviceFromUa(userAgent),
    isBot: isBot(userAgent),
    ipHash,
  });
}

pagesPublicRouter.get("/bio/:slug", async (req: Request, res: Response) => {
  const page = await getPublishedPageBySlug(String(req.params.slug || "").toLowerCase(), "bio");
  if (!page || page.domainId) return res.status(404).send("Page not found");
  void recordPublicPageView(req, page).catch(error => console.error("[Pages] view record failed:", error));
  const model = await getPublicPageModel(page, false);
  return res.status(200).set("Cache-Control", "public, max-age=30").type("html").send(renderPublicPageHtml(model));
});

pagesPublicRouter.get("/page/:slug", async (req: Request, res: Response) => {
  const page = await getPublishedPageBySlug(String(req.params.slug || "").toLowerCase(), "landing");
  if (!page || page.domainId) return res.status(404).send("Page not found");
  void recordPublicPageView(req, page).catch(error => console.error("[Pages] view record failed:", error));
  const model = await getPublicPageModel(page, false);
  return res.status(200).set("Cache-Control", "public, max-age=30").type("html").send(renderPublicPageHtml(model));
});
