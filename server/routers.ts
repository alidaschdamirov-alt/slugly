import { systemRouter } from "./_core/systemRouter";
import {
  publicProcedure,
  protectedProcedure,
  adminProcedure,
  router,
  workspaceProcedure,
  editorProcedure,
  wsAdminProcedure,
} from "./_core/trpc";
import { z } from "zod";
import { nanoid } from "nanoid";
import * as db from "./db";
import { isReservedSlug } from "./redirect";
import * as ws from "./workspace";
import { buildGs1DigitalLinkUrl, normalizeGs1Qualifier, validateGtin } from "../shared/gs1";

function normalizeHttpUrl(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  let parsed: URL;
  try { parsed = new URL(value.trim()); } catch { throw new Error(`${label} must be a valid URL.`); }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error(`${label} must use http or https.`);
  return parsed.toString();
}

function normalizeAppScheme(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const trimmed = value.trim();
  let parsed: URL;
  try { parsed = new URL(trimmed); } catch { throw new Error(`${label} must be a valid app URL such as myapp://product/123.`); }
  if (["javascript:", "data:", "file:"].includes(parsed.protocol)) throw new Error(`${label} uses a blocked URL scheme.`);
  return parsed.toString();
}

function normalizeSha256Fingerprint(value: unknown) {
  const raw = String(value || "").trim().replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (raw.length !== 64) throw new Error("Android SHA-256 fingerprint must contain exactly 64 hexadecimal characters.");
  return raw.match(/.{2}/g)!.join(":");
}

function normalizeDeepLinkConfig(raw: Record<string, any>) {
  const webFallback = normalizeHttpUrl(raw?.webFallback, "Web fallback URL");
  const iosRaw = raw?.ios && typeof raw.ios === "object" ? raw.ios : null;
  const androidRaw = raw?.android && typeof raw.android === "object" ? raw.android : null;

  const ios = iosRaw ? {
    scheme: normalizeAppScheme(iosRaw.scheme, "iOS app scheme"),
    appStoreUrl: iosRaw.appStoreUrl ? normalizeHttpUrl(iosRaw.appStoreUrl, "App Store URL") : undefined,
    teamId: String(iosRaw.teamId || "").trim().toUpperCase() || undefined,
    bundleId: String(iosRaw.bundleId || "").trim() || undefined,
  } : undefined;
  if (ios && Boolean(ios.teamId) !== Boolean(ios.bundleId)) throw new Error("Apple Team ID and Bundle ID must be provided together.");
  if (ios?.teamId && !/^[A-Z0-9]{10}$/.test(ios.teamId)) throw new Error("Apple Team ID must be 10 letters/numbers.");
  if (ios?.bundleId && !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(ios.bundleId)) throw new Error("Bundle ID must look like com.company.app.");

  const fingerprints = Array.isArray(androidRaw?.sha256CertFingerprints)
    ? androidRaw.sha256CertFingerprints.map(normalizeSha256Fingerprint)
    : [];
  const android = androidRaw ? {
    scheme: normalizeAppScheme(androidRaw.scheme, "Android app scheme"),
    playStoreUrl: androidRaw.playStoreUrl ? normalizeHttpUrl(androidRaw.playStoreUrl, "Play Store URL") : undefined,
    packageName: String(androidRaw.packageName || "").trim() || undefined,
    sha256CertFingerprints: fingerprints.length ? Array.from(new Set(fingerprints)) : undefined,
  } : undefined;
  if (android && Boolean(android.packageName) !== Boolean(android.sha256CertFingerprints?.length)) throw new Error("Android package name and SHA-256 fingerprint must be provided together.");
  if (android?.packageName && !/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(android.packageName)) throw new Error("Android package name must look like com.company.app.");

  if (!ios?.scheme && !ios?.teamId && !android?.scheme && !android?.packageName) {
    throw new Error("Configure at least an iOS or Android app scheme/native app association.");
  }

  return {
    ios,
    android,
    webFallback,
    fallbackDelayMs: Math.min(Math.max(Number(raw?.fallbackDelayMs || 2200), 800), 8000),
  };
}

