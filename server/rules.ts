/**
 * Link Rules Engine — evaluates geo/device/A/B/deeplink/pixel rules for redirect
 */
import { eq, and, asc } from "drizzle-orm";
import { getDb } from "./db";
import { linkRules, retargetingPixels } from "../drizzle/schema";
import type { LinkRule, InsertLinkRule, RetargetingPixel, InsertRetargetingPixel } from "../drizzle/schema";

// ============ RULE TYPES ============

export interface GeoRuleConfig {
  /** ISO country codes → destination */
  rules: Array<{ countries: string[]; destination: string }>;
  fallback?: string; // if no match, use original link destination
}

export interface DeviceRuleConfig {
  rules: Array<{ devices: ("mobile" | "tablet" | "desktop")[]; destination: string }>;
  fallback?: string;
}

export interface AbTestConfig {
  variants: Array<{ name: string; destination: string; weight: number }>;
}

export interface DeepLinkConfig {
  ios?: {
    scheme?: string;
    appStoreUrl?: string;
    teamId?: string;
    bundleId?: string;
  };
  android?: {
    scheme?: string;
    playStoreUrl?: string;
    packageName?: string;
    sha256CertFingerprints?: string[];
  };
  webFallback: string;
  fallbackDelayMs?: number;
}

export interface DeepLinkTarget {
  platform: "ios" | "android";
  scheme?: string;
  storeUrl?: string;
  webFallback: string;
  fallbackDelayMs: number;
}

export interface PixelRuleConfig {
  pixelIds: number[]; // references retargeting_pixels.id
  delayMs?: number;   // interstitial delay before redirect (default 1500ms)
}

// ============ CRUD ============

export async function getRulesForLink(linkId: number): Promise<LinkRule[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(linkRules)
    .where(and(eq(linkRules.linkId, linkId), eq(linkRules.enabled, true)))
    .orderBy(asc(linkRules.priority));
}

export async function getAllRulesForLink(linkId: number): Promise<LinkRule[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(linkRules)
    .where(eq(linkRules.linkId, linkId))
    .orderBy(asc(linkRules.priority));
}

export async function createRule(data: InsertLinkRule): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(linkRules).values(data);
  return { id: result.insertId };
}

export async function updateRule(id: number, linkId: number, data: Partial<Pick<LinkRule, "config" | "priority" | "enabled">>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(linkRules).set(data).where(and(eq(linkRules.id, id), eq(linkRules.linkId, linkId)));
}

export async function deleteRule(id: number, linkId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(linkRules).where(and(eq(linkRules.id, id), eq(linkRules.linkId, linkId)));
}

// ============ PIXEL CRUD ============

export async function listPixels(workspaceId: number): Promise<RetargetingPixel[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(retargetingPixels).where(eq(retargetingPixels.workspaceId, workspaceId));
}

export async function createPixel(data: InsertRetargetingPixel): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [result] = await db.insert(retargetingPixels).values(data);
  return { id: result.insertId };
}

export async function deletePixel(id: number, workspaceId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(retargetingPixels).where(and(eq(retargetingPixels.id, id), eq(retargetingPixels.workspaceId, workspaceId)));
}

export async function getPixelsByIds(ids: number[]): Promise<RetargetingPixel[]> {
  const db = await getDb();
  if (!db) return [];
  if (ids.length === 0) return [];
  const { inArray } = await import("drizzle-orm");
  return db.select().from(retargetingPixels).where(inArray(retargetingPixels.id, ids));
}

// ============ RULE EVALUATION ENGINE ============

export interface EvaluationContext {
  country: string | null;
  deviceType: string; // "mobile" | "tablet" | "desktop"
  userAgent: string;
  originalDestination: string;
}

export interface EvaluationResult {
  destination: string;
  variant?: string;       // A/B variant name
  pixelIds?: number[];    // pixels to fire
  pixelDelay?: number;    // interstitial delay
  isDeepLink?: boolean;
  deepLink?: DeepLinkTarget;
}

/**
 * Evaluate all enabled rules for a link, in priority order.
 * Rules are composable: geo/device override destination, A/B picks variant,
 * pixels add interstitial, deep links add mobile detection.
 */
export function evaluateRules(rules: LinkRule[], ctx: EvaluationContext): EvaluationResult {
  let result: EvaluationResult = { destination: ctx.originalDestination };

  for (const rule of rules) {
    switch (rule.type) {
      case "geo": {
        const config = rule.config as unknown as GeoRuleConfig;
        if (ctx.country) {
          const match = config.rules.find(r => r.countries.includes(ctx.country!.toUpperCase()));
          if (match) {
            result.destination = match.destination;
          } else if (config.fallback) {
            result.destination = config.fallback;
          }
        }
        break;
      }

      case "device": {
        const config = rule.config as unknown as DeviceRuleConfig;
        const match = config.rules.find(r => r.devices.includes(ctx.deviceType as any));
        if (match) {
          result.destination = match.destination;
        } else if (config.fallback) {
          result.destination = config.fallback;
        }
        break;
      }

      case "ab": {
        const config = rule.config as unknown as AbTestConfig;
        const variant = pickAbVariant(config.variants);
        if (variant) {
          result.destination = variant.destination;
          result.variant = variant.name;
        }
        break;
      }

      case "deeplink": {
        const config = rule.config as unknown as DeepLinkConfig;
        const fallbackDelayMs = Math.min(Math.max(config.fallbackDelayMs || 2200, 800), 8000);

        if (/iphone|ipad|ipod/i.test(ctx.userAgent) && config.ios) {
          result.destination = config.webFallback || result.destination;
          result.isDeepLink = true;
          result.deepLink = {
            platform: "ios",
            scheme: config.ios.scheme || undefined,
            storeUrl: config.ios.appStoreUrl || undefined,
            webFallback: config.webFallback || result.destination,
            fallbackDelayMs,
          };
        } else if (/android/i.test(ctx.userAgent) && config.android) {
          result.destination = config.webFallback || result.destination;
          result.isDeepLink = true;
          result.deepLink = {
            platform: "android",
            scheme: config.android.scheme || undefined,
            storeUrl: config.android.playStoreUrl || undefined,
            webFallback: config.webFallback || result.destination,
            fallbackDelayMs,
          };
        } else {
          result.destination = config.webFallback || result.destination;
        }
        break;
      }

      case "pixel": {
        const config = rule.config as unknown as PixelRuleConfig;
        result.pixelIds = config.pixelIds;
        result.pixelDelay = config.delayMs || 1500;
        break;
      }
    }
  }

  return result;
}

/** Weighted random variant selection */
function pickAbVariant(variants: AbTestConfig["variants"]): { name: string; destination: string } | null {
  if (!variants || variants.length === 0) return null;
  const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
  if (totalWeight <= 0) return variants[0];
  const rand = Math.random() * totalWeight;
  let cumulative = 0;
  for (const v of variants) {
    cumulative += v.weight;
    if (rand < cumulative) return { name: v.name, destination: v.destination };
  }
  return { name: variants[variants.length - 1].name, destination: variants[variants.length - 1].destination };
}
