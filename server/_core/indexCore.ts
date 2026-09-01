import "dotenv/config";
import { initSentry } from "../sentry";
initSentry();
import { clerkMiddleware } from "@clerk/express";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageRoutes } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { sdk } from "./sdk";
import { serveStatic, setupVite } from "./vite";
import { redirectRouter } from "../redirect";
import { quarantineGuardRouter } from "../quarantineGuard";
import { securityStateRouter } from "../securityStateApi";
import { systemHealthRouter } from "../systemHealthApi";
import { abuseWorkflowRouter } from "../abuseWorkflowApi";
import { projectLinksPageRouter } from "../projectLinksPageApi";
import { backgroundJobTelemetryMiddleware, systemHealthMetricsMiddleware } from "../systemHealth";
import { impersonationRouter } from "../impersonationApi";
import { resolveImpersonation } from "../impersonation";
import { deepLinksApiRouter } from "../deepLinksApi";
import { isPrivilegedRole } from "../adminAccess";
import { isPrivilegedIpAllowed } from "../privilegedIp";
import { backupHandler } from "../backup";
import { isAuthorizedCronRequest } from "./cronAuth";
import { getDestinationUrlError, normalizeDestinationUrl } from "../../shared/validation/destination-url";
import {
  checkCustomDomainProviderOnStartup,
  customDomainRoutingMiddleware,
  customDomainsApiRouter,
} from "../customDomainsApi";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

class DestinationUrlValidationError extends Error {}

function getProcedureNames(req: Request) {
  return req.path.replace(/^\/+/, "").split(",").map(name => name.trim()).filter(Boolean);
}

function normalizeUrlFields(value: unknown, keys: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) return value.map(item => normalizeUrlFields(item, keys));
  if (!value || typeof value !== "object") return value;

  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (keys.has(key) && typeof child === "string") {
      const error = getDestinationUrlError(child);
      if (error) throw new DestinationUrlValidationError(error);
      next[key] = normalizeDestinationUrl(child);
    } else {
      next[key] = normalizeUrlFields(child, keys);
    }
  }
  return next;
}

function validateDestinationUrlsBeforeTrpc(req: Request, res: Response, next: NextFunction) {
  const procedures = getProcedureNames(req);
  const shouldValidateDestinationUrl = procedures.some(name => ["link.create", "link.update", "link.createBulk"].includes(name));
  const shouldValidateAnonymousUrl = procedures.includes("link.shortenAnonymous");
  if (!shouldValidateDestinationUrl && !shouldValidateAnonymousUrl) return next();

  const keys = new Set<string>();
  if (shouldValidateDestinationUrl) keys.add("destinationUrl");
  if (shouldValidateAnonymousUrl) keys.add("url");

  try {
    if (req.body && typeof req.body === "object") req.body = normalizeUrlFields(req.body, keys);
    if (typeof req.query.input === "string") {
      const parsedInput = JSON.parse(req.query.input);
      req.query.input = JSON.stringify(normalizeUrlFields(parsedInput, keys));
    }
  } catch (error) {
    const message = error instanceof DestinationUrlValidationError
      ? error.message
      : "Enter a valid URL, for example https://example.com/page";
    return res.status(400).json({ error: { message, code: "BAD_REQUEST" } });
  }
  return next();
}

function blockLegacyDomainMutations(req: Request, res: Response, next: NextFunction) {
  const procedures = getProcedureNames(req);
  const blocked = procedures.some(name => ["domain.create", "domain.verify", "domain.delete"].includes(name));
  if (!blocked) return next();
  return res.status(410).json({
    error: {
      message: "Custom domain mutations moved to the managed custom-domain API.",
      code: "GONE",
    },
  });
}

