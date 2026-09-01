import { Router, Request, Response } from "express";
import { getLinkByShortCode, recordClick, getSiteSetting } from "./db";
import { createHash } from "crypto";
import { getRulesForLink, evaluateRules, getPixelsByIds } from "./rules";
import type { EvaluationContext } from "./rules";
import geoip from "geoip-lite";

// ============ LRU REDIRECT CACHE ============
// Cache shortCode → link data with short TTL to reduce DB hits on hot links
interface CacheEntry {
  link: Awaited<ReturnType<typeof getLinkByShortCode>>;
  cachedAt: number;
}

const CACHE_TTL_MS = 30_000; // 30 seconds
const CACHE_MAX_SIZE = 2000;
const NOT_FOUND_TTL_MS = 10_000; // 10 seconds for 404 results

const linkCache = new Map<string, CacheEntry>();

function getCachedLink(shortCode: string): CacheEntry | null {
  const entry = linkCache.get(shortCode);
  if (!entry) return null;
  const ttl = entry.link ? CACHE_TTL_MS : NOT_FOUND_TTL_MS;
  if (Date.now() - entry.cachedAt > ttl) {
    linkCache.delete(shortCode);
    return null;
  }
  // Move to end (LRU)
  linkCache.delete(shortCode);
  linkCache.set(shortCode, entry);
  return entry;
}

function setCachedLink(shortCode: string, link: CacheEntry["link"]) {
  // Evict oldest if at capacity
  if (linkCache.size >= CACHE_MAX_SIZE) {
    const firstKey = linkCache.keys().next().value;
    if (firstKey) linkCache.delete(firstKey);
  }
  linkCache.set(shortCode, { link, cachedAt: Date.now() });
}

/** Invalidate cache for a specific shortCode (call on link update/delete) */
export function invalidateLinkCache(shortCode: string) {
  linkCache.delete(shortCode);
}

const redirectRouter = Router();

