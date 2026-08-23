import { Router, type NextFunction, type Request, type Response } from "express";
import { resolveTxt } from "node:dns/promises";
import net from "node:net";
import { and, eq, isNull } from "drizzle-orm";
import { domains, links, projects } from "../drizzle/schema";
import { createContext } from "./_core/context";
import { getDb, getLinkByShortCode } from "./db";
import { checkLimit, countWorkspaceDomains, getPlanConfig } from "./workspace";

const RENDER_API_BASE = "https://api.render.com/v1";
const DEFAULT_CNAME_TARGET = "slugly.onrender.com";
const DEFAULT_APP_HOSTS = new Set([
  "slugly.io",
  "www.slugly.io",
  "slugly.onrender.com",
  "localhost",
  "127.0.0.1",
]);

class RenderApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "RenderApiError";
  }
}

export function normalizeCustomHostname(value: string): string {
  let hostname = value.trim().toLowerCase();
  hostname = hostname.replace(/^https?:\/\//i, "");
  hostname = hostname.split("/")[0] || "";
  hostname = hostname.replace(/\.$/, "");
  if (hostname.includes(":")) hostname = hostname.split(":")[0];
  return hostname;
}

export function validateCustomHostname(value: string): string | null {
  const hostname = normalizeCustomHostname(value);
  const labels = hostname.split(".");

  if (!hostname) return "Enter a subdomain, for example go.yourbrand.com.";
  if (hostname.length > 253) return "Domain is too long.";
  if (net.isIP(hostname)) return "IP addresses cannot be used as custom domains.";
  if (labels.length < 3) return "Use a subdomain such as go.yourbrand.com, not the root domain.";
  if (labels.some(label => label.length < 1 || label.length > 63)) {
    return "Every domain part must be between 1 and 63 characters.";
  }
  if (labels.some(label => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
    return "Use only letters, numbers, and hyphens in the domain.";
  }
  if (/^\d+$/.test(labels[labels.length - 1])) return "Top-level domain cannot be only numbers.";
  if (DEFAULT_APP_HOSTS.has(hostname) || hostname.endsWith(".slugly.io")) {
    return "Slugly-owned domains cannot be added as customer domains.";
  }
  return null;
}

function getCnameTarget() {
  return process.env.CUSTOM_DOMAIN_CNAME_TARGET?.trim() || DEFAULT_CNAME_TARGET;
}

function getRenderConfig() {
  const enabled = process.env.CUSTOM_DOMAINS_ENABLED === "true";
  const apiKey = process.env.RENDER_API_KEY?.trim();
  const serviceId = process.env.RENDER_CUSTOM_DOMAIN_SERVICE_ID?.trim();

  if (!enabled) throw new Error("Custom domain provisioning is disabled.");
  if (!apiKey) throw new Error("Custom domain provider is not configured.");
  if (!serviceId) throw new Error("Custom domain service is not configured.");

  return { apiKey, serviceId, cnameTarget: getCnameTarget() };
}

function renderErrorMessage(payload: any, fallback: string) {
  if (typeof payload?.message === "string") return payload.message;
  if (typeof payload?.error === "string") return payload.error;
  if (typeof payload?.error?.message === "string") return payload.error.message;
  return fallback;
}

async function renderRequest(path: string, init: RequestInit = {}) {
  const { apiKey } = getRenderConfig();
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${RENDER_API_BASE}${path}`, {
        ...init,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(init.headers || {}),
        },
      });

      if (response.status === 204) return null;
      const text = await response.text();
      let payload: any = null;
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = { message: text };
        }
      }

      if (response.ok) return payload;
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 400 * 2 ** attempt));
        continue;
      }
      throw new RenderApiError(
        response.status,
        renderErrorMessage(payload, `Render API request failed with HTTP ${response.status}`)
      );
    } catch (error) {
      lastError = error;
      if (error instanceof RenderApiError) throw error;
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 400 * 2 ** attempt));
        continue;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Render API request failed");
}

function unwrapRenderDomain(payload: any): any {
  return payload?.customDomain ?? payload?.custom_domain ?? payload;
}

export function getRenderVerificationStatus(payload: any): string {
  const domain = unwrapRenderDomain(payload);
  const raw = domain?.verificationStatus ?? domain?.verification_status ?? domain?.status ?? "unknown";
  return String(raw).toLowerCase();
}

async function getRenderDomain(hostname: string) {
  const { serviceId } = getRenderConfig();
  try {
    return await renderRequest(
      `/services/${encodeURIComponent(serviceId)}/custom-domains/${encodeURIComponent(hostname)}`
    );
  } catch (error) {
    if (error instanceof RenderApiError && error.status === 404) return null;
    throw error;
  }
}

async function ensureRenderDomain(hostname: string) {
  const existing = await getRenderDomain(hostname);
  if (existing) return existing;

  const { serviceId } = getRenderConfig();
  try {
    return await renderRequest(`/services/${encodeURIComponent(serviceId)}/custom-domains`, {
      method: "POST",
      body: JSON.stringify({ name: hostname }),
    });
  } catch (error) {
    if (error instanceof RenderApiError && error.status === 409) {
      const retry = await getRenderDomain(hostname);
      if (retry) return retry;
    }
    throw error;
  }
}

async function triggerRenderVerification(hostname: string) {
  const { serviceId } = getRenderConfig();
  return renderRequest(
    `/services/${encodeURIComponent(serviceId)}/custom-domains/${encodeURIComponent(hostname)}/verify`,
    { method: "POST" }
  );
}

async function deleteRenderDomain(hostname: string) {
  const { serviceId } = getRenderConfig();
  try {
    await renderRequest(
      `/services/${encodeURIComponent(serviceId)}/custom-domains/${encodeURIComponent(hostname)}`,
      { method: "DELETE" }
    );
  } catch (error) {
    if (error instanceof RenderApiError && error.status === 404) return;
    throw error;
  }
}

async function verifyTxtOwnership(hostname: string, token: string | null) {
  if (!token) return false;
  try {
    const records = await resolveTxt(`_slugly.${hostname}`);
    return records.map(parts => parts.join("")).some(value => value.trim() === token);
  } catch {
    return false;
  }
}

async function getAuthenticatedContext(req: Request, res: Response) {
  const ctx = await createContext({ req, res } as any);
  if (!ctx.user || !ctx.workspace || !ctx.membership) {
    const error: any = new Error("Authentication required");
    error.status = 401;
    throw error;
  }
  return ctx as typeof ctx & {
    user: NonNullable<typeof ctx.user>;
    workspace: NonNullable<typeof ctx.workspace>;
    membership: NonNullable<typeof ctx.membership>;
  };
}

function assertCanEdit(role: string) {
  if (role === "viewer") {
    const error: any = new Error("Viewer access is read-only");
    error.status = 403;
    throw error;
  }
}

function sendApiError(res: Response, error: any) {
  const status = Number(error?.status || (error instanceof RenderApiError ? error.status : 500));
  const safeStatus = status >= 400 && status < 600 ? status : 500;
  const message =
    error instanceof RenderApiError
      ? `Custom domain provider error: ${error.message}`
      : error?.message || "Custom domain operation failed";
  return res.status(safeStatus).json({ error: message });
}

async function migrateLegacyDomains(userId: number, workspaceId: number) {
  const database = await getDb();
  if (!database) return;
  await database
    .update(domains)
    .set({ workspaceId, verified: false })
    .where(and(eq(domains.userId, userId), isNull(domains.workspaceId)));
}

async function getWorkspaceDomains(workspaceId: number) {
  const database = await getDb();
  if (!database) return [];
  return database.select().from(domains).where(eq(domains.workspaceId, workspaceId));
}

export const customDomainsApiRouter = Router();

customDomainsApiRouter.get("/", async (req, res) => {
  try {
    const ctx = await getAuthenticatedContext(req, res);
    await migrateLegacyDomains(ctx.user.id, ctx.workspace.id);
    const [items, planConfig] = await Promise.all([
      getWorkspaceDomains(ctx.workspace.id),
      getPlanConfig(ctx.workspace.plan as any),
    ]);
    return res.json({
      domains: items,
      usage: items.length,
      limit: planConfig.limits.domains,
      cnameTarget: getCnameTarget(),
    });
  } catch (error) {
    return sendApiError(res, error);
  }
});

customDomainsApiRouter.post("/", async (req, res) => {
  try {
    const ctx = await getAuthenticatedContext(req, res);
    assertCanEdit(ctx.membership.role);

    const hostname = normalizeCustomHostname(String(req.body?.hostname || ""));
    const validationError = validateCustomHostname(hostname);
    if (validationError) return res.status(400).json({ error: validationError });

    await migrateLegacyDomains(ctx.user.id, ctx.workspace.id);
    const planConfig = await getPlanConfig(ctx.workspace.plan as any);
    const currentCount = await countWorkspaceDomains(ctx.workspace.id);
    const limitCheck = checkLimit(planConfig, "domains", currentCount);
    if (!limitCheck.allowed) {
      return res.status(403).json({
        error: `Custom domain limit reached for the ${ctx.workspace.plan} plan (${limitCheck.limit}).`,
        code: "DOMAIN_LIMIT_REACHED",
        limit: limitCheck.limit,
        current: limitCheck.current,
      });
    }

    const database = await getDb();
    if (!database) return res.status(503).json({ error: "Database unavailable" });
    const [existing] = await database.select().from(domains).where(eq(domains.hostname, hostname)).limit(1);
    if (existing) return res.status(409).json({ error: "This domain is already connected to Slugly." });

    // Do not consume a Render custom-domain slot before ownership is proven.
    // The Render domain is provisioned only after the user publishes Slugly's TXT token.
    const { randomUUID } = await import("node:crypto");
    const verificationToken = `slugly-verify-${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const result = await database.insert(domains).values({
      userId: ctx.user.id,
      workspaceId: ctx.workspace.id,
      hostname,
      verificationToken,
      verified: false,
    });
    const id = result[0].insertId;

    return res.status(201).json({
      id,
      hostname,
      verificationToken,
      verified: false,
      cnameTarget: getCnameTarget(),
      txtHost: `_slugly.${hostname}`,
      shortUrlFormat: `https://${hostname}/{short-code}`,
    });
  } catch (error) {
    return sendApiError(res, error);
  }
});

customDomainsApiRouter.post("/:id/verify", async (req, res) => {
  try {
    const ctx = await getAuthenticatedContext(req, res);
    assertCanEdit(ctx.membership.role);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid domain id" });

    const database = await getDb();
    if (!database) return res.status(503).json({ error: "Database unavailable" });
    const [domain] = await database
      .select()
      .from(domains)
      .where(and(eq(domains.id, id), eq(domains.workspaceId, ctx.workspace.id)))
      .limit(1);
    if (!domain) return res.status(404).json({ error: "Domain not found" });

    const txtVerified = await verifyTxtOwnership(domain.hostname, domain.verificationToken);
    if (!txtVerified) {
      await database.update(domains).set({ verified: false }).where(eq(domains.id, id));
      return res.status(409).json({
        error: `TXT verification failed. Add _slugly.${domain.hostname} with the exact verification token and try again.`,
        txtVerified: false,
      });
    }

    // Ownership is proven before provisioning the hostname on Render. This prevents
    // third parties from consuming provider slots for domains they do not control.
    await ensureRenderDomain(domain.hostname);
    await triggerRenderVerification(domain.hostname);

    let providerPayload = await getRenderDomain(domain.hostname);
    let providerStatus = getRenderVerificationStatus(providerPayload);
    for (let attempt = 0; attempt < 5 && providerStatus !== "verified"; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 800));
      providerPayload = await getRenderDomain(domain.hostname);
      providerStatus = getRenderVerificationStatus(providerPayload);
    }

    const active = providerStatus === "verified";
    await database.update(domains).set({ verified: active }).where(eq(domains.id, id));

    return res.status(active ? 200 : 202).json({
      verified: active,
      txtVerified: true,
      providerStatus,
      message: active
        ? "Domain verified and HTTPS routing is active."
        : "Ownership is verified. Render is still verifying DNS or issuing HTTPS; try Verify again shortly.",
    });
  } catch (error) {
    return sendApiError(res, error);
  }
});