async function startServer() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(clerkMiddleware({
    publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
  }));
  const server = createServer(app);
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use(systemHealthMetricsMiddleware);
  app.use(backgroundJobTelemetryMiddleware);
  registerStorageRoutes(app);

  app.use("/api/impersonation", impersonationRouter);
  app.use("/api/deeplinks", deepLinksApiRouter);
  app.use("/api/custom-domains", customDomainsApiRouter);

  app.use(
    "/api/trpc",
    blockLegacyDomainMutations,
    validateDestinationUrlsBeforeTrpc,
    createExpressMiddleware({ router: appRouter, createContext })
  );

  app.use("/api/security", securityStateRouter);
  app.use("/api/system-health", systemHealthRouter);
  app.use("/api/abuse-workflow", abuseWorkflowRouter);
  app.use("/api/project-links", projectLinksPageRouter);

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime(), timestamp: Date.now() });
  });

  app.get("/api/link/:id/unique-clicks", async (req, res) => {
    try {
      const linkId = Number(req.params.id);
      if (!Number.isFinite(linkId) || linkId <= 0) return res.status(400).json({ error: "Invalid link id" });

      const actor = await sdk.authenticateRequest(req);
      const impersonation = await resolveImpersonation(req, actor);
      const user = impersonation?.target || actor;
      const { getLinkById, getClickCountByLinkIdFiltered } = await import("../db");
      const link = await getLinkById(linkId);
      if (!link || link.userId !== user.id) return res.status(404).json({ error: "Link not found" });

      const counts = await getClickCountByLinkIdFiltered(linkId, true);
      return res.json({ clickCount: counts.total, uniqueClicks: counts.unique });
    } catch (err: any) {
      const status = err?.code === "FORBIDDEN" ? 401 : 500;
      return res.status(status).json({ error: err?.message || "Failed" });
    }
  });

  app.post("/api/scheduled/backup", backupHandler);
  app.post("/api/scheduled/notify-expiring-links", async (req, res) => {
    try {
      if (!isAuthorizedCronRequest(req)) return res.status(403).json({ error: "cron-only" });
      const { getDb } = await import("../db");
      const { getEmailConfig, sendTemplatedEmail } = await import("../email");
      const { links } = await import("../../drizzle/schema");
      const { and, between, eq } = await import("drizzle-orm");

      const config = await getEmailConfig();
      if (!config.enabled) return res.json({ ok: true, skipped: "email disabled" });
      const database = await getDb();
      if (!database) return res.status(500).json({ error: "DB unavailable" });
      const now = Date.now();
      const threeDaysFromNow = now + 3 * 24 * 60 * 60 * 1000;
      const fourDaysFromNow = now + 4 * 24 * 60 * 60 * 1000;
      const expiringLinks = await database
        .select()
        .from(links)
        .where(and(eq(links.userId, 0), between(links.expiresAt, threeDaysFromNow, fourDaysFromNow)))
        .limit(50);

      if (expiringLinks.length > 0) {
        const adminEmail = config.senderEmail;
        for (const link of expiringLinks) {
          const expiryDate = new Date(Number(link.expiresAt)).toLocaleDateString("en-US", {
            month: "long", day: "numeric", year: "numeric",
          });
          await sendTemplatedEmail("anonymousLinkExpiring", adminEmail, {
            shortCode: link.shortCode,
            destinationUrl: link.destinationUrl,
            expiryDate,
            signupUrl: `${req.protocol}://${req.get("host")}/auth`,
          });
        }
      }
      res.json({ ok: true, notified: expiringLinks.length });
    } catch (err: any) {
      console.error("[notify-expiring-links]", err);
      res.status(500).json({ error: err.message, timestamp: new Date().toISOString() });
    }
  });

  app.post("/api/scheduled/weekly-digest", async (req, res) => {
    const startedAt = Date.now();
    try {
      if (!isAuthorizedCronRequest(req)) return res.status(403).json({ error: "cron-only" });
      const { runWeeklyDigest } = await import("../weeklyDigest");
      const { recordBackgroundJobResult } = await import("../systemHealth");
      const result = await runWeeklyDigest();
      await recordBackgroundJobResult("weekly_digest", {
        success: true,
        durationMs: Date.now() - startedAt,
        processed: result.sent,
        detail: `Sent ${result.sent}; skipped ${result.skipped}`,
      });
      return res.json({ ok: true, ...result, durationMs: Date.now() - startedAt });
    } catch (err: any) {
      const { recordBackgroundJobResult } = await import("../systemHealth");
      await recordBackgroundJobResult("weekly_digest", {
        success: false,
        durationMs: Date.now() - startedAt,
        detail: err?.message || "Weekly digest failed",
      }).catch(() => undefined);
      return res.status(500).json({ error: "Weekly digest failed. Check System Health for details." });
    }
  });

  app.post("/api/scheduled/cleanup-rate-limits", async (req, res) => {
    try {
      if (!isAuthorizedCronRequest(req)) return res.status(403).json({ error: "cron-only" });
      const { cleanupExpiredRateLimits } = await import("../rateLimit");
      const { getDb } = await import("../db");
      const database = await getDb();
      const deleted = await cleanupExpiredRateLimits(database, 600_000);
      res.json({ ok: true, deleted });
    } catch (err: any) {
      console.error("[cleanup-rate-limits]", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/scheduled/safe-browsing-rescan", async (req, res) => {
    const startedAt = Date.now();
    try {
      if (!isAuthorizedCronRequest(req)) return res.status(403).json({ error: "cron-only" });
      const { rescanActiveLinksWithSafeBrowsing } = await import("../safeBrowsingRescan");
      const requestedLimit = Number(req.body?.limit || process.env.SAFE_BROWSING_RESCAN_LIMIT || 250);
      const limit = Number.isFinite(requestedLimit) ? requestedLimit : 250;
      const result = await rescanActiveLinksWithSafeBrowsing(limit);
      return res.json({ ok: true, ...result, durationMs: Date.now() - startedAt, timestamp: new Date().toISOString() });
    } catch (err: any) {
      console.error("[safe-browsing-rescan]", err);
      return res.status(500).json({
        error: err.message || "Safe Browsing re-scan failed",
        durationMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.use(customDomainRoutingMiddleware);
  app.use("/r", quarantineGuardRouter);
  app.use("/r", redirectRouter);

  app.get("/admin", async (req, res, next) => {
    try {
      const actor = await sdk.authenticateRequest(req);
      if (!isPrivilegedRole(actor.role)) return res.status(403).send("Forbidden");
      if (!sdk.hasVerifiedSecondFactor(req)) {
        return res.status(403).send("Two-factor authentication is required for admin and support tools.");
      }
      if (!(await isPrivilegedIpAllowed(req))) {
        return res.status(403).send("This IP address is not allowed to use admin and support tools.");
      }
      return next();
    } catch {
      return res.status(403).send("Forbidden");
    }
  });

  if (process.env.NODE_ENV === "development") await setupVite(app, server);
  else serveStatic(app);

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  server.listen(port, () => console.log(`Server running on http://localhost:${port}/`));
  void checkCustomDomainProviderOnStartup();
}

startServer().catch(console.error);