// ============ RESERVED SLUGS ============
// These cannot be used as custom short codes
const RESERVED_SLUGS = new Set([
  "admin", "api", "login", "signup", "dashboard", "settings", "app",
  "help", "report", "qr", "billing", "domains", "tags", "analytics",
  "create", "bulk", "projects", "links", "account", "profile",
  "terms", "privacy", "aup", "cookies", "export", "delete",
  "favicon.ico", "robots.txt", "sitemap.xml", ".well-known",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

// ============ BOT DETECTION ============
const BOT_UA_PATTERNS = [
  /bot/i, /crawl/i, /spider/i, /slurp/i, /mediapartners/i,
  /facebookexternalhit/i, /facebot/i, /twitterbot/i, /linkedinbot/i,
  /whatsapp/i, /telegrambot/i, /discordbot/i, /slackbot/i,
  /googlebot/i, /bingbot/i, /yandexbot/i, /baiduspider/i,
  /duckduckbot/i, /ia_archiver/i, /semrushbot/i, /ahrefsbot/i,
  /mj12bot/i, /dotbot/i, /petalbot/i, /bytespider/i,
  /preview/i, /fetch/i, /curl/i, /wget/i, /python-requests/i,
  /go-http-client/i, /java\//i, /okhttp/i, /axios/i,
  /headlesschrome/i, /phantomjs/i, /selenium/i,
  /virus/i, /antivir/i, /kaspersky/i, /norton/i, /avast/i,
  /bitdefender/i, /mcafee/i, /malware/i, /scanner/i,
];

function isBot(ua: string): boolean {
  if (!ua || ua.length < 10) return true; // Empty or too-short UA is suspicious
  return BOT_UA_PATTERNS.some(pattern => pattern.test(ua));
}

// ============ USER AGENT PARSING ============
function parseUserAgent(ua: string) {
  let deviceType = "desktop";
  let browser = "Unknown";
  let os = "Unknown";

  if (/mobile|android|iphone|ipad|ipod/i.test(ua)) {
    deviceType = /ipad|tablet/i.test(ua) ? "tablet" : "mobile";
  }

  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/opr\//i.test(ua) || /opera/i.test(ua)) browser = "Opera";
  else if (/chrome|crios/i.test(ua)) browser = "Chrome";
  else if (/firefox|fxios/i.test(ua)) browser = "Firefox";
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = "Safari";
  else if (/msie|trident/i.test(ua)) browser = "IE";

  if (/windows/i.test(ua)) os = "Windows";
  else if (/macintosh|mac os/i.test(ua)) os = "macOS";
  else if (/linux/i.test(ua) && !/android/i.test(ua)) os = "Linux";
  else if (/android/i.test(ua)) os = "Android";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";

  return { deviceType, browser, os };
}

function getCountryFromRequest(req: Request): string | null {
  // Priority 1: CDN/platform geo headers (instant, no lookup needed)
  const cfCountry = req.headers["cf-ipcountry"] as string | undefined;
  if (cfCountry && cfCountry !== "XX" && cfCountry !== "T1") return cfCountry;
  const geoCountry = req.headers["x-vercel-ip-country"] as string | undefined;
  if (geoCountry) return geoCountry;
  const gcpCountry = req.headers["x-appengine-country"] as string | undefined;
  if (gcpCountry && gcpCountry !== "ZZ") return gcpCountry;
  const gcpLbCountry = req.headers["x-client-geo-country"] as string | undefined;
  if (gcpLbCountry) return gcpLbCountry;
  const proxyCountry = req.headers["x-geo-country"] as string | undefined;
  if (proxyCountry) return proxyCountry;
  const fastlyCountry = req.headers["x-country-code"] as string | undefined;
  if (fastlyCountry) return fastlyCountry;

  // Priority 2: MaxMind GeoLite2 local database lookup by IP
  const ip = getIpFromRequest(req);
  if (ip && ip !== "unknown") {
    try {
      const geo = geoip.lookup(ip);
      if (geo && geo.country) return geo.country;
    } catch {
      // geoip-lite lookup failed, fall through
    }
  }

  return null;
}

function getIpFromRequest(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = (typeof forwarded === "string" ? forwarded : forwarded[0]).split(",")[0].trim();
    return first;
  }
  return req.ip || "unknown";
}

function hashIp(ip: string, ua: string): string {
  return createHash("sha256").update(`${ip}:${ua}`).digest("hex").slice(0, 16);
}

// ============ REDIRECT HANDLER ============
redirectRouter.get("/:shortCode([a-zA-Z0-9_-]{3,32})", async (req: Request, res: Response) => {
  const { shortCode } = req.params;

  // Skip known paths
  if (RESERVED_SLUGS.has(shortCode) || shortCode.startsWith("__")) {
    return res.status(404).send(renderNotFoundPage());
  }

  try {
    // Cache-first lookup
    const cached = getCachedLink(shortCode);
    const link = cached ? cached.link : await getLinkByShortCode(shortCode);
    if (!cached) setCachedLink(shortCode, link);

    if (!link) {
      return res.status(404).send(renderNotFoundPage());
    }

    // Check paused status
    if (link.status === "paused") {
      return res.status(410).send(renderPausedPage());
    }

    // Check scheduling: not yet active
    const now = Date.now();
    if (link.activeFrom && now < link.activeFrom) {
      return res.status(200).send(renderScheduledPage());
    }

    // Check expiry
    if (link.expiresAt && now > link.expiresAt) {
      return res.status(410).send(renderExpiredPage());
    }

    // Parse request context for rule evaluation
    const ua = (req.headers["user-agent"] || "") as string;
    const { deviceType, browser, os } = parseUserAgent(ua);
    const country = getCountryFromRequest(req);
    const referrer = (req.headers["referer"] || req.headers["referrer"] || "") as string;
    const ip = getIpFromRequest(req);
    const isBotHit = isBot(ua);
    const ipHash = hashIp(ip, ua);

    // ============ RULE EVALUATION ============
    // Evaluate redirect rules BEFORE building final destination
    const rules = await getRulesForLink(link.id);
    const evalCtx: EvaluationContext = {
      country,
      deviceType,
      userAgent: ua,
      originalDestination: link.destinationUrl,
    };
    const evalResult = evaluateRules(rules, evalCtx);

    // Build destination URL with stored UTM parameters and incoming query passthrough.
    const appendRedirectParams = (target: string) => {
      if (!target) return target;
      try {
        const targetUrl = new URL(target);
        if (link.utmSource) targetUrl.searchParams.set("utm_source", link.utmSource);
        if (link.utmMedium) targetUrl.searchParams.set("utm_medium", link.utmMedium);
        if (link.utmCampaign) targetUrl.searchParams.set("utm_campaign", link.utmCampaign);
        if (link.utmTerm) targetUrl.searchParams.set("utm_term", link.utmTerm);
        if (link.utmContent) targetUrl.searchParams.set("utm_content", link.utmContent);
        const incomingParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
        incomingParams.forEach((value, key) => targetUrl.searchParams.append(key, value));
        return targetUrl.toString();
      } catch {
        return target;
      }
    };

    let destinationUrl = appendRedirectParams(evalResult.destination);

    const recordCurrentClick = () =>
      recordClick({
        linkId: link.id,
        timestamp: now,
        country,
        city: null,
        deviceType,
        browser,
        os,
        referrer: referrer || null,
        isBot: isBotHit,
        ipHash,
        variant: evalResult.variant || null,
      }).catch(err => console.error("[Click] Failed to record:", err));

    // Native Universal/App Links may open before the request reaches Slugly.
    // If it reaches us, try the custom scheme and then use store/web fallback.
    if (evalResult.isDeepLink && evalResult.deepLink) {
      recordCurrentClick();
      const deepLink = {
        ...evalResult.deepLink,
        scheme: evalResult.deepLink.scheme ? appendRedirectParams(evalResult.deepLink.scheme) : undefined,
        storeUrl: evalResult.deepLink.storeUrl ? appendRedirectParams(evalResult.deepLink.storeUrl) : undefined,
        webFallback: appendRedirectParams(evalResult.deepLink.webFallback || destinationUrl),
      };
      return res.status(200).set("Cache-Control", "no-store").send(renderDeepLinkPage(deepLink, shortCode));
    }

    // Pixel interstitial: fire tracking pixels before redirecting.
    // Record the visit before returning the interstitial so routing analytics stay complete.
    if (evalResult.pixelIds && evalResult.pixelIds.length > 0 && !isBotHit) {
      const pixels = await getPixelsByIds(evalResult.pixelIds);
      if (pixels.length > 0) {
        recordCurrentClick();
        return res.status(200).send(renderPixelInterstitial(pixels, destinationUrl, evalResult.pixelDelay || 1500));
      }
    }

    // Check safe-mode: show interstitial for anonymous links (no userId)
    const safeModeEnabled = await getSiteSetting("safe_mode");
    if (safeModeEnabled === "true" && !link.userId) {
      return res.status(200).send(renderSafeModePage(destinationUrl, shortCode));
    }

    // Fire and forget click recording - don't block the redirect
    recordCurrentClick();

    // HTTP 302 Temporary Redirect — NEVER use 301 (browsers cache it, clicks stop counting)
    return res.redirect(302, destinationUrl);
  } catch (error) {
    console.error("[Redirect] Error:", error);
    return res.status(500).send("Internal server error");
  }
});

// ============ STATIC PAGES ============

function renderNotFoundPage() {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Link Not Found - Slugly</title>
<style>body{font-family:'Hanken Grotesk',system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#F4F4FB;color:#14152B}
.container{text-align:center;padding:2rem;max-width:400px}.icon{font-size:3rem;margin-bottom:1rem;opacity:0.6}h1{font-size:1.5rem;margin-bottom:0.5rem;font-weight:600}p{color:#6b7280;line-height:1.6}
a{color:#5A3FF0;text-decoration:none;font-weight:500}a:hover{text-decoration:underline}</style>
</head><body><div class="container"><div class="icon">🔗</div><h1>Link Not Found</h1><p>This short link doesn't exist or has been removed.</p><p style="margin-top:1.5rem"><a href="/">← Back to Slugly</a></p></div></body></html>`;
}

function renderPausedPage() {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Link Paused - Slugly</title>
<style>body{font-family:'Hanken Grotesk',system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#F4F4FB;color:#14152B}
.container{text-align:center;padding:2rem;max-width:400px}.icon{font-size:3rem;margin-bottom:1rem;opacity:0.6}h1{font-size:1.5rem;margin-bottom:0.5rem;font-weight:600}p{color:#6b7280;line-height:1.6}
a{color:#5A3FF0;text-decoration:none;font-weight:500}a:hover{text-decoration:underline}</style>
</head><body><div class="container"><div class="icon">⏸️</div><h1>Link Temporarily Inactive</h1><p>This short link has been paused by its owner. It may become available again later.</p><p style="margin-top:1.5rem"><a href="/">← Back to Slugly</a></p></div></body></html>`;
}

function renderExpiredPage() {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Link Expired - Slugly</title>
<style>body{font-family:'Hanken Grotesk',system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#F4F4FB;color:#14152B}
.container{text-align:center;padding:2rem;max-width:400px}.icon{font-size:3rem;margin-bottom:1rem;opacity:0.6}h1{font-size:1.5rem;margin-bottom:0.5rem;font-weight:600}p{color:#6b7280;line-height:1.6}
a{color:#5A3FF0;text-decoration:none;font-weight:500}a:hover{text-decoration:underline}</style>
</head><body><div class="container"><div class="icon">⏰</div><h1>Link Expired</h1><p>This short link has passed its expiration date and is no longer active.</p><p style="margin-top:1.5rem"><a href="/">← Back to Slugly</a></p></div></body></html>`;
}

function renderScheduledPage() {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Link Not Yet Active - Slugly</title>
<style>body{font-family:'Hanken Grotesk',system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#F4F4FB;color:#14152B}
.container{text-align:center;padding:2rem;max-width:400px}.icon{font-size:3rem;margin-bottom:1rem;opacity:0.6}h1{font-size:1.5rem;margin-bottom:0.5rem;font-weight:600}p{color:#6b7280;line-height:1.6}
a{color:#5A3FF0;text-decoration:none;font-weight:500}a:hover{text-decoration:underline}</style>
</head><body><div class="container"><div class="icon">📅</div><h1>Link Not Yet Active</h1><p>This short link is scheduled to become active soon. Please check back later.</p><p style="margin-top:1.5rem"><a href="/">← Back to Slugly</a></p></div></body></html>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function isSafeHref(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function renderSafeModePage(destination: string, shortCode: string) {
  const escapedDest = escapeHtml(destination);
  const escapedCode = escapeHtml(shortCode);
  const safeHref = isSafeHref(destination) ? escapedDest : "#";
  const hrefWarning = isSafeHref(destination) ? "" : `<p style="color:#dc2626;font-size:0.8rem;margin-top:0.5rem">⚠️ This URL uses an unsupported protocol and cannot be opened directly.</p>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Redirect Warning - Slugly</title>
<style>body{font-family:'Hanken Grotesk',system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#F4F4FB;color:#14152B}
.container{text-align:center;padding:2rem;max-width:500px;background:white;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.08)}
.icon{font-size:2.5rem;margin-bottom:1rem}h1{font-size:1.25rem;margin-bottom:0.5rem;font-weight:600}p{color:#6b7280;line-height:1.6;font-size:0.9rem}
.url{background:#f3f4f6;padding:0.5rem 1rem;border-radius:6px;word-break:break-all;font-family:monospace;font-size:0.8rem;margin:1rem 0}
.btn{display:inline-block;padding:0.75rem 2rem;background:#5A3FF0;color:white;border-radius:8px;text-decoration:none;font-weight:600;margin-top:1rem}
.btn:hover{background:#4930d0}.report{margin-top:1.5rem;font-size:0.8rem}
a{color:#5A3FF0;text-decoration:none}a:hover{text-decoration:underline}</style>
</head><body><div class="container"><div class="icon">⚠️</div><h1>You're about to leave Slugly</h1>
<p>This link was created anonymously. Verify the destination before proceeding.</p>
<div class="url">${escapedDest}</div>${hrefWarning}
<a class="btn" href="${safeHref}">Continue to destination →</a>
<p class="report"><a href="/report?code=${escapedCode}">Report this link</a></p>
</div></body></html>`;
}

// ============ DEEP LINK INTERSTITIAL ============
function renderDeepLinkPage(scheme: string, webFallback: string, shortCode: string) {
  const escapedScheme = escapeHtml(scheme);
  const escapedFallback = escapeHtml(webFallback);
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Opening App - Slugly</title>
<style>body{font-family:'Hanken Grotesk',system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#F4F4FB;color:#14152B}
.container{text-align:center;padding:2rem;max-width:400px}.spinner{width:32px;height:32px;border:3px solid #e5e7eb;border-top-color:#5A3FF0;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 1rem}
@keyframes spin{to{transform:rotate(360deg)}}h1{font-size:1.25rem;margin-bottom:0.5rem;font-weight:600}p{color:#6b7280;line-height:1.6;font-size:0.9rem}
a{color:#5A3FF0;text-decoration:none;font-weight:500}a:hover{text-decoration:underline}</style>
</head><body><div class="container"><div class="spinner"></div><h1>Opening app...</h1>
<p>If the app doesn't open, <a href="${escapedFallback}">continue in browser</a></p>
</div>
<script>
(function(){
  var scheme = ${JSON.stringify(scheme)};
  var fallback = ${JSON.stringify(webFallback)};
  var timeout = setTimeout(function(){ window.location.href = fallback; }, 2500);
  window.addEventListener('blur', function(){ clearTimeout(timeout); });
  window.location.href = scheme;
})();
</script>
</body></html>`;
}

// ============ PIXEL INTERSTITIAL ============
function renderPixelInterstitial(pixels: Array<{type: string; pixelId: string}>, destination: string, delayMs: number) {
  const escapedDest = escapeHtml(destination);
  // Generate pixel scripts
  const pixelScripts = pixels.map(p => {
    switch (p.type) {
      case "facebook":
        return `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${escapeHtml(p.pixelId)}');fbq('track','PageView');`;
      case "google":
        return `(function(){var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id=${escapeHtml(p.pixelId)}';document.head.appendChild(s);window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${escapeHtml(p.pixelId)}');})();`;
      case "tiktok":
        return `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;ttq._t=ttq._t||{};ttq._t[e+"_"+n]=+new Date;(function(t,e){var n=t.getElementsByTagName("script")[0];var s=t.createElement("script");s.type="text/javascript";s.async=!0;s.src=e;n.parentNode.insertBefore(s,n)})(d,i)};ttq.load('${escapeHtml(p.pixelId)}');ttq.page();}(window,document,'ttq');`;
      case "linkedin":
        return `_linkedin_partner_id="${escapeHtml(p.pixelId)}";(function(l){if(!l){window._linkedin_data_partner_ids=window._linkedin_data_partner_ids||[];window._linkedin_data_partner_ids.push(_linkedin_partner_id);}var s=document.getElementsByTagName("script")[0];var b=document.createElement("script");b.type="text/javascript";b.async=true;b.src="https://snap.licdn.com/li.lms-analytics/insight.min.js";s.parentNode.insertBefore(b,s);})(window._linkedin_partner_id);`;
      default:
        // Custom pixel: just load as image beacon
        return `new Image().src='${escapeHtml(p.pixelId)}';`;
    }
  }).join("\n");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Redirecting... - Slugly</title>
<style>body{font-family:'Hanken Grotesk',system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#F4F4FB;color:#14152B}
.container{text-align:center;padding:2rem}.spinner{width:28px;height:28px;border:3px solid #e5e7eb;border-top-color:#5A3FF0;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 1rem}
@keyframes spin{to{transform:rotate(360deg)}}p{color:#6b7280;font-size:0.9rem}</style>
</head><body><div class="container"><div class="spinner"></div><p>Redirecting...</p></div>
<script>
${pixelScripts}
setTimeout(function(){ window.location.href = ${JSON.stringify(destination)}; }, ${delayMs});
</script>
</body></html>`;
}

export { redirectRouter, RESERVED_SLUGS };
