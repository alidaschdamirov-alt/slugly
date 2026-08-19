import "dotenv/config";
import { initSentry } from "../sentry";
initSentry();
import { clerkMiddleware } from "@clerk/express";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageRoutes } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { redirectRouter } from "../redirect";
import { backupHandler } from "../backup";
import { isAuthorizedCronRequest } from "./cronAuth";

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
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(
    clerkMiddleware({
      publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY,
      secretKey: process.env.CLERK_SECRET_KEY,
    })
  );
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // Health check endpoint
  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime(), timestamp: Date.now() });
  });

  // Link analytics supplement: bot-filtered total and unique clicks for a single link.
  app.get("/api/link/:id/unique-clicks", async (req, res) => {
    try {
      const linkId = Number(req.params.id);
      if (!Number.isFinite(linkId) || linkId <= 0) {
        return res.status(400).json({ error: "Invalid link id" });
      }

      const { sdk } = await import("./sdk");
      const user = await sdk.authenticateRequest(req);
      const { getLinkById, getClickCountByLinkIdFiltered } = await import(
        "../db"
      );
      const link = await getLinkById(linkId);
      if (!link || link.userId !== user.id) {
        return res.status(404).json({ error: "Link not found" });
      }

      const counts = await getClickCountByLinkIdFiltered(linkId, true);
      return res.json({
        clickCount: counts.total,
        uniqueClicks: counts.unique,
      });
    } catch (err: any) {
      const status = err?.code === "FORBIDDEN" ? 401 : 500;
      return res.status(status).json({ error: err?.message || "Failed" });
    }
  });

  // Scheduled task handlers (must be before Vite/static fallthrough)
  app.post("/api/scheduled/backup", backupHandler);
  app.post("/api/scheduled/notify-expiring-links", async (req, res) => {
    try {
      if (!isAuthorizedCronRequest(req)) {
        return res.status(403).json({ error: "cron-only" });
      }

      const { getDb } = await import("../db");
      const { getEmailConfig, sendTemplatedEmail } = await import("../email");
      const { links } = await import("../../drizzle/schema");
      const { and, isNull, between, eq } = await import("drizzle-orm");

      const config = await getEmailConfig();
      if (!config.enabled) {
        return res.json({ ok: true, skipped: "email disabled" });
      }

      const database = await getDb();
      if (!database) return res.status(500).json({ error: "DB unavailable" });
      const now = Date.now();
      const threeDaysFromNow = now + 3 * 24 * 60 * 60 * 1000;
      const fourDaysFromNow = now + 4 * 24 * 60 * 60 * 1000;

      // Find anonymous links (userId=0) expiring in 3-4 days
      const expiringLinks = await database
        .select()
        .from(links)
        .where(
          and(
            eq(links.userId, 0),
            between(links.expiresAt, threeDaysFromNow, fourDaysFromNow)
          )
        )
        .limit(50);

      // Send notification to admin about expiring anonymous links
      if (expiringLinks.length > 0) {
        const adminEmail = config.senderEmail;
        for (const link of expiringLinks) {
          const expiryDate = new Date(
            Number(link.expiresAt)
          ).toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
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
      res
        .status(500)
        .json({ error: err.message, timestamp: new Date().toISOString() });
    }
  });

  app.post("/api/scheduled/cleanup-rate-limits", async (req, res) => {
    try {
      if (!isAuthorizedCronRequest(req)) {
        return res.status(403).json({ error: "cron-only" });
      }
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
  // Short link redirect handler (after API routes, before Vite/static)
  app.use("/r", redirectRouter);
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
