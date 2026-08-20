/**
 * Analytics module — Amplitude + GA4, gated behind cookie consent.
 * Impersonated support sessions are always excluded from product analytics.
 */

import * as amplitude from "@amplitude/analytics-browser";

const AMPLITUDE_KEY = import.meta.env.VITE_AMPLITUDE_API_KEY || "";
const GA_ID = import.meta.env.VITE_GA_ID || "";
const CONSENT_KEY = "slugly_analytics_consent";
const MIN_ANALYTICS_ID_LENGTH = 5;
const IMPERSONATION_FLAG = "slugly_impersonation_active=1";

let initialized = false;
let consentGranted = false;
let lastTrackedPage = "";
let clickTrackingInstalled = false;
let warnedInvalidAnalyticsId = false;

export function isAnalyticsSuppressed(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some(value => value.trim() === IMPERSONATION_FLAG);
}

export function hasConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === "granted";
  } catch {
    return false;
  }
}

export function getConsentStatus(): "granted" | "denied" | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    if (v === "granted") return "granted";
    if (v === "denied") return "denied";
    return null;
  } catch {
    return null;
  }
}

export function setAnalyticsConsent(granted: boolean) {
  try {
    localStorage.setItem(CONSENT_KEY, granted ? "granted" : "denied");
  } catch { /* ignore */ }

  if (isAnalyticsSuppressed()) {
    consentGranted = false;
    lastTrackedPage = "";
    if (initialized) amplitude.setOptOut(true);
    return;
  }

  if (granted) {
    consentGranted = true;
    initTrackers();
    trackEvent("analytics_consent_granted", { source: "cookie_banner" });
    trackPageView();
  } else {
    consentGranted = false;
    lastTrackedPage = "";
    if (initialized) amplitude.setOptOut(true);
    if (typeof window.gtag === "function") {
      window.gtag("consent", "update", { analytics_storage: "denied" });
    }
  }
}

export function initAnalytics() {
  if (isAnalyticsSuppressed()) {
    consentGranted = false;
    return;
  }
  consentGranted = hasConsent();
  if (consentGranted) initTrackers();
}

function initTrackers() {
  if (initialized || isAnalyticsSuppressed()) return;
  initialized = true;
  installClickTracking();

  if (AMPLITUDE_KEY) {
    amplitude.init(AMPLITUDE_KEY, { autocapture: { elementInteractions: false } });
    amplitude.setOptOut(false);
  }

  if (GA_ID && !document.getElementById("ga-script")) {
    const script = document.createElement("script");
    script.id = "ga-script";
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function (...args: any[]) { window.dataLayer!.push(args); };
    window.gtag("js", new Date());
    window.gtag("consent", "default", { analytics_storage: "granted" });
    window.gtag("config", GA_ID, {
      anonymize_ip: true,
      send_page_view: false,
    });
  }

  exposeDebugApi();
}

function getPagePath(path?: string) {
  if (path) return path;
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}

function warnInvalidAnalyticsId(value: unknown) {
  if (warnedInvalidAnalyticsId) return;
  warnedInvalidAnalyticsId = true;
  console.warn("[Analytics] Skipping identity with invalid id length", value);
}

function normalizeAnalyticsId(prefix: "user" | "ws", value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = raw.startsWith(`${prefix}_`) ? raw : `${prefix}_${raw}`;
  if (normalized.length < MIN_ANALYTICS_ID_LENGTH) {
    warnInvalidAnalyticsId(raw);
    return null;
  }
  return normalized;
}

function normalizeAnalyticsTraits(traits?: Record<string, any>) {
  if (!traits) return undefined;
  return Object.fromEntries(
    Object.entries(traits).map(([key, value]) => {
      if ((key === "workspaceId" || key === "workspace_id") && value != null) {
        return [key, normalizeAnalyticsId("ws", value) ?? undefined];
      }
      return [key, value];
    }).filter(([, value]) => value !== undefined)
  );
}