customDomainsApiRouter.delete("/:id", async (req, res) => {
  try {
    const ctx = await getAuthenticatedContext(req, res);
    assertCanEdit(ctx.membership.role);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid domain id" });

    const database = await getDb();
    if (!database) return res.status(503).json({ error: "Database unavailable" });
    const [domain] = await database
      .select()
      .from(domains)
      .where(and(eq(domains.id, id), eq(domains.workspaceId, ctx.workspace.id)))
      .limit(1);
    if (!domain) return res.status(404).json({ error: "Domain not found" });

    await deleteRenderDomain(domain.hostname);
    await database.update(links).set({ domainId: null }).where(eq(links.domainId, domain.id));
    await database.delete(domains).where(eq(domains.id, domain.id));
    return res.status(204).end();
  } catch (error) {
    return sendApiError(res, error);
  }
});

customDomainsApiRouter.patch("/links/:linkId", async (req, res) => {
  try {
    const ctx = await getAuthenticatedContext(req, res);
    assertCanEdit(ctx.membership.role);
    const linkId = Number(req.params.linkId);
    if (!Number.isInteger(linkId) || linkId <= 0) return res.status(400).json({ error: "Invalid link id" });

    const domainIdRaw = req.body?.domainId;
    const domainId = domainIdRaw === null || domainIdRaw === undefined || domainIdRaw === "" ? null : Number(domainIdRaw);
    if (domainId !== null && (!Number.isInteger(domainId) || domainId <= 0)) {
      return res.status(400).json({ error: "Invalid domain id" });
    }

    const database = await getDb();
    if (!database) return res.status(503).json({ error: "Database unavailable" });
    const [link] = await database.select().from(links).where(eq(links.id, linkId)).limit(1);
    if (!link) return res.status(404).json({ error: "Link not found" });

    let belongsToWorkspace = link.userId === ctx.user.id;
    if (link.projectId) {
      const [project] = await database.select().from(projects).where(eq(projects.id, link.projectId)).limit(1);
      belongsToWorkspace = project?.workspaceId === ctx.workspace.id;
    }
    if (!belongsToWorkspace) return res.status(404).json({ error: "Link not found" });

    if (domainId === null) {
      await database.update(links).set({ domainId: null }).where(eq(links.id, linkId));
      return res.json({ domainId: null, shortUrl: `https://slugly.io/r/${link.shortCode}` });
    }

    const [domain] = await database
      .select()
      .from(domains)
      .where(and(eq(domains.id, domainId), eq(domains.workspaceId, ctx.workspace.id), eq(domains.verified, true)))
      .limit(1);
    if (!domain) return res.status(409).json({ error: "Choose a verified custom domain." });

    await database.update(links).set({ domainId: domain.id }).where(eq(links.id, linkId));
    return res.json({
      domainId: domain.id,
      hostname: domain.hostname,
      shortUrl: `https://${domain.hostname}/${link.shortCode}`,
    });
  } catch (error) {
    return sendApiError(res, error);
  }
});