async function assertLinkInWorkspace(linkId: number, workspaceId: number, userId: number) {
  const link = await db.getLinkById(linkId);
  if (!link) throw new Error("Link not found");
  if (link.projectId) {
    const project = await db.getProjectById(link.projectId);
    if (project?.workspaceId === workspaceId) return link;
  }
  if (link.userId === userId) return link;
  throw new Error("Link not found");
}
export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => {
      return {
        user: opts.ctx.user,
        workspace: opts.ctx.workspace,
        membership: opts.ctx.membership,
      };
    }),
    // Clerk owns the session lifecycle; the client calls Clerk's signOut().
    logout: publicProcedure.mutation(() => ({ success: true }) as const),
  }),

  // ============ PROJECTS ============
  project: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const projects = await db.getProjectsByUserId(ctx.user.id);
      const enriched = await Promise.all(
        projects.map(async project => {
          const projectLinks = await db.getLinksByProjectId(project.id);
          const linkIds = projectLinks.map(l => l.id);
          const clickCounts =
            linkIds.length > 0 ? await db.getClickCountsByLinkIds(linkIds) : {};
          const totalClicks = Object.values(clickCounts).reduce(
            (sum, c) => sum + c,
            0
          );
          // Get 7-day sparkline data for the project
          const sparkline =
            linkIds.length > 0 ? await db.getProjectSparkline(linkIds, 7) : [];
          return {
            ...project,
            linkCount: projectLinks.length,
            totalClicks,
            sparkline,
          };
        })
      );
      return enriched;
    }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.id);
        if (!project || project.userId !== ctx.user.id) return null;
        return project;
      }),

    create: editorProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          description: z.string().optional(),
          color: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Plan limit check via workspace
        const config = await ws.getPlanConfig(ctx.workspace.plan as any);
        const projectCount = await ws.countWorkspaceProjects(ctx.workspace.id);
        const limitCheck = ws.checkLimit(config, "projects", projectCount);
        if (!limitCheck.allowed) {
          const nextPlan = (await import("../shared/plans")).getNextPlan(
            ctx.workspace.plan as any
          );
          throw new Error(
            JSON.stringify({
              type: "LIMIT_REACHED",
              resource: "projects",
              limit: limitCheck.limit,
              current: limitCheck.current,
              currentPlan: ctx.workspace.plan,
              nextPlan,
            })
          );
        }
        return db.createProject({
          userId: ctx.user.id,
          workspaceId: ctx.workspace.id,
          name: input.name,
          description: input.description ?? null,
          color: input.color ?? "#6366f1",
        });
      }),

    update: editorProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(255).optional(),
          description: z.string().optional(),
          color: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.id);
        if (!project || project.userId !== ctx.user.id)
          throw new Error("Project not found");
        if (project.isSystem)
          throw new Error("System projects cannot be renamed");
        const { id, ...data } = input;
        await db.updateProject(id, data);
        return { success: true };
      }),

    delete: editorProcedure
      .input(
        z.object({
          id: z.number(),
          mode: z.enum(["cascade", "move"]).default("cascade"),
          targetProjectId: z.number().nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.id);
        if (!project || project.userId !== ctx.user.id)
          throw new Error("Project not found");
        if (project.isSystem)
          throw new Error("System projects cannot be deleted");

        if (input.mode === "move") {
          // Move links to system project (Other Links) instead of null
          const systemProjectId = await db.ensureSystemProject(
            ctx.workspace.id,
            ctx.user.id
          );
          await db.moveProjectLinks(
            input.id,
            input.targetProjectId ?? systemProjectId
          );
          await db.deleteProject(input.id);
        } else {
          // Cascade: delete project + all its links + all their clicks
          await db.deleteProjectCascade(input.id);
        }
        return { success: true };
      }),

    analytics: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          days: z.number().min(1).max(365).default(30),
        })
      )
      .query(async ({ ctx, input }) => {
        const project = await db.getProjectById(input.id);
        if (!project || project.userId !== ctx.user.id) return null;
        const stats = await db.getProjectClickStats(input.id, input.days);
        const topLinksWithDetails = await Promise.all(
          stats.topLinks.map(async tl => {
            const link = await db.getLinkById(tl.linkId);
            return { ...tl, link };
          })
        );
        return { ...stats, topLinks: topLinksWithDetails };
      }),
  }),

  // ============ LINKS ============
  link: router({
    // Anonymous shortening (rate-limited by IP in production)
    shortenAnonymous: publicProcedure
      .input(
        z.object({
          url: z.string().url(),
          captchaToken: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Basic URL validation
        const url = new URL(input.url);
        // Block common phishing patterns (hardcoded)
        const hardBlockedDomains = ["bit.ly", "tinyurl.com", "is.gd", "t.co"];
        if (hardBlockedDomains.includes(url.hostname)) {
          throw new Error("Cannot shorten already-shortened URLs");
        }
        // Check against admin-managed blocklist in database
        const isBlocked = await db.isHostnameBlocked(url.hostname);
        if (isBlocked) {
          throw new Error(
            "This domain has been blocked. Please use a different URL."
          );
        }
        // Safe Browsing check
        const { checkUrlSafety } = await import("./safeBrowsing");
        const safety = await checkUrlSafety(input.url);
        if (!safety.safe) {
          throw new Error(
            `URL rejected: ${safety.reason || "flagged as unsafe"}`
          );
        }
        // Turnstile CAPTCHA verification — enforce when configured
        const { verifyTurnstileToken, isTurnstileEnabled } = await import(
          "./rateLimit"
        );
        if (isTurnstileEnabled()) {
          if (!input.captchaToken) {
            throw new Error(
              "CAPTCHA token required. Please complete the verification."
            );
          }
          const valid = await verifyTurnstileToken(input.captchaToken);
          if (!valid) {
            throw new Error("CAPTCHA verification failed. Please try again.");
          }
        }

        // DB-backed rate limit by IP (5 per minute)
        const ip =
          (ctx.req.headers["x-forwarded-for"] as string) ||
          ctx.req.ip ||
          "unknown";
        const rateLimitKey = `anon_shorten_${ip}`;
        const { checkRateLimit } = await import("./rateLimit");
        const database = await db.getDb();
        const rl = await checkRateLimit(database, rateLimitKey, {
          windowMs: 60000,
          maxRequests: 5,
        });
        if (!rl.allowed) {
          throw new Error("Rate limit exceeded. Please try again in a minute.");
        }
        // Generate short code with collision/retired retry (up to 5 attempts)
        let shortCode = "";
        for (let attempt = 0; attempt < 5; attempt++) {
          const candidate = nanoid(6 + attempt); // Increase length on retry
          const isRetired = await db.isShortCodeRetired(candidate);
          if (isRetired) continue;
          const existing = await db.getLinkByShortCode(candidate);
          if (existing) continue;
          shortCode = candidate;
          break;
        }
        if (!shortCode) {
          throw new Error(
            "Unable to generate a unique short code. Please try again."
          );
        }
        // 30-day TTL for anonymous links
        const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
        const expiresAt = Date.now() + THIRTY_DAYS_MS;
        await db.createLink({
          shortCode,
          destinationUrl: input.url,
          userId: 0 as any, // 0 = anonymous (no owner)
          projectId: null,
          title: null,
          tags: [] as string[],
          utmSource: null,
          utmMedium: null,
          utmCampaign: null,
          utmTerm: null,
          utmContent: null,
          domainId: null,
          status: "active",
          expiresAt,
        });
        // Store shortCode in a cookie for claim flow after registration
        const existingCodes =
          ctx.req.headers.cookie?.match(/anon_links=([^;]+)/)?.[1] || "";
        const codes = existingCodes
          ? existingCodes.split(",").concat(shortCode)
          : [shortCode];
        // Keep only last 10 anonymous codes
        const trimmedCodes = codes.slice(-10).join(",");
        ctx.res.cookie("anon_links", trimmedCodes, {
          maxAge: THIRTY_DAYS_MS,
          httpOnly: false, // Needs to be readable by claim flow
          path: "/",
          sameSite: "lax",
        });
        return { shortCode, expiresAt };
      }),

    unassigned: protectedProcedure.query(async ({ ctx }) => {
      const unassignedLinks = await db.getUnassignedLinks(ctx.user.id);
      if (unassignedLinks.length === 0) return [];
      const linkIds = unassignedLinks.map(l => l.id);
      const clickCounts = await db.getClickCountsByLinkIds(linkIds);
      return unassignedLinks.map(link => ({
        ...link,
        clickCount: clickCounts[link.id] ?? 0,
      }));
    }),

    list: protectedProcedure
      .input(
        z
          .object({
            projectId: z.number().optional(),
            search: z.string().optional(),
            status: z.enum(["active", "paused"]).optional(),
            tag: z.string().optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        let userLinks;
        if (input?.tag) {
          // Filter by tag using JSON_CONTAINS
          userLinks = await db.getLinksByTag(ctx.user.id, input.tag);
          // Apply additional filters on top
          if (input.projectId) {
            userLinks = userLinks.filter(l => l.projectId === input.projectId);
          }
          if (input.status) {
            userLinks = userLinks.filter(l => l.status === input.status);
          }
          if (input.search) {
            const s = input.search.toLowerCase();
            userLinks = userLinks.filter(
              l =>
                l.shortCode.toLowerCase().includes(s) ||
                l.destinationUrl.toLowerCase().includes(s) ||
                (l.title && l.title.toLowerCase().includes(s))
            );
          }
        } else {
          userLinks = await db.getLinksByUserId(ctx.user.id, {
            projectId: input?.projectId,
            search: input?.search,
            status: input?.status,
          });
        }
        const linkIds = userLinks.map(l => l.id);
        const clickCounts =
          linkIds.length > 0 ? await db.getClickCountsByLinkIds(linkIds) : {};
        return userLinks.map(link => ({
          ...link,
          clickCount: clickCounts[link.id] ?? 0,
        }));
      }),

    get: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const link = await db.getLinkById(input.id);
        if (!link || link.userId !== ctx.user.id) return null;
        const clickCount = await db.getClickCountByLinkId(link.id);
        return { ...link, clickCount };
      }),

    sparklines: protectedProcedure
      .input(
        z.object({
          linkIds: z.array(z.number()),
          days: z.number().min(1).max(30).default(7),
        })
      )
      .query(async ({ ctx, input }) => {
        return db.getClicksOverTimeForLinks(input.linkIds, input.days);
      }),

    create: editorProcedure
      .input(
        z.object({
          destinationUrl: z.string().url(),
          projectId: z.number().optional(),
          title: z.string().max(500).optional(),
          tags: z.array(z.string()).optional(),
          utmSource: z.string().optional(),
          utmMedium: z.string().optional(),
          utmCampaign: z.string().optional(),
          utmTerm: z.string().optional(),
          utmContent: z.string().optional(),
          customCode: z
            .string()
            .min(3)
            .max(32)
            .regex(/^[a-zA-Z0-9_-]+$/)
            .optional(),
          activeFrom: z.number().optional(),
          expiresAt: z.number().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Plan limit check via workspace
        const config = await ws.getPlanConfig(ctx.workspace.plan as any);
        const linkCount = await ws.countWorkspaceLinks(ctx.workspace.id);
        const limitCheck = ws.checkLimit(config, "links", linkCount);
        if (!limitCheck.allowed) {
          const nextPlan = (await import("../shared/plans")).getNextPlan(
            ctx.workspace.plan as any
          );
          throw new Error(
            JSON.stringify({
              type: "LIMIT_REACHED",
              resource: "links",
              limit: limitCheck.limit,
              current: limitCheck.current,
              currentPlan: ctx.workspace.plan,
              nextPlan,
            })
          );
        }

        // Check destination URL against blocklist
        try {
          const destUrl = new URL(input.destinationUrl);
          const blocked = await db.isHostnameBlocked(destUrl.hostname);
          if (blocked)
            throw new Error(
              "This destination URL is blocked. The domain has been flagged for abuse."
            );
        } catch (e: any) {
          if (e.message.includes("blocked")) throw e;
        }

        // Safe Browsing check
        const { checkUrlSafety } = await import("./safeBrowsing");
        const safety = await checkUrlSafety(input.destinationUrl);
        if (!safety.safe) {
          throw new Error(
            `URL rejected: ${safety.reason || "flagged as unsafe"}`
          );
        }

        let shortCode = input.customCode || nanoid(7);

        if (input.customCode) {
          // Check reserved slugs
          if (isReservedSlug(input.customCode)) {
            throw new Error("This short code is reserved and cannot be used.");
          }
          const existing = await db.getLinkByShortCode(input.customCode);
          if (existing)
            throw new Error("This custom short code is already taken.");
          const retired = await db.isShortCodeRetired(input.customCode);
          if (retired)
            throw new Error(
              "This short code was previously used and cannot be reused."
            );
        }

        if (!input.customCode) {
          let attempts = 0;
          while (attempts < 10) {
            const existing = await db.getLinkByShortCode(shortCode);
            const retired = await db.isShortCodeRetired(shortCode);
            if (!existing && !retired) break;
            shortCode = nanoid(7);
            attempts++;
          }
        }

        // Validate scheduling
        if (
          input.activeFrom &&
          input.expiresAt &&
          input.activeFrom >= input.expiresAt
        ) {
          throw new Error("Active-from date must be before expiry date.");
        }

        // If no projectId specified, assign to system "Other Links" project
        let finalProjectId = input.projectId ?? null;
        if (!finalProjectId) {
          finalProjectId = await db.ensureSystemProject(
            ctx.workspace.id,
            ctx.user.id
          );
        }

        const result = await db.createLink({
          userId: ctx.user.id,
          projectId: finalProjectId,
          destinationUrl: input.destinationUrl,
          shortCode,
          title: input.title ?? null,
          tags: input.tags ?? null,
          utmSource: input.utmSource ?? null,
          utmMedium: input.utmMedium ?? null,
          utmCampaign: input.utmCampaign ?? null,
          utmTerm: input.utmTerm ?? null,
          utmContent: input.utmContent ?? null,
          domainId: null,
          status: "active",
          activeFrom: input.activeFrom ?? null,
          expiresAt: input.expiresAt ?? null,
        });

        return { ...result, shortCode };
      }),

    createBulk: editorProcedure
      .input(
        z.object({
          projectId: z.number().optional(),
          links: z
            .array(
              z.object({
                destinationUrl: z.string().url(),
                title: z.string().max(500).optional(),
                tags: z.array(z.string()).optional(),
                utmSource: z.string().optional(),
                utmMedium: z.string().optional(),
                utmCampaign: z.string().optional(),
                utmTerm: z.string().optional(),
                utmContent: z.string().optional(),
              })
            )
            .min(1)
            .max(50),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Plan limit check via workspace
        const config = await ws.getPlanConfig(ctx.workspace.plan as any);
        const linkCount = await ws.countWorkspaceLinks(ctx.workspace.id);
        const limitCheck = ws.checkLimit(
          config,
          "links",
          linkCount + input.links.length
        );
        if (!limitCheck.allowed) {
          const nextPlan = (await import("../shared/plans")).getNextPlan(
            ctx.workspace.plan as any
          );
          throw new Error(
            JSON.stringify({
              type: "LIMIT_REACHED",
              resource: "links",
              limit: limitCheck.limit,
              current: limitCheck.current,
              currentPlan: ctx.workspace.plan,
              nextPlan,
            })
          );
        }

        // Safe Browsing check on all URLs
        const { checkUrlSafety } = await import("./safeBrowsing");
        for (const link of input.links) {
          const safety = await checkUrlSafety(link.destinationUrl);
          if (!safety.safe) {
            throw new Error(
              `URL rejected (${link.destinationUrl}): ${safety.reason || "flagged as unsafe"}`
            );
          }
        }

        // If no projectId specified, assign to system "Other Links" project
        let bulkProjectId = input.projectId ?? null;
        if (!bulkProjectId) {
          bulkProjectId = await db.ensureSystemProject(
            ctx.workspace.id,
            ctx.user.id
          );
        }

        // Generate unique short codes that are not retired or in use
        const linksToCreate = [];
        for (const link of input.links) {
          let shortCode = nanoid(7);
          let attempts = 0;
          while (attempts < 10) {
            const existing = await db.getLinkByShortCode(shortCode);
            const retired = await db.isShortCodeRetired(shortCode);
            if (!existing && !retired) break;
            shortCode = nanoid(7);
            attempts++;
          }
          linksToCreate.push({
            userId: ctx.user.id,
            projectId: bulkProjectId,
            destinationUrl: link.destinationUrl,
            shortCode,
            title: link.title ?? null,
            tags: link.tags ?? null,
            utmSource: link.utmSource ?? null,
            utmMedium: link.utmMedium ?? null,
            utmCampaign: link.utmCampaign ?? null,
            utmTerm: link.utmTerm ?? null,
            utmContent: link.utmContent ?? null,
            domainId: null,
            status: "active" as const,
          });
        }

        const created = await db.createLinks(linksToCreate);
        return created;
      }),

    update: editorProcedure
      .input(
        z.object({
          id: z.number(),
          destinationUrl: z.string().url().optional(),
          title: z.string().max(500).optional(),
          tags: z.array(z.string()).optional(),
          utmSource: z.string().optional(),
          utmMedium: z.string().optional(),
          utmCampaign: z.string().optional(),
          utmTerm: z.string().optional(),
          utmContent: z.string().optional(),
          status: z.enum(["active", "paused"]).optional(),
          projectId: z.number().nullable().optional(),
          activeFrom: z.number().nullable().optional(),
          expiresAt: z.number().nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const link = await db.getLinkById(input.id);
        if (!link || link.userId !== ctx.user.id)
          throw new Error("Link not found");
        // Validate scheduling if both provided
        const af =
          input.activeFrom !== undefined ? input.activeFrom : link.activeFrom;
        const ea =
          input.expiresAt !== undefined ? input.expiresAt : link.expiresAt;
        if (af && ea && af >= ea) {
          throw new Error("Active-from date must be before expiry date.");
        }
        const { id, ...data } = input;
        await db.updateLink(id, data);
        // Invalidate redirect cache
        const { invalidateLinkCache } = await import("./redirect");
        invalidateLinkCache(link.shortCode);
        return { success: true };
      }),

    delete: editorProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const link = await db.getLinkById(input.id);
        if (!link || link.userId !== ctx.user.id)
          throw new Error("Link not found");
        // Delete link and its clicks (short code is never reused)
        await db.deleteLink(input.id);
        // Invalidate redirect cache
        const { invalidateLinkCache } = await import("./redirect");
        invalidateLinkCache(link.shortCode);
        return { success: true };
      }),

    analytics: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          days: z.number().min(1).max(365).default(30),
        })
      )
      .query(async ({ ctx, input }) => {
        const link = await db.getLinkById(input.id);
        if (!link || link.userId !== ctx.user.id) return null;
        const routing = await import("./rules");
        const [clickCount, clicksOverTime, stats, routingStats, routingRules] =
          await Promise.all([
            db.getClickCountByLinkId(input.id),
            db.getClicksOverTime(input.id, input.days),
            db.getClickStats(input.id),
            db.getRoutingClickStats(input.id, input.days),
            routing.getAllRulesForLink(input.id),
          ]);
        // Get custom domain if link has one
        let customDomain: string | null = null;
        if (link.domainId) {
          const domain = await db.getDomainById(link.domainId);
          if (domain?.verified) customDomain = domain.hostname;
        }
        return {
          link,
          clickCount,
          clicksOverTime,
          customDomain,
          routingStats,
          routingRules,
          ...stats,
        };
      }),

    // URL preview (OG metadata + favicon)
    preview: protectedProcedure
      .input(
        z.object({
          url: z.string().url(),
        })
      )
      .query(async ({ input }) => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const resp = await fetch(input.url, {
            signal: controller.signal,
            headers: { "User-Agent": "Slugly-Bot/1.0 (link preview)" },
            redirect: "follow",
          });
          clearTimeout(timeout);
          if (!resp.ok) return null;
          const html = await resp.text();
          // Parse OG tags
          const getMetaContent = (name: string) => {
            const regex = new RegExp(
              `<meta[^>]*(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`,
              "i"
            );
            const match = html.match(regex);
            if (match) return match[1];
            const regex2 = new RegExp(
              `<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`,
              "i"
            );
            const match2 = html.match(regex2);
            return match2 ? match2[1] : null;
          };
          const title =
            getMetaContent("og:title") ||
            html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ||
            null;
          const description =
            getMetaContent("og:description") ||
            getMetaContent("description") ||
            null;
          // Favicon
          const origin = new URL(input.url).origin;
          const faviconLink = html.match(
            /<link[^>]*rel=["'](?:icon|shortcut icon)["'][^>]*href=["']([^"']*)["']/i
          );
          let favicon = faviconLink?.[1] || "/favicon.ico";
          if (favicon.startsWith("/")) favicon = origin + favicon;
          else if (!favicon.startsWith("http"))
            favicon = origin + "/" + favicon;
          return { title, description, favicon };
        } catch {
          return null;
        }
      }),
  }),

  // ============ GS1 PRODUCT QR ============

  productQr: router({
    list: workspaceProcedure.query(async ({ ctx }) => {
      const products = await db.getProductQrsByWorkspace(ctx.workspace.id);
      const enriched = await Promise.all(products.map(async product => {
        const link = await db.getLinkById(product.linkId);
        const domain = product.domainId ? await db.getDomainById(product.domainId) : null;
        const clickCount = link ? await db.getClickCountByLinkIdFiltered(link.id, true) : { total: 0, unique: 0 };
        const origin = domain?.verified
          ? `https://${domain.hostname}`
          : `https://slugly.io/p/${product.id}`;
        return {
          ...product,
          destinationUrl: link?.destinationUrl || "",
          shortCode: link?.shortCode || "",
          linkStatus: link?.status || "paused",
          clickCount: clickCount.total,
          uniqueClicks: clickCount.unique,
          domainHostname: domain?.verified ? domain.hostname : null,
          digitalLinkUrl: buildGs1DigitalLinkUrl(origin, product.gtin, {
            batchLot: product.batchLot,
            serialNumber: product.serialNumber,
            expiryDate: product.expiryDate,
          }),
        };
      }));
      return enriched;
    }),

    create: editorProcedure
      .input(z.object({
        gtin: z.string().min(1).max(32),
        productName: z.string().min(1).max(255),
        brand: z.string().max(255).optional(),
        destinationUrl: z.string().url(),
        batchLot: z.string().max(20).optional(),
        serialNumber: z.string().max(20).optional(),
        expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        domainId: z.number().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const gtin = validateGtin(input.gtin);
        if (!gtin.valid || !gtin.normalized14 || !gtin.original) {
          throw new Error(gtin.error || "Invalid GTIN.");
        }

        const existingProduct = await db.getProductQrByWorkspaceAndGtin(ctx.workspace.id, gtin.normalized14);
        if (existingProduct) {
          throw new Error("This GTIN already has a Product QR in the current workspace.");
        }

        const config = await ws.getPlanConfig(ctx.workspace.plan as any);
        const linkCount = await ws.countWorkspaceLinks(ctx.workspace.id);
        const limitCheck = ws.checkLimit(config, "links", linkCount);
        if (!limitCheck.allowed) {
          throw new Error("Your workspace link limit has been reached. Product QR codes use a Slugly link for routing and analytics.");
        }

        const { checkUrlSafety } = await import("./safeBrowsing");
        const safety = await checkUrlSafety(input.destinationUrl);
        if (!safety.safe) throw new Error(`URL rejected: ${safety.reason || "flagged as unsafe"}`);

        let domainId: number | null = input.domainId ?? null;
        if (domainId) {
          const domain = await db.getDomainById(domainId);
          if (!domain || !domain.verified || domain.workspaceId !== ctx.workspace.id) {
            throw new Error("Choose a verified custom domain from this workspace.");
          }
        }

        let shortCode = nanoid(8);
        for (let attempts = 0; attempts < 10; attempts++) {
          const existing = await db.getLinkByShortCode(shortCode);
          const retired = await db.isShortCodeRetired(shortCode);
          if (!existing && !retired) break;
          shortCode = nanoid(8);
        }

        const projectId = await db.ensureSystemProject(ctx.workspace.id, ctx.user.id);
        const linkResult = await db.createLink({
          userId: ctx.user.id,
          projectId,
          destinationUrl: input.destinationUrl,
          shortCode,
          title: input.productName,
          tags: ["gs1", "product-qr"],
          utmSource: null,
          utmMedium: null,
          utmCampaign: null,
          utmTerm: null,
          utmContent: null,
          domainId,
          status: "active",
        });

        const product = await db.createProductQr({
          workspaceId: ctx.workspace.id,
          userId: ctx.user.id,
          linkId: linkResult.id,
          domainId,
          gtin: gtin.normalized14,
          sourceGtin: gtin.original,
          productName: input.productName,
          brand: input.brand?.trim() || null,
          batchLot: normalizeGs1Qualifier(input.batchLot) || null,
          serialNumber: normalizeGs1Qualifier(input.serialNumber) || null,
          expiryDate: input.expiryDate || null,
        });

        const domain = domainId ? await db.getDomainById(domainId) : null;
        const origin = domain?.verified
          ? `https://${domain.hostname}`
          : `https://slugly.io/p/${product.id}`;

        return {
          id: product.id,
          linkId: linkResult.id,
          gtin: gtin.normalized14,
          digitalLinkUrl: buildGs1DigitalLinkUrl(origin, gtin.normalized14, {
            batchLot: input.batchLot,
            serialNumber: input.serialNumber,
            expiryDate: input.expiryDate,
          }),
        };
      }),

    update: editorProcedure
      .input(z.object({
        id: z.number(),
        productName: z.string().min(1).max(255).optional(),
        brand: z.string().max(255).nullable().optional(),
        destinationUrl: z.string().url().optional(),
        batchLot: z.string().max(20).nullable().optional(),
        serialNumber: z.string().max(20).nullable().optional(),
        expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const product = await db.getProductQrById(input.id);
        if (!product || product.workspaceId !== ctx.workspace.id) throw new Error("Product QR not found");
        const link = await db.getLinkById(product.linkId);
        if (!link) throw new Error("Underlying link not found");

        if (input.destinationUrl) {
          const { checkUrlSafety } = await import("./safeBrowsing");
          const safety = await checkUrlSafety(input.destinationUrl);
          if (!safety.safe) throw new Error(`URL rejected: ${safety.reason || "flagged as unsafe"}`);
          await db.updateLink(link.id, { destinationUrl: input.destinationUrl });
          const { invalidateLinkCache } = await import("./redirect");
          invalidateLinkCache(link.shortCode);
        }

        await db.updateProductQr(product.id, {
          productName: input.productName ?? product.productName,
          brand: input.brand === undefined ? product.brand : (input.brand?.trim() || null),
          batchLot: input.batchLot === undefined ? product.batchLot : (normalizeGs1Qualifier(input.batchLot) || null),
          serialNumber: input.serialNumber === undefined ? product.serialNumber : (normalizeGs1Qualifier(input.serialNumber) || null),
          expiryDate: input.expiryDate === undefined ? product.expiryDate : input.expiryDate,
        });
        return { success: true };
      }),

    delete: editorProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const product = await db.getProductQrById(input.id);
        if (!product || product.workspaceId !== ctx.workspace.id) throw new Error("Product QR not found");
        await db.deleteProductQr(product.id);
        const link = await db.getLinkById(product.linkId);
        if (link) {
          await db.updateLink(link.id, { status: "paused" });
          const { invalidateLinkCache } = await import("./redirect");
          invalidateLinkCache(link.shortCode);
        }
        return { success: true };
      }),
  }),

  // ============ PAGES: LINK-IN-BIO + LANDING PAGES ============

  pages: router({
    list: workspaceProcedure.query(async ({ ctx }) => {
      const rows = await db.getPagesByWorkspace(ctx.workspace.id);
      return Promise.all(rows.map(async page => {
        const buttons = await db.getPageButtons(page.id);
        const domain = page.domainId ? await db.getDomainById(page.domainId) : null;
        const publicUrl = domain?.verified
          ? `https://${domain.hostname}/`
          : `https://slugly.io/${page.type === "bio" ? "bio" : "page"}/${page.slug}`;
        return { ...page, buttonCount: buttons.length, domainHostname: domain?.verified ? domain.hostname : null, publicUrl };
      }));
    }),

    get: workspaceProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const page = await db.getPageById(input.id);
        if (!page || page.workspaceId !== ctx.workspace.id) throw new Error("Page not found");
        const [buttons, domain] = await Promise.all([
          db.getPageButtons(page.id),
          page.domainId ? db.getDomainById(page.domainId) : Promise.resolve(null),
        ]);
        const enrichedButtons = await Promise.all(buttons.map(async button => {
          const link = await db.getLinkById(button.linkId);
          const shortUrl = domain?.verified
            ? `https://${domain.hostname}/${link?.shortCode || ""}`
            : `https://slugly.io/r/${link?.shortCode || ""}`;
          return {
            ...button,
            destinationUrl: link?.destinationUrl || "",
            shortCode: link?.shortCode || "",
            shortUrl,
          };
        }));
        return {
          ...page,
          buttons: enrichedButtons,
          domainHostname: domain?.verified ? domain.hostname : null,
          publicUrl: domain?.verified
            ? `https://${domain.hostname}/`
            : `https://slugly.io/${page.type === "bio" ? "bio" : "page"}/${page.slug}`,
        };
      }),

    create: editorProcedure
      .input(z.object({
        type: z.enum(["bio", "landing"]),
        slug: z.string().min(3).max(64).regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/),
        title: z.string().min(1).max(255),
        domainId: z.number().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const slug = input.slug.trim().toLowerCase();
        const existingSlug = await db.getPageBySlug(slug);
        if (existingSlug) throw new Error("This page slug is already taken.");

        let domainId: number | null = input.domainId ?? null;
        if (domainId) {
          const domain = await db.getDomainById(domainId);
          if (!domain || !domain.verified || domain.workspaceId !== ctx.workspace.id) {
            throw new Error("Choose a verified custom domain from this workspace.");
          }
          const existingDomainPage = await db.getAnyPageByDomainId(domainId);
          if (existingDomainPage) throw new Error("This custom domain is already assigned to another Page.");
        }

        const created = await db.createPage({
          workspaceId: ctx.workspace.id,
          userId: ctx.user.id,
          type: input.type,
          slug,
          title: input.title.trim(),
          headline: input.type === "landing" ? input.title.trim() : null,
          description: null,
          avatarUrl: null,
          heroImageUrl: null,
          accentColor: "#5A3FF0",
          backgroundColor: "#F7F7FC",
          textColor: "#14152B",
          buttonStyle: input.type === "bio" ? "pill" : "rounded",
          renderMode: "builder",
          customHtml: null,
          domainId,
          status: "draft",
        });
        return { id: created.id };
      }),

    update: editorProcedure
      .input(z.object({
        id: z.number(),
        slug: z.string().min(3).max(64).regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/).optional(),
        title: z.string().min(1).max(255).optional(),
        headline: z.string().max(255).nullable().optional(),
        description: z.string().max(4000).nullable().optional(),
        avatarUrl: z.string().url().nullable().optional(),
        heroImageUrl: z.string().url().nullable().optional(),
        accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        textColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        buttonStyle: z.enum(["rounded", "pill", "square"]).optional(),
        renderMode: z.enum(["builder", "custom_html"]).optional(),
        customHtml: z.string().max(60000).nullable().optional(),
        domainId: z.number().nullable().optional(),
        status: z.enum(["draft", "published"]).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const page = await db.getPageById(input.id);
        if (!page || page.workspaceId !== ctx.workspace.id) throw new Error("Page not found");

        if (input.slug && input.slug.toLowerCase() !== page.slug) {
          const existingSlug = await db.getPageBySlug(input.slug.toLowerCase());
          if (existingSlug) throw new Error("This page slug is already taken.");
        }

        let nextDomainId = page.domainId;
        if (input.domainId !== undefined) {
          nextDomainId = input.domainId;
          if (nextDomainId) {
            const domain = await db.getDomainById(nextDomainId);
            if (!domain || !domain.verified || domain.workspaceId !== ctx.workspace.id) {
              throw new Error("Choose a verified custom domain from this workspace.");
            }
            const existingDomainPage = await db.getAnyPageByDomainId(nextDomainId);
            if (existingDomainPage && existingDomainPage.id !== page.id) {
              throw new Error("This custom domain is already assigned to another Page.");
            }
          }
        }

        const nextRenderMode = input.renderMode ?? page.renderMode;
        const nextCustomHtml = input.customHtml === undefined ? page.customHtml : input.customHtml;
        const nextStatus = input.status ?? page.status;
        if (nextRenderMode === "custom_html" && nextStatus === "published" && !nextCustomHtml?.trim()) {
          throw new Error("Add custom HTML before publishing this Page.");
        }

        const { id, ...raw } = input;
        const updateData: any = { ...raw };
        if (input.slug) updateData.slug = input.slug.toLowerCase();
        await db.updatePage(id, updateData);

        if (nextDomainId !== page.domainId) {
          const buttons = await db.getPageButtons(page.id);
          for (const button of buttons) {
            const link = await db.getLinkById(button.linkId);
            if (!link) continue;
            await db.updateLink(link.id, { domainId: nextDomainId });
            const { invalidateLinkCache } = await import("./redirect");
            invalidateLinkCache(link.shortCode);
          }
        }

        return { success: true };
      }),

    delete: editorProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const page = await db.getPageById(input.id);
        if (!page || page.workspaceId !== ctx.workspace.id) throw new Error("Page not found");
        const buttons = await db.getPageButtons(page.id);
        for (const button of buttons) {
          const link = await db.getLinkById(button.linkId);
          if (link) {
            await db.updateLink(link.id, { status: "paused" });
            const { invalidateLinkCache } = await import("./redirect");
            invalidateLinkCache(link.shortCode);
          }
        }
        await db.deletePage(page.id);
        return { success: true };
      }),

    addButton: editorProcedure
      .input(z.object({
        pageId: z.number(),
        label: z.string().min(1).max(255),
        subtitle: z.string().max(500).optional(),
        destinationUrl: z.string().url(),
        style: z.enum(["primary", "secondary", "outline"]).default("primary"),
      }))
      .mutation(async ({ ctx, input }) => {
        const page = await db.getPageById(input.pageId);
        if (!page || page.workspaceId !== ctx.workspace.id) throw new Error("Page not found");

        const config = await ws.getPlanConfig(ctx.workspace.plan as any);
        const linkCount = await ws.countWorkspaceLinks(ctx.workspace.id);
        const limitCheck = ws.checkLimit(config, "links", linkCount);
        if (!limitCheck.allowed) {
          throw new Error("Your workspace link limit has been reached. Every Page button uses a Slugly link for routing and analytics.");
        }

        const normalizedDestination = normalizeHttpUrl(input.destinationUrl, "Destination URL");
        const { checkUrlSafety } = await import("./safeBrowsing");
        const safety = await checkUrlSafety(normalizedDestination);
        if (!safety.safe) throw new Error(`URL rejected: ${safety.reason || "flagged as unsafe"}`);

        let shortCode = nanoid(8);
        for (let attempts = 0; attempts < 10; attempts++) {
          const [existing, retired] = await Promise.all([
            db.getLinkByShortCode(shortCode),
            db.isShortCodeRetired(shortCode),
          ]);
          if (!existing && !retired) break;
          shortCode = nanoid(8);
        }

        const projectId = await db.ensureSystemProject(ctx.workspace.id, ctx.user.id);
        const link = await db.createLink({
          userId: ctx.user.id,
          projectId,
          destinationUrl: normalizedDestination,
          shortCode,
          title: `${page.title} · ${input.label}`,
          tags: ["page", page.type],
          utmSource: null,
          utmMedium: null,
          utmCampaign: null,
          utmTerm: null,
          utmContent: null,
          domainId: page.domainId,
          status: "active",
        });

        const buttons = await db.getPageButtons(page.id);
        const button = await db.createPageButton({
          pageId: page.id,
          linkId: link.id,
          label: input.label.trim(),
          subtitle: input.subtitle?.trim() || null,
          style: input.style,
          position: buttons.length,
          enabled: true,
        });

        return { id: button.id, linkId: link.id };
      }),

    updateButton: editorProcedure
      .input(z.object({
        id: z.number(),
        pageId: z.number(),
        label: z.string().min(1).max(255).optional(),
        subtitle: z.string().max(500).nullable().optional(),
        destinationUrl: z.string().url().optional(),
        style: z.enum(["primary", "secondary", "outline"]).optional(),
        position: z.number().min(0).optional(),
        enabled: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const page = await db.getPageById(input.pageId);
        const button = await db.getPageButtonById(input.id);
        if (!page || page.workspaceId !== ctx.workspace.id || !button || button.pageId !== page.id) {
          throw new Error("Page button not found");
        }

        if (input.destinationUrl) {
          const normalizedDestination = normalizeHttpUrl(input.destinationUrl, "Destination URL");
          const { checkUrlSafety } = await import("./safeBrowsing");
          const safety = await checkUrlSafety(normalizedDestination);
          if (!safety.safe) throw new Error(`URL rejected: ${safety.reason || "flagged as unsafe"}`);
          const link = await db.getLinkById(button.linkId);
          if (link) {
            await db.updateLink(link.id, { destinationUrl: normalizedDestination });
            const { invalidateLinkCache } = await import("./redirect");
            invalidateLinkCache(link.shortCode);
          }
        }

        await db.updatePageButton(button.id, {
          label: input.label ?? button.label,
          subtitle: input.subtitle === undefined ? button.subtitle : (input.subtitle?.trim() || null),
          style: input.style ?? button.style,
          position: input.position ?? button.position,
          enabled: input.enabled ?? button.enabled,
        });
        return { success: true };
      }),

    deleteButton: editorProcedure
      .input(z.object({ id: z.number(), pageId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const page = await db.getPageById(input.pageId);
        const button = await db.getPageButtonById(input.id);
        if (!page || page.workspaceId !== ctx.workspace.id || !button || button.pageId !== page.id) {
          throw new Error("Page button not found");
        }
        const link = await db.getLinkById(button.linkId);
        if (link) {
          await db.updateLink(link.id, { status: "paused" });
          const { invalidateLinkCache } = await import("./redirect");
          invalidateLinkCache(link.shortCode);
        }
        await db.deletePageButton(button.id);
        return { success: true };
      }),

    analytics: workspaceProcedure
      .input(z.object({ id: z.number(), days: z.number().min(1).max(365).default(30) }))
      .query(async ({ ctx, input }) => {
        const page = await db.getPageById(input.id);
        if (!page || page.workspaceId !== ctx.workspace.id) throw new Error("Page not found");
        const [viewStats, clickStats, buttons] = await Promise.all([
          db.getPageViewStats(page.id, input.days),
          db.getPageButtonClickStats(page.id, input.days),
          db.getPageButtons(page.id),
        ]);
        const clickMap = new Map(clickStats.map(row => [row.linkId, row]));
        const buttonStats = await Promise.all(buttons.map(async button => {
          const link = await db.getLinkById(button.linkId);
          const clicks = clickMap.get(button.linkId);
          return {
            id: button.id,
            linkId: button.linkId,
            label: button.label,
            totalClicks: clicks?.total || 0,
            uniqueClicks: clicks?.unique || 0,
            destinationUrl: link?.destinationUrl || "",
            shortCode: link?.shortCode || "",
          };
        }));
        const totalClicks = buttonStats.reduce((sum, button) => sum + button.totalClicks, 0);
        return {
          ...viewStats,
          totalClicks,
          ctr: viewStats.views > 0 ? Math.round((totalClicks / viewStats.views) * 10000) / 100 : 0,
          buttons: buttonStats,
        };
      }),
  }),

  // ============ TAGS ============
  tag: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const tags = await db.getAllTagsByUserId(ctx.user.id);
      // Get total clicks for each tag
      const enriched = await Promise.all(
        tags.map(async t => {
          const tagLinks = await db.getLinksByTag(ctx.user.id, t.tag);
          const linkIds = tagLinks.map(l => l.id);
          const clickCounts =
            linkIds.length > 0 ? await db.getClickCountsByLinkIds(linkIds) : {};
          const totalClicks = Object.values(clickCounts).reduce(
            (sum, c) => sum + c,
            0
          );
          return { ...t, totalClicks };
        })
      );
      return enriched;
    }),

    analytics: protectedProcedure
      .input(
        z.object({
          tag: z.string(),
          days: z.number().min(1).max(365).default(30),
        })
      )
      .query(async ({ ctx, input }) => {
        const stats = await db.getTagClickStats(
          ctx.user.id,
          input.tag,
          input.days
        );
        // Enrich top links with details
        const topLinksWithDetails = await Promise.all(
          stats.topLinks.map(async tl => {
            const link = await db.getLinkById(tl.linkId);
            return { ...tl, link };
          })
        );
        return { ...stats, topLinks: topLinksWithDetails };
      }),
  }),

  // ============ DOMAINS ============
  domain: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getDomainsByUserId(ctx.user.id);
    }),

    create: editorProcedure
      .input(
        z.object({
          hostname: z.string().min(3).max(255),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Plan limit check via workspace
        const config = await ws.getPlanConfig(ctx.workspace.plan as any);
        const domainCount = await ws.countWorkspaceDomains(ctx.workspace.id);
        const limitCheck = ws.checkLimit(config, "domains", domainCount);
        if (!limitCheck.allowed) {
          const nextPlan = (await import("../shared/plans")).getNextPlan(
            ctx.workspace.plan as any
          );
          throw new Error(
            JSON.stringify({
              type: "LIMIT_REACHED",
              resource: "domains",
              limit: limitCheck.limit,
              current: limitCheck.current,
              currentPlan: ctx.workspace.plan,
              nextPlan,
            })
          );
        }
        // Generate a unique verification token for DNS TXT record
        const { randomUUID } = await import("crypto");
        const verificationToken = `slugly-verify-${randomUUID().replace(/-/g, "").slice(0, 24)}`;
        return db.createDomain({
          userId: ctx.user.id,
          hostname: input.hostname,
          verificationToken,
        });
      }),

    verify: editorProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const domain = await db.getDomainById(input.id);
        if (!domain || domain.userId !== ctx.user.id)
          throw new Error("Domain not found");
        if (!domain.verificationToken)
          throw new Error(
            "No verification token found. Please re-add the domain."
          );

        // Real DNS TXT lookup
        const { Resolver } = await import("dns/promises");
        const resolver = new Resolver();
        resolver.setServers(["8.8.8.8", "1.1.1.1"]);

        try {
          const records = await resolver.resolveTxt(
            `_slugly.${domain.hostname}`
          );
          const flatRecords = records.map(r => r.join("")).filter(Boolean);
          const found = flatRecords.some(r => r === domain.verificationToken);
          if (!found) {
            throw new Error(
              `DNS TXT record not found. Add a TXT record for _slugly.${domain.hostname} with value: ${domain.verificationToken}`
            );
          }
        } catch (err: any) {
          if (
            err.message.includes("DNS TXT record not found") ||
            err.message.includes("Add a TXT record")
          )
            throw err;
          throw new Error(
            `DNS lookup failed for _slugly.${domain.hostname}. Ensure the TXT record is set and DNS has propagated.`
          );
        }

        await db.updateDomainVerified(input.id, true);
        return { success: true, verified: true };
      }),

    delete: editorProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const domain = await db.getDomainById(input.id);
        if (!domain || domain.userId !== ctx.user.id)
          throw new Error("Domain not found");
        await db.deleteDomain(input.id);
        return { success: true };
      }),
  }),

  // ============ WORKSPACE ============
  workspace: router({
    // List all workspaces the user is a member of
    list: protectedProcedure.query(async ({ ctx }) => {
      return ws.getWorkspaceMemberships(ctx.user.id);
    }),

    // Get current workspace info (from context)
    current: workspaceProcedure.query(async ({ ctx }) => {
      const config = await ws.getPlanConfig(ctx.workspace.plan as any);
      const [memberCount, projectCount, linkCount, domainCount] =
        await Promise.all([
          ws.countWorkspaceMembers(ctx.workspace.id),
          ws.countWorkspaceProjects(ctx.workspace.id),
          ws.countWorkspaceLinks(ctx.workspace.id),
          ws.countWorkspaceDomains(ctx.workspace.id),
        ]);
      return {
        workspace: ctx.workspace,
        membership: ctx.membership,
        planConfig: config,
        usage: {
          members: memberCount,
          projects: projectCount,
          links: linkCount,
          domains: domainCount,
        },
      };
    }),

    // Update workspace name
    updateName: wsAdminProcedure
      .input(z.object({ name: z.string().min(1).max(255) }))
      .mutation(async ({ ctx, input }) => {
        await ws.updateWorkspaceName(ctx.workspace.id, input.name);
        return { success: true };
      }),

    // List members
    members: workspaceProcedure.query(async ({ ctx }) => {
      return ws.getWorkspaceMembers(ctx.workspace.id);
    }),

    // Invite a member by email
    invite: wsAdminProcedure
      .input(
        z.object({
          email: z.string().email().max(320),
          role: z.enum(["admin", "editor", "viewer"]).default("editor"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Check seat limit
        const config = await ws.getPlanConfig(ctx.workspace.plan as any);
        const memberCount = await ws.countWorkspaceMembers(ctx.workspace.id);
        const pendingInvites = await ws.getPendingInvitations(ctx.workspace.id);
        const totalSeats = memberCount + pendingInvites.length;
        if (config.limits.seats !== -1 && totalSeats >= config.limits.seats) {
          throw new Error(
            `Seat limit reached (${config.limits.seats}). Upgrade your plan for more seats.`
          );
        }
        // Check if already a member
        const existingMembers = await ws.getWorkspaceMembers(ctx.workspace.id);
        if (existingMembers.some(m => m.user.email === input.email)) {
          throw new Error("This user is already a member of this workspace.");
        }
        // Check if already invited
        if (pendingInvites.some(i => i.email === input.email)) {
          throw new Error("An invitation has already been sent to this email.");
        }
        // Create invitation token
        const token = nanoid(32);
        const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
        await ws.createInvitation({
          workspaceId: ctx.workspace.id,
          email: input.email,
          role: input.role,
          invitedBy: ctx.user.id,
          token,
          expiresAt,
        });
        // Send invitation email (fire-and-forget)
        import("./email")
          .then(async ({ sendTemplatedEmail }) => {
            const inviteUrl = `${ctx.req.protocol}://${ctx.req.get("host")}/invite/${token}`;
            await sendTemplatedEmail("invite", input.email, {
              inviterName: ctx.user.name || ctx.user.email || "A team member",
              workspaceName: ctx.workspace.name,
              role: input.role,
              inviteUrl,
              expiresIn: "7 days",
            });
          })
          .catch(() => {});
        return { success: true };
      }),

    // Get pending invitations for workspace
    invitations: wsAdminProcedure.query(async ({ ctx }) => {
      return ws.getPendingInvitations(ctx.workspace.id);
    }),

    // Cancel an invitation
    cancelInvitation: wsAdminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await ws.expireInvitation(input.id);
        return { success: true };
      }),

    // Accept invitation (by token)
    acceptInvitation: protectedProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const invitation = await ws.getInvitationByToken(input.token);
        if (!invitation) throw new Error("Invitation not found.");
        if (invitation.status !== "pending")
          throw new Error("This invitation has already been used or expired.");
        if (invitation.expiresAt < Date.now()) {
          await ws.expireInvitation(invitation.id);
          throw new Error("This invitation has expired.");
        }
        // Check if user is already a member
        const existing = await ws.getMembership(
          invitation.workspaceId,
          ctx.user.id
        );
        if (existing)
          throw new Error("You are already a member of this workspace.");
        // Add member
        await ws.addWorkspaceMember({
          workspaceId: invitation.workspaceId,
          userId: ctx.user.id,
          role: invitation.role,
        });
        await ws.acceptInvitation(invitation.id);
        return { success: true, workspaceId: invitation.workspaceId };
      }),

    // Get user's pending invitations (by email)
    myInvitations: protectedProcedure.query(async ({ ctx }) => {
      if (!ctx.user.email) return [];
      const invitations = await ws.getUserPendingInvitations(ctx.user.email);
      // Enrich with workspace name
      const enriched = await Promise.all(
        invitations.map(async inv => {
          const workspace = await ws.getWorkspaceById(inv.workspaceId);
          return { ...inv, workspaceName: workspace?.name || "Unknown" };
        })
      );
      return enriched;
    }),

    // Update member role
    updateMemberRole: wsAdminProcedure
      .input(
        z.object({
          memberId: z.number(),
          role: z.enum(["admin", "editor", "viewer"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Cannot change owner role
        const members = await ws.getWorkspaceMembers(ctx.workspace.id);
        const target = members.find(m => m.id === input.memberId);
        if (!target) throw new Error("Member not found.");
        if (target.role === "owner")
          throw new Error("Cannot change the owner's role.");
        // Only owner can promote to admin
        if (input.role === "admin" && ctx.membership.role !== "owner") {
          throw new Error(
            "Only the workspace owner can promote members to admin."
          );
        }
        await ws.updateMemberRole(input.memberId, input.role);
        return { success: true };
      }),

    // Remove member
    removeMember: wsAdminProcedure
      .input(z.object({ memberId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const members = await ws.getWorkspaceMembers(ctx.workspace.id);
        const target = members.find(m => m.id === input.memberId);
        if (!target) throw new Error("Member not found.");
        if (target.role === "owner")
          throw new Error("Cannot remove the workspace owner.");
        if (target.userId === ctx.user.id)
          throw new Error("Cannot remove yourself. Use leave instead.");
        await ws.removeMember(input.memberId);
        return { success: true };
      }),

    // Leave workspace (non-owner)
    leave: workspaceProcedure.mutation(async ({ ctx }) => {
      if (ctx.membership.role === "owner")
        throw new Error(
          "Owners cannot leave their workspace. Transfer ownership first."
        );
      await ws.removeMember(ctx.membership.id);
      return { success: true };
    }),
  }),

  // ============ UTM TEMPLATES ============
  utmTemplates: router({
    list: workspaceProcedure.query(async ({ ctx }) => {
      return ws.listUtmTemplates(ctx.workspace.id);
    }),
    create: editorProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          utmSource: z.string().max(255).optional(),
          utmMedium: z.string().max(255).optional(),
          utmCampaign: z.string().max(255).optional(),
          utmTerm: z.string().max(255).optional(),
          utmContent: z.string().max(255).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Feature gate
        const config = await ws.getPlanConfig(ctx.workspace.plan as any);
        if (!ws.canUseFeature(config, "utmTemplates")) {
          throw new Error("UTM templates require Starter plan or higher.");
        }
        return ws.createUtmTemplate({
          workspaceId: ctx.workspace.id,
          ...input,
        });
      }),
    update: editorProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().min(1).max(255).optional(),
          utmSource: z.string().max(255).nullable().optional(),
          utmMedium: z.string().max(255).nullable().optional(),
          utmCampaign: z.string().max(255).nullable().optional(),
          utmTerm: z.string().max(255).nullable().optional(),
          utmContent: z.string().max(255).nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { id, ...data } = input;
        await ws.updateUtmTemplate(id, ctx.workspace.id, data as any);
        return { success: true };
      }),
    delete: editorProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await ws.deleteUtmTemplate(input.id, ctx.workspace.id);
        return { success: true };
      }),
  }),

  // ============ WORKSPACE BRANDING (white-label) ============
  branding: router({
    get: workspaceProcedure.query(async ({ ctx }) => {
      return ws.getWorkspaceBranding(ctx.workspace.id);
    }),
    update: wsAdminProcedure
      .input(
        z.object({
          logoUrl: z.string().url().nullable().optional(),
          brandColor: z
            .string()
            .regex(/^#[0-9a-fA-F]{6}$/)
            .optional(),
          companyName: z.string().max(255).nullable().optional(),
          contactEmail: z.string().email().nullable().optional(),
          website: z.string().url().nullable().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const config = await ws.getPlanConfig(ctx.workspace.plan as any);
        if (!ws.canUseFeature(config, "whiteLabelReports")) {
          throw new Error("White-label branding requires Team plan.");
        }
        await ws.setWorkspaceBranding(ctx.workspace.id, input);
        return { success: true };
      }),
    uploadLogo: wsAdminProcedure
      .input(
        z.object({
          base64: z.string(),
          filename: z.string(),
          contentType: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const config = await ws.getPlanConfig(ctx.workspace.plan as any);
        if (!ws.canUseFeature(config, "whiteLabelReports")) {
          throw new Error("White-label branding requires Team plan.");
        }
        const { storagePut } = await import("./storage");
        const buf = Buffer.from(input.base64, "base64");
        const ext = input.filename.split(".").pop() || "png";
        const { url } = await storagePut(
          `branding/ws-${ctx.workspace.id}-logo.${ext}`,
          buf,
          input.contentType
        );
        await ws.setWorkspaceBranding(ctx.workspace.id, { logoUrl: url });
        return { logoUrl: url };
      }),
  }),

  // ============ CAMPAIGN DASHBOARD ============
  campaign: router({
    channelStats: workspaceProcedure
      .input(
        z
          .object({
            days: z.number().min(1).max(730).default(30),
            projectId: z.number().optional(),
            tag: z.string().optional(),
          })
          .optional()
      )
      .query(async ({ ctx, input }) => {
        const config = await ws.getPlanConfig(ctx.workspace.plan as any);
        if (!ws.canUseFeature(config, "campaignDashboard")) {
          throw new Error(
            "Campaign dashboard requires Starter plan or higher."
          );
        }
        return ws.getCampaignChannelStats(ctx.workspace.id, {
          days: input?.days,
          projectId: input?.projectId,
          tag: input?.tag,
        });
      }),

    compareProjects: workspaceProcedure
      .input(
        z.object({
          projectIds: z.array(z.number()).min(2).max(10),
          days: z.number().min(1).max(730).default(30),
        })
      )
      .query(async ({ ctx, input }) => {
        const config = await ws.getPlanConfig(ctx.workspace.plan as any);
        if (!ws.canUseFeature(config, "campaignDashboard")) {
          throw new Error(
            "Project comparison requires Starter plan or higher."
          );
        }
        // Enforce analytics retention
        const maxDays =
          config.limits.analyticsRetentionDays === -1
            ? input.days
            : Math.min(input.days, config.limits.analyticsRetentionDays);
        return ws.getProjectComparison(
          ctx.workspace.id,
          input.projectIds,
          maxDays
        );
      }),

    compareTags: workspaceProcedure
      .input(
        z.object({
          tags: z.array(z.string()).min(2).max(10),
          days: z.number().min(1).max(730).default(30),
        })
      )
      .query(async ({ ctx, input }) => {
        const config = await ws.getPlanConfig(ctx.workspace.plan as any);
        if (!ws.canUseFeature(config, "campaignDashboard")) {
          throw new Error("Tag comparison requires Starter plan or higher.");
        }
        const maxDays =
          config.limits.analyticsRetentionDays === -1
            ? input.days
            : Math.min(input.days, config.limits.analyticsRetentionDays);
        return ws.getTagComparison(ctx.workspace.id, input.tags, maxDays);
      }),
  }),

  // ============ REPORT GENERATION ============
  report: router({
    generate: workspaceProcedure
      .input(
        z.object({
          projectId: z.number().optional(),
          tag: z.string().optional(),
          days: z.number().min(1).max(730).default(30),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const config = await ws.getPlanConfig(ctx.workspace.plan as any);
        if (!ws.canUseFeature(config, "whiteLabelReports")) {
          throw new Error("White-label reports require Team plan.");
        }
        const maxDays =
          config.limits.analyticsRetentionDays === -1
            ? input.days
            : Math.min(input.days, config.limits.analyticsRetentionDays);
        const data = await ws.generateReportData(ctx.workspace.id, {
          projectId: input.projectId,
          tag: input.tag,
          days: maxDays,
        });
        const branding = await ws.getWorkspaceBranding(ctx.workspace.id);

        // Generate HTML report and store in S3
        const { renderReportHtml } = await import("./reportRenderer");
        const html = renderReportHtml(data, branding);
        const { storagePut } = await import("./storage");
        const { url } = await storagePut(
          `reports/report-ws${ctx.workspace.id}.html`,
          html,
          "text/html"
        );

        // PDF generation is not available on serverless runtimes — return null.
        // Users can use browser Print → Save as PDF from the HTML report.
        const pdfUrl: string | null = null;

        return { htmlUrl: url, pdfUrl, data };
      }),
    getData: workspaceProcedure
      .input(
        z.object({
          projectId: z.number().optional(),
          tag: z.string().optional(),
          days: z.number().min(1).max(730).default(30),
        })
      )
      .query(async ({ ctx, input }) => {
        const config = await ws.getPlanConfig(ctx.workspace.plan as any);
        if (!ws.canUseFeature(config, "whiteLabelReports")) {
          throw new Error("White-label reports require Team plan.");
        }
        const maxDays =
          config.limits.analyticsRetentionDays === -1
            ? input.days
            : Math.min(input.days, config.limits.analyticsRetentionDays);
        return ws.generateReportData(ctx.workspace.id, {
          projectId: input.projectId,
          tag: input.tag,
          days: maxDays,
        });
      }),
  }),

  // ============ BULK OPERATIONS ============
  bulk: router({
    moveLinks: editorProcedure
      .input(
        z.object({
          linkIds: z.array(z.number()).min(1).max(500),
          targetProjectId: z.number(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const config = await ws.getPlanConfig(ctx.workspace.plan as any);
        if (!ws.canUseFeature(config, "bulkOps")) {
          throw new Error("Bulk operations require Pro plan or higher.");
        }
        const moved = await ws.bulkMoveLinks(
          input.linkIds,
          input.targetProjectId,
          ctx.workspace.id
        );
        return { success: true, moved };
      }),
    tagLinks: editorProcedure
      .input(
        z.object({
          linkIds: z.array(z.number()).min(1).max(500),
          tags: z.array(z.string()).min(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const config = await ws.getPlanConfig(ctx.workspace.plan as any);
        if (!ws.canUseFeature(config, "bulkOps")) {
          throw new Error("Bulk operations require Pro plan or higher.");
        }
        const updated = await ws.bulkTagLinks(
          input.linkIds,
          input.tags,
          ctx.workspace.id
        );
        return { success: true, updated };
      }),
    untagLinks: editorProcedure
      .input(
        z.object({
          linkIds: z.array(z.number()).min(1).max(500),
          tags: z.array(z.string()).min(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const config = await ws.getPlanConfig(ctx.workspace.plan as any);
        if (!ws.canUseFeature(config, "bulkOps")) {
          throw new Error("Bulk operations require Pro plan or higher.");
        }
        const updated = await ws.bulkUntagLinks(
          input.linkIds,
          input.tags,
          ctx.workspace.id
        );
        return { success: true, updated };
      }),
    archiveProject: editorProcedure
      .input(z.object({ projectId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const config = await ws.getPlanConfig(ctx.workspace.plan as any);
        if (!ws.canUseFeature(config, "bulkOps")) {
          throw new Error("Bulk operations require Pro plan or higher.");
        }
        await ws.archiveProject(input.projectId, ctx.workspace.id);
        return { success: true };
      }),
    unarchiveProject: editorProcedure
      .input(z.object({ projectId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await ws.unarchiveProject(input.projectId, ctx.workspace.id);
        return { success: true };
      }),
    archivedProjects: workspaceProcedure.query(async ({ ctx }) => {
      return ws.listArchivedProjects(ctx.workspace.id);
    }),
  }),

  // ============ LINK RULES (redirect rules) ============
  linkRules: router({
    list: editorProcedure
      .input(z.object({ linkId: z.number() }))
      .query(async ({ ctx, input }) => {
        await assertLinkInWorkspace(input.linkId, ctx.workspace.id, ctx.user.id);
        const rules = await import("./rules");
        return rules.getAllRulesForLink(input.linkId);
      }),
    create: editorProcedure
      .input(
        z.object({
          linkId: z.number(),
          type: z.enum(["geo", "device", "ab", "deeplink", "pixel"]),
          config: z.record(z.string(), z.any()),
          priority: z.number().default(0),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await assertLinkInWorkspace(input.linkId, ctx.workspace.id, ctx.user.id);
        const config = await ws.getPlanConfig(ctx.workspace.plan as any);
        const featureMap: Record<string, keyof typeof config.features> = {
          geo: "geoTarget",
          device: "geoTarget",
          ab: "abTest",
          deeplink: "deepLinks",
          pixel: "pixels",
        };
        const feature = featureMap[input.type];
        if (feature && !ws.canUseFeature(config, feature)) {
          throw new Error(`${input.type} rules require a higher plan.`);
        }
        const rules = await import("./rules");
        return rules.createRule({
          linkId: input.linkId,
          type: input.type,
          config: input.type === "deeplink" ? normalizeDeepLinkConfig(input.config) : input.config,
          priority: input.priority,
        });
      }),
    update: editorProcedure
      .input(
        z.object({
          id: z.number(),
          linkId: z.number(),
          config: z.record(z.string(), z.any()).optional(),
          priority: z.number().optional(),
          enabled: z.boolean().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const link = await assertLinkInWorkspace(input.linkId, ctx.workspace.id, ctx.user.id);
        const rules = await import("./rules");
        const existingRules = await rules.getAllRulesForLink(input.linkId);
        const existing = existingRules.find(rule => rule.id === input.id);
        if (!existing) throw new Error("Rule not found");
        const { id, linkId, ...data } = input;
        if (data.config && existing.type === "deeplink") data.config = normalizeDeepLinkConfig(data.config);
        await rules.updateRule(id, linkId, data);
        const { invalidateLinkCache } = await import("./redirect");
        invalidateLinkCache(link.shortCode);
        return { success: true };
      }),
    delete: editorProcedure
      .input(z.object({ id: z.number(), linkId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const link = await assertLinkInWorkspace(input.linkId, ctx.workspace.id, ctx.user.id);
        const rules = await import("./rules");
        const existingRules = await rules.getAllRulesForLink(input.linkId);
        if (!existingRules.some(rule => rule.id === input.id)) throw new Error("Rule not found");
        await rules.deleteRule(input.id, input.linkId);
        const { invalidateLinkCache } = await import("./redirect");
        invalidateLinkCache(link.shortCode);
        return { success: true };
      }),
  }),

  // ============ RETARGETING PIXELS ============
  pixels: router({
    list: workspaceProcedure.query(async ({ ctx }) => {
      const rules = await import("./rules");
      return rules.listPixels(ctx.workspace.id);
    }),
    create: editorProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          type: z.enum(["facebook", "google", "tiktok", "linkedin", "custom"]),
          pixelId: z.string().min(1).max(255),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const config = await ws.getPlanConfig(ctx.workspace.plan as any);
        if (!ws.canUseFeature(config, "pixels")) {
          throw new Error("Retargeting pixels require Pro plan or higher.");
        }
        const rules = await import("./rules");
        return rules.createPixel({ workspaceId: ctx.workspace.id, ...input });
      }),
    delete: editorProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const rules = await import("./rules");
        await rules.deletePixel(input.id, ctx.workspace.id);
        return { success: true };
      }),
  }),

  // ============ BILLING ============
  billing: router({
    status: workspaceProcedure.query(async ({ ctx }) => {
      const config = await ws.getPlanConfig(ctx.workspace.plan as any);
      const [projectCount, linkCount, domainCount, memberCount] =
        await Promise.all([
          ws.countWorkspaceProjects(ctx.workspace.id),
          ws.countWorkspaceLinks(ctx.workspace.id),
          ws.countWorkspaceDomains(ctx.workspace.id),
          ws.countWorkspaceMembers(ctx.workspace.id),
        ]);
      return {
        plan: ctx.workspace.plan,
        planConfig: config,
        usage: {
          projects: projectCount,
          links: linkCount,
          domains: domainCount,
          members: memberCount,
        },
        paymentFailed: false, // Placeholder until Stripe webhooks are connected
      };
    }),

    // TEMP: simulated payment until Stripe — instant plan switch
    changePlan: wsAdminProcedure
      .input(
        z.object({
          plan: z.enum(["free", "starter", "pro", "team"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Only owner/admin can change plan (wsAdminProcedure enforces this)
        await ws.setWorkspacePlan(ctx.workspace.id, input.plan);
        await db.writeAuditLog({
          actorId: ctx.user.id,
          actorName: ctx.user.name || ctx.user.email || "user",
          action: "billing.change_plan",
          targetType: "workspace",
          targetId: String(ctx.workspace.id),
          metadata: { from: ctx.workspace.plan, to: input.plan },
        });
        return { success: true, plan: input.plan };
      }),
  }),

  // ============ ABUSE REPORTS (PUBLIC) ============
  abuseReport: router({
    submit: publicProcedure
      .input(
        z.object({
          shortCode: z
            .string()
            .min(1)
            .max(32)
            .regex(/^[a-zA-Z0-9_-]+$/),
          reason: z.string().max(1000).optional(),
          reporterEmail: z.string().email().max(320).optional(),
          captchaToken: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        // Turnstile CAPTCHA verification — enforce when configured
        const { verifyTurnstileToken, isTurnstileEnabled } = await import(
          "./rateLimit"
        );
        if (isTurnstileEnabled()) {
          if (!input.captchaToken) {
            throw new Error(
              "CAPTCHA token required. Please complete the verification."
            );
          }
          const valid = await verifyTurnstileToken(input.captchaToken);
          if (!valid) {
            throw new Error("CAPTCHA verification failed. Please try again.");
          }
        }

        // Rate limit reports by IP (3 per 10 minutes)
        const ip =
          (ctx.req.headers["x-forwarded-for"] as string) ||
          ctx.req.ip ||
          "unknown";
        const { checkRateLimit } = await import("./rateLimit");
        const database = await db.getDb();
        const rl = await checkRateLimit(database, `report_${ip}`, {
          windowMs: 600000,
          maxRequests: 3,
        });
        if (!rl.allowed) {
          throw new Error("Too many reports. Please try again later.");
        }

        // Validate that the shortCode actually exists
        const link = await db.getLinkByShortCode(input.shortCode);
        if (!link) {
          throw new Error("The reported link does not exist.");
        }

        await db.createReport(input);

        // Notify admins via email (fire-and-forget)
        import("./email")
          .then(async ({ sendTemplatedEmail, renderTemplate }) => {
            const rendered = await renderTemplate("reportReceived", {
              shortCode: input.shortCode,
              reason: input.reason || "No reason provided",
              reporterEmail: input.reporterEmail || "Anonymous",
              adminUrl: "/admin",
            });
            if (rendered) {
              // Also notify owner via built-in notification
              const { notifyOwner } = await import("./_core/notification");
              await notifyOwner({
                title: rendered.subject,
                content: `New abuse report for /${input.shortCode}: ${input.reason || "No reason"}`,
              }).catch(() => {});
              // Send email to admin (owner email from env)
              const ownerEmail = process.env.OWNER_NAME;
              if (ownerEmail && ownerEmail.includes("@")) {
                await sendTemplatedEmail("reportReceived", ownerEmail, {
                  shortCode: input.shortCode,
                  reason: input.reason || "No reason provided",
                  reporterEmail: input.reporterEmail || "Anonymous",
                  adminUrl: "/admin",
                });
              }
            }
          })
          .catch(() => {});

        return { success: true };
      }),
  }),

  // ============ GDPR ============
  account: router({
    exportData: protectedProcedure.mutation(async ({ ctx }) => {
      const data = await db.exportUserData(ctx.user.id);
      return data;
    }),
    deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
      const clerkUserId = ctx.user.openId;
      await db.deleteUserAccount(ctx.user.id);
      const { clerkClient } = await import("@clerk/express");
      await clerkClient.users.deleteUser(clerkUserId);
      return { success: true };
    }),
  }),

  // ============ ADMIN ============
  admin: router({
    // ---- Metrics / Dashboard ----
    getMetrics: adminProcedure.query(async () => {
      return db.adminGetMetrics();
    }),

    // ---- Reports / Abuse ----
    getReports: adminProcedure
      .input(
        z
          .object({
            status: z
              .enum(["pending", "reviewed", "actioned", "dismissed"])
              .optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        return db.getReports(input?.status);
      }),
    updateReport: adminProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["pending", "reviewed", "actioned", "dismissed"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await db.updateReportStatus(input.id, input.status);
        await db.writeAuditLog({
          actorId: ctx.user.id,
          actorName: ctx.user.name || ctx.user.email || "admin",
          action: "report.update",
          targetType: "report",
          targetId: String(input.id),
          metadata: { status: input.status },
        });
        return { success: true };
      }),

    // ---- Link Management ----
    searchLinks: adminProcedure
      .input(
        z.object({
          query: z.string().optional(),
          ownerId: z.number().optional(),
          status: z.string().optional(),
          anonymous: z.boolean().optional(),
        })
      )
      .query(async ({ input }) => {
        return db.adminSearchLinksAdvanced(input);
      }),
    disableLink: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const link = await db.getLinkById(input.id);
        await db.adminDisableLink(input.id);
        await db.writeAuditLog({
          actorId: ctx.user.id,
          actorName: ctx.user.name || ctx.user.email || "admin",
          action: "link.disable",
          targetType: "link",
          targetId: String(input.id),
        });
        if (link) {
          const { invalidateLinkCache } = await import("./redirect");
          invalidateLinkCache(link.shortCode);
        }
        return { success: true };
      }),
    deleteLink: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const link = await db.getLinkById(input.id);
        await db.adminDeleteLink(input.id);
        await db.writeAuditLog({
          actorId: ctx.user.id,
          actorName: ctx.user.name || ctx.user.email || "admin",
          action: "link.delete",
          targetType: "link",
          targetId: String(input.id),
        });
        if (link) {
          const { invalidateLinkCache } = await import("./redirect");
          invalidateLinkCache(link.shortCode);
        }
        return { success: true };
      }),
    cleanupExpiredAnonymous: adminProcedure.mutation(async ({ ctx }) => {
      const count = await db.adminCleanupExpiredAnonymous();
      await db.writeAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name || ctx.user.email || "admin",
        action: "links.cleanup_expired",
        targetType: "system",
        targetId: null,
        metadata: { count },
      });
      return { success: true, count };
    }),

    // ---- User Management ----
    searchUsers: adminProcedure
      .input(
        z
          .object({
            search: z.string().optional(),
            plan: z.string().optional(),
            suspended: z.boolean().optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        return db.adminGetAllUsersEnriched(input || {});
      }),
    getUserCard: adminProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return db.adminGetUserById(input.id);
      }),
    suspendUser: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.suspendUser(input.id);
        await db.writeAuditLog({
          actorId: ctx.user.id,
          actorName: ctx.user.name || ctx.user.email || "admin",
          action: "user.suspend",
          targetType: "user",
          targetId: String(input.id),
        });
        return { success: true };
      }),
    unsuspendUser: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.unsuspendUser(input.id);
        await db.writeAuditLog({
          actorId: ctx.user.id,
          actorName: ctx.user.name || ctx.user.email || "admin",
          action: "user.unsuspend",
          targetType: "user",
          targetId: String(input.id),
        });
        return { success: true };
      }),
    banUser: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.suspendUser(input.id);
        await db.writeAuditLog({
          actorId: ctx.user.id,
          actorName: ctx.user.name || ctx.user.email || "admin",
          action: "user.ban",
          targetType: "user",
          targetId: String(input.id),
        });
        return { success: true };
      }),
    overridePlan: adminProcedure
      .input(
        z.object({
          workspaceId: z.number(),
          plan: z.enum(["free", "starter", "pro", "team"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // A1 fix: override targets WORKSPACE plan, not user plan
        await ws.setWorkspacePlan(input.workspaceId, input.plan);
        await db.writeAuditLog({
          actorId: ctx.user.id,
          actorName: ctx.user.name || ctx.user.email || "admin",
          action: "workspace.plan_override",
          targetType: "workspace",
          targetId: String(input.workspaceId),
          metadata: { plan: input.plan },
        });
        return { success: true };
      }),
    setRole: adminProcedure
      .input(
        z.object({ id: z.number(), role: z.enum(["user", "support", "admin"]) })
      )
      .mutation(async ({ ctx, input }) => {
        await db.adminSetRole(input.id, input.role);
        await db.writeAuditLog({
          actorId: ctx.user.id,
          actorName: ctx.user.name || ctx.user.email || "admin",
          action: "user.role_change",
          targetType: "user",
          targetId: String(input.id),
          metadata: { role: input.role },
        });
        return { success: true };
      }),
    deleteUser: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.adminDeleteUser(input.id);
        await db.writeAuditLog({
          actorId: ctx.user.id,
          actorName: ctx.user.name || ctx.user.email || "admin",
          action: "user.delete",
          targetType: "user",
          targetId: String(input.id),
        });
        return { success: true };
      }),

    // ---- Blocked Domains ----
    getBlockedDomains: adminProcedure.query(async () => {
      return db.getBlockedDomains();
    }),
    addBlockedDomain: adminProcedure
      .input(
        z.object({
          hostname: z.string().min(3).max(255),
          reason: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await db.addBlockedDomain(input.hostname, input.reason);
        await db.writeAuditLog({
          actorId: ctx.user.id,
          actorName: ctx.user.name || ctx.user.email || "admin",
          action: "blocklist.add",
          targetType: "domain",
          targetId: input.hostname,
          metadata: { reason: input.reason },
        });
        return { success: true };
      }),
    removeBlockedDomain: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.removeBlockedDomain(input.id);
        await db.writeAuditLog({
          actorId: ctx.user.id,
          actorName: ctx.user.name || ctx.user.email || "admin",
          action: "blocklist.remove",
          targetType: "domain",
          targetId: String(input.id),
        });
        return { success: true };
      }),

    // ---- Site Settings ----
    getSiteSettings: adminProcedure.query(async () => {
      const safeMode = await db.getSiteSetting("safe_mode");
      const ipAnonymization = await db.getSiteSetting("ip_anonymization");
      const maintenanceBanner = await db.getSiteSetting("maintenance_banner");
      return {
        safeMode: safeMode === "true",
        ipAnonymization: ipAnonymization === "true",
        maintenanceBanner: maintenanceBanner || "",
      };
    }),
    updateSiteSettings: adminProcedure
      .input(
        z.object({
          safeMode: z.boolean().optional(),
          ipAnonymization: z.boolean().optional(),
          maintenanceBanner: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (input.safeMode !== undefined)
          await db.setSiteSetting("safe_mode", String(input.safeMode));
        if (input.ipAnonymization !== undefined)
          await db.setSiteSetting(
            "ip_anonymization",
            String(input.ipAnonymization)
          );
        if (input.maintenanceBanner !== undefined)
          await db.setSiteSetting(
            "maintenance_banner",
            input.maintenanceBanner
          );
        await db.writeAuditLog({
          actorId: ctx.user.id,
          actorName: ctx.user.name || ctx.user.email || "admin",
          action: "settings.update",
          targetType: "system",
          targetId: null,
          metadata: input,
        });
        return { success: true };
      }),

    // ---- Plan Limits Config ----
    getPlanLimits: adminProcedure.query(async () => {
      return db.getPlanLimits();
    }),
    getPlanConfigs: adminProcedure.query(async () => {
      return ws.getAllPlanConfigs();
    }),
    updatePlanConfigs: adminProcedure
      .input(
        z.object({
          configs: z.record(z.string(), z.any()),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await ws.setPlanConfigs(input.configs as any);
        await db.writeAuditLog({
          actorId: ctx.user.id,
          actorName: ctx.user.name || ctx.user.email || "admin",
          action: "config.plan_configs",
          targetType: "system",
          targetId: null,
          metadata: { plans: Object.keys(input.configs) },
        });
        return { success: true };
      }),
    updatePlanLimits: adminProcedure
      .input(
        z.object({
          plan: z.enum(["free", "starter", "pro", "team"]),
          projects: z.number().min(-1).max(10000),
          links: z.number().min(-1).max(1000000),
          domains: z.number().min(0).max(1000).optional(),
          seats: z.number().min(1).max(1000).optional(),
          analyticsRetentionDays: z.number().min(-1).max(3650).optional(),
          features: z
            .object({
              utmTemplates: z.boolean().optional(),
              campaignDashboard: z.enum(["none", "basic", "full"]).optional(),
              csvExport: z.boolean().optional(),
              bulkOps: z.boolean().optional(),
              geoTarget: z.boolean().optional(),
              abTest: z.boolean().optional(),
              deepLinks: z.boolean().optional(),
              pixels: z.boolean().optional(),
              roles: z.boolean().optional(),
              whiteLabelReports: z.boolean().optional(),
            })
            .optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await db.setPlanLimits(input.plan, {
          projects: input.projects,
          links: input.links,
          domains: input.domains,
          seats: input.seats,
          analyticsRetentionDays: input.analyticsRetentionDays,
          features: input.features,
        });
        await db.writeAuditLog({
          actorId: ctx.user.id,
          actorName: ctx.user.name || ctx.user.email || "admin",
          action: "config.plan_limits",
          targetType: "system",
          targetId: input.plan,
          metadata: {
            projects: input.projects,
            links: input.links,
            domains: input.domains,
            seats: input.seats,
          },
        });
        return { success: true };
      }),
    // ---- Workspace Admin ----
    listWorkspaces: adminProcedure
      .input(
        z
          .object({
            search: z.string().optional(),
            plan: z.enum(["free", "starter", "pro", "team"]).optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        return ws.adminListWorkspaces(input || {});
      }),
    overrideWorkspacePlan: adminProcedure
      .input(
        z.object({
          workspaceId: z.number(),
          plan: z.enum(["free", "starter", "pro", "team"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await ws.setWorkspacePlan(input.workspaceId, input.plan);
        await db.writeAuditLog({
          actorId: ctx.user.id,
          actorName: ctx.user.name || ctx.user.email || "admin",
          action: "workspace.plan_override",
          targetType: "workspace",
          targetId: String(input.workspaceId),
          metadata: { plan: input.plan },
        });
        return { success: true };
      }),

    // ---- Reserved Slugs ----
    getReservedSlugs: adminProcedure.query(async () => {
      return db.getReservedSlugs();
    }),
    updateReservedSlugs: adminProcedure
      .input(z.object({ slugs: z.array(z.string()) }))
      .mutation(async ({ ctx, input }) => {
        await db.setReservedSlugs(input.slugs);
        await db.writeAuditLog({
          actorId: ctx.user.id,
          actorName: ctx.user.name || ctx.user.email || "admin",
          action: "config.reserved_slugs",
          targetType: "system",
          targetId: null,
          metadata: { count: input.slugs.length },
        });
        return { success: true };
      }),

    // ---- Audit Log ----
    getAuditLog: adminProcedure
      .input(
        z
          .object({
            action: z.string().optional(),
            actorId: z.number().optional(),
            limit: z.number().optional(),
          })
          .optional()
      )
      .query(async ({ input }) => {
        return db.getAuditLogs(input || {});
      }),

    // ---- Backup ----
    exportBackup: adminProcedure.mutation(async ({ ctx }) => {
      const { exportBackupForDownload } = await import("./backup");
      const backup = await exportBackupForDownload();
      await db.writeAuditLog({
        actorId: ctx.user.id,
        actorName: ctx.user.name || ctx.user.email || "admin",
        action: "backup.export",
        targetType: "system",
        targetId: null,
      });
      return backup;
    }),
    getBackupInfo: adminProcedure.query(async () => {
      const lastBackupAt = await db.getSiteSetting("last_backup_at");
      const lastBackupSize = await db.getSiteSetting("last_backup_size");
      const lastBackupKey = await db.getSiteSetting("last_backup_key");
      return {
        lastBackupAt,
        lastBackupSize: lastBackupSize ? parseInt(lastBackupSize) : null,
        lastBackupKey,
      };
    }),

    // Email config management
    getEmailConfig: adminProcedure.query(async () => {
      const { getEmailConfig } = await import("./email");
      return getEmailConfig();
    }),
    updateEmailConfig: adminProcedure
      .input(
        z.object({
          enabled: z.boolean().optional(),
          senderName: z.string().max(100).optional(),
          senderEmail: z.string().email().max(320).optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { setEmailConfig } = await import("./email");
        await setEmailConfig(
          input,
          ctx.user.id,
          ctx.user.name || ctx.user.email || "admin"
        );
        return { success: true };
      }),
    // Template management
    getTemplateRegistry: adminProcedure.query(async () => {
      const { EMAIL_TEMPLATE_REGISTRY } = await import("./email");
      return EMAIL_TEMPLATE_REGISTRY;
    }),
    getAllTemplates: adminProcedure.query(async () => {
      const { getAllTemplates } = await import("./email");
      return getAllTemplates();
    }),
    getTemplate: adminProcedure
      .input(
        z.object({
          type: z.enum([
            "invite",
            "welcome",
            "reportReceived",
            "anonymousLinkExpiring",
            "weeklyDigest",
          ]),
        })
      )
      .query(async ({ input }) => {
        const { getTemplate } = await import("./email");
        return getTemplate(input.type);
      }),
    saveTemplate: adminProcedure
      .input(
        z.object({
          type: z.enum([
            "invite",
            "welcome",
            "reportReceived",
            "anonymousLinkExpiring",
            "weeklyDigest",
          ]),
          subject: z.string().max(500).optional(),
          bodyHtml: z.string().max(50000).optional(),
          enabled: z.boolean().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { saveTemplate } = await import("./email");
        return saveTemplate(
          input.type,
          {
            subject: input.subject,
            bodyHtml: input.bodyHtml,
            enabled: input.enabled,
          },
          ctx.user.id,
          ctx.user.name || ctx.user.email || "admin"
        );
      }),
    previewTemplate: adminProcedure
      .input(
        z.object({
          type: z.enum([
            "invite",
            "welcome",
            "reportReceived",
            "anonymousLinkExpiring",
            "weeklyDigest",
          ]),
          subject: z.string().max(500),
          bodyHtml: z.string().max(50000),
        })
      )
      .mutation(async ({ input }) => {
        const { renderPreview } = await import("./email");
        return renderPreview(input.type, input.subject, input.bodyHtml);
      }),
    sendTestEmail: adminProcedure
      .input(
        z.object({
          to: z.string().email(),
          templateType: z.enum([
            "invite",
            "welcome",
            "reportReceived",
            "anonymousLinkExpiring",
            "weeklyDigest",
          ]),
        })
      )
      .mutation(async ({ input }) => {
        const { sendEmail, renderPreview, getTemplate } = await import(
          "./email"
        );
        const template = await getTemplate(input.templateType);
        const { subject, html } = renderPreview(
          input.templateType,
          template.subject,
          template.bodyHtml
        );
        const result = await sendEmail({
          to: input.to,
          subject: `[TEST] ${subject}`,
          html,
        });
        return result;
      }),
  }),

  // ============ ANALYTICS EXPORT (Pro+ gated) ============
  analyticsExport: router({
    linkCsv: workspaceProcedure
      .input(
        z.object({
          linkId: z.number(),
          days: z.number().optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        const config = await ws.getPlanConfig(ctx.workspace.plan as any);
        if (!ws.canUseFeature(config, "csvExport")) {
          throw new Error("CSV export requires Pro plan or higher.");
        }
        const link = await db.getLinkById(input.linkId);
        if (!link || link.userId !== ctx.user.id)
          throw new Error("Link not found");
        const maxDays = config.limits.analyticsRetentionDays;
        const days = Math.min(input.days || 30, maxDays);
        return db.getClicksForExport(input.linkId, days);
      }),
    projectCsv: workspaceProcedure
      .input(
        z.object({
          projectId: z.number(),
          days: z.number().optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        const config = await ws.getPlanConfig(ctx.workspace.plan as any);
        if (!ws.canUseFeature(config, "csvExport")) {
          throw new Error("CSV export requires Pro plan or higher.");
        }
        const project = await db.getProjectById(input.projectId);
        if (!project || project.userId !== ctx.user.id)
          throw new Error("Project not found");
        const maxDays = config.limits.analyticsRetentionDays;
        const days = Math.min(input.days || 30, maxDays);
        return db.getProjectClicksForExport(input.projectId, days);
      }),
    tagCsv: workspaceProcedure
      .input(
        z.object({
          tag: z.string(),
          days: z.number().optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        const config = await ws.getPlanConfig(ctx.workspace.plan as any);
        if (!ws.canUseFeature(config, "csvExport")) {
          throw new Error("CSV export requires Pro plan or higher.");
        }
        const maxDays = config.limits.analyticsRetentionDays;
        const days = Math.min(input.days || 30, maxDays);
        return db.getTagClicksForExport(ctx.user.id, input.tag, days);
      }),
  }),

  // ============ NOTIFICATIONS ============
  notification: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return db.getNotificationsForUser(ctx.user.id);
    }),

    unreadCount: protectedProcedure.query(async ({ ctx }) => {
      return db.getUnreadNotificationCount(ctx.user.id);
    }),

    markRead: protectedProcedure
      .input(
        z.object({
          recipientId: z.number(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await db.markNotificationRead(input.recipientId, ctx.user.id);
        return { success: true };
      }),

    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
      await db.markAllNotificationsRead(ctx.user.id);
      return { success: true };
    }),

    // Admin: send broadcast notification
    broadcast: adminProcedure
      .input(
        z.object({
          title: z.string().min(1).max(255),
          body: z.string().min(1).max(2000),
          category: z
            .enum(["system", "update", "promo", "alert"])
            .default("system"),
          audience: z.object({
            type: z.enum(["all", "plan", "role", "workspace", "users"]),
            value: z.string().optional(),
            userIds: z.array(z.number()).optional(),
          }),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Create notification
        const notifId = await db.createNotification({
          title: input.title,
          body: input.body,
          category: input.category,
          audience: input.audience,
          createdBy: ctx.user.id,
        });
        if (!notifId) throw new Error("Failed to create notification");

        // Resolve recipients
        const userIds = await db.getUserIdsByAudience(input.audience);
        if (userIds.length > 0) {
          await db.createNotificationRecipients(
            userIds.map(userId => ({ notificationId: notifId, userId }))
          );
        }

        // Audit log
        await db.writeAuditLog({
          actorId: ctx.user.id,
          actorName: ctx.user.name || ctx.user.email || "Admin",
          action: "notification.broadcast",
          targetType: "notification",
          targetId: String(notifId),
          metadata: {
            title: input.title,
            audience: input.audience,
            recipientCount: userIds.length,
          },
        });

        return { success: true, recipientCount: userIds.length };
      }),

    // Admin: list all sent notifications
    adminList: adminProcedure.query(async () => {
      return db.getAllNotifications();
    }),
  }),
});

export type AppRouter = typeof appRouter;