export function trackPageView(path?: string, title?: string) {
  if (!consentGranted || isAnalyticsSuppressed()) return;
  initTrackers();

  const pagePath = getPagePath(path);
  const pageTitle = title || (typeof document !== "undefined" ? document.title : "Slugly");
  const pageLocation = typeof window !== "undefined" ? `${window.location.origin}${pagePath}` : pagePath;
  if (lastTrackedPage === pagePath) return;
  lastTrackedPage = pagePath;

  if (AMPLITUDE_KEY && initialized) {
    amplitude.track("page_view", {
      page_path: pagePath,
      page_title: pageTitle,
      page_location: pageLocation,
    });
  }

  if (GA_ID && typeof window.gtag === "function") {
    window.gtag("event", "page_view", {
      page_title: pageTitle,
      page_location: pageLocation,
      page_path: pagePath,
      debug_mode: import.meta.env.DEV,
    });
  }
}

export function trackEvent(name: string, properties?: Record<string, any>) {
  if (!consentGranted || isAnalyticsSuppressed()) return;
  initTrackers();

  const enrichedProperties = {
    path: typeof window !== "undefined" ? window.location.pathname : undefined,
    ...properties,
  };

  if (AMPLITUDE_KEY && initialized) amplitude.track(name, enrichedProperties);
  if (GA_ID && typeof window.gtag === "function") window.gtag("event", name, enrichedProperties);
}

export function identifyUser(userId: string, traits?: Record<string, any>) {
  if (!consentGranted || isAnalyticsSuppressed()) return;
  const analyticsUserId = normalizeAnalyticsId("user", userId);
  if (!analyticsUserId) return;
  initTrackers();

  const normalizedTraits = normalizeAnalyticsTraits(traits);
  if (AMPLITUDE_KEY && initialized) {
    amplitude.setUserId(analyticsUserId);
    if (normalizedTraits) {
      const identify = new amplitude.Identify();
      Object.entries(normalizedTraits).forEach(([k, v]) => identify.set(k, v));
      amplitude.identify(identify);
    }
  }
  if (GA_ID && typeof window.gtag === "function") window.gtag("set", { user_id: analyticsUserId });
}

function installClickTracking() {
  if (clickTrackingInstalled || typeof document === "undefined") return;
  clickTrackingInstalled = true;
  document.addEventListener("click", event => {
    if (isAnalyticsSuppressed()) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const actionable = target.closest("button, a, [role='button']");
    if (!(actionable instanceof HTMLElement)) return;
    const eventName = inferClickEvent(actionable);
    if (!eventName) return;
    trackEvent(eventName, {
      label: getElementLabel(actionable),
      href: actionable instanceof HTMLAnchorElement ? actionable.href : undefined,
    });
  });
}

function getElementLabel(element: HTMLElement) {
  return (
    element.getAttribute("aria-label") ||
    element.getAttribute("title") ||
    element.textContent ||
    ""
  ).replace(/\s+/g, " ").trim().slice(0, 120);
}

function inferClickEvent(element: HTMLElement) {
  const label = getElementLabel(element).toLowerCase();
  const href = element instanceof HTMLAnchorElement ? element.getAttribute("href") || "" : "";
  if (href.includes("/auth") || label.includes("sign in") || label.includes("log in")) return "login_started";
  if (label.includes("get started") || label.includes("start free") || label.includes("sign up")) return "signup_started";
  if (label.includes("new project") || label.includes("create project") || label.includes("first project")) return "project_create_clicked";
  if (label.includes("create short link") || label.includes("shorten") || label.includes("add link")) return "link_create_clicked";
  if (label === "copy" || label.includes("copy")) return "link_copy_clicked";
  if (label.includes("qr")) return "qr_opened";
  if (label.includes("analytics") || label.includes("compare")) return "analytics_opened";
  if (label.includes("invite")) return "invite_flow_started";
  if (label.includes("billing") || href.includes("/billing")) return "billing_opened";
  return null;
}

function exposeDebugApi() {
  if (typeof window === "undefined") return;
  window.sluglyAnalytics = {
    trackEvent,
    trackPageView,
    hasConsent,
    getConsentStatus,
  };
}

declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
    sluglyAnalytics?: {
      trackEvent: typeof trackEvent;
      trackPageView: typeof trackPageView;
      hasConsent: typeof hasConsent;
      getConsentStatus: typeof getConsentStatus;
    };
  }
}