/**
 * Host-aware rewrite for active branded short domains.
 * A request to https://go.brand.com/code is internally routed through the
 * existing /r/code quarantine + redirect pipeline so analytics and rules stay identical.
 */
export async function customDomainRoutingMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const hostname = normalizeCustomHostname(req.hostname || req.headers.host || "");
    if (!hostname || DEFAULT_APP_HOSTS.has(hostname)) return next();

    const database = await getDb();
    if (!database) return res.status(503).send("Service temporarily unavailable");
    const [domain] = await database
      .select()
      .from(domains)
      .where(and(eq(domains.hostname, hostname), eq(domains.verified, true)))
      .limit(1);
    if (!domain) return res.status(404).send("Custom domain is not active");

    const rawPath = req.path || "/";
    if (rawPath === "/") {
      return res.status(200).type("html").send(
        "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Short links powered by Slugly</title></head><body style=\"font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f6f6fb;color:#17172b\"><main style=\"text-align:center;padding:32px\"><h1 style=\"font-size:22px\">Branded short domain is active</h1><p style=\"color:#666\">Short links on this domain are powered by Slugly.</p></main></body></html>"
      );
    }

    const directMatch = rawPath.match(/^\/([a-zA-Z0-9_-]{3,32})\/?$/);
    const legacyMatch = rawPath.match(/^\/r\/([a-zA-Z0-9_-]{3,32})\/?$/);
    const shortCode = directMatch?.[1] || legacyMatch?.[1];
    if (!shortCode) return res.status(404).send("Link not found");

    const link = await getLinkByShortCode(shortCode);
    if (!link || link.domainId !== domain.id) return res.status(404).send("Link not found");

    if (directMatch) {
      const queryIndex = req.url.indexOf("?");
      const query = queryIndex >= 0 ? req.url.slice(queryIndex) : "";
      req.url = `/r/${shortCode}${query}`;
    }
    return next();
  } catch (error) {
    console.error("[CustomDomains] Routing middleware failed:", error);
    return res.status(500).send("Internal server error");
  }
}

export async function checkCustomDomainProviderOnStartup() {
  if (process.env.CUSTOM_DOMAINS_ENABLED !== "true") {
    console.log("[CustomDomains] Provider disabled");
    return;
  }
  try {
    const { serviceId } = getRenderConfig();
    await renderRequest(`/services/${encodeURIComponent(serviceId)}/custom-domains?limit=1`);
    console.log("[CustomDomains] Render API ready");
  } catch (error: any) {
    console.error("[CustomDomains] Render API check failed:", error?.message || error);
  }
}
