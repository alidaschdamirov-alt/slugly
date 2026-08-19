/**
 * Analytics module — Amplitude + GA4, gated behind cookie consent.
 *
 * Usage:
 *   import { initAnalytics, trackEvent, setAnalyticsConsent, trackPageView } from "@/lib/analytics";
 *
 *   // On app load (checks stored consent)
 *   initAnalytics();
 *
 *   // When user grants consent
 *   setAnalyticsConsent(true);
 *
 *   // Track events (only fires if consent is granted)
 *   trackEvent("link_created", { plan: "free" });
 */

import * as amplitude from "@amplitude/analytics-browser";

const AMPLITUDE_KEY = import.meta.env.VITE_AMPLITUDE_API_KEY || "";
const GA_ID = import.meta.env.VITE_GA_ID || "";
const CONSENT_KEY = "slugly_analytics_consent";

let initialized = false;
let consentGranted = false;
let lastTrackedPage = "";
let clickTrackingInstalled = false;

/**
 * Check if user has previously granted analytics consent.
 */
export function hasConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === "granted";
  } catch {
    return false;
  }
}

/**
 * Get consent status: "granted" | "denied" | null (not yet decided)
 */
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

/**
 * Set analytics consent and initialize/disable tracking accordingly.
 */
export function setAnalyticsConsent(granted: boolean) {
  try {
    localStorage.setItem(CONSENT_KEY, granted ? "granted" : "denied");
  } catch { /* ignore */ }

  if (granted) {
    consentGranted = true;
    initTrackers();
    trackEvent("analytics_consent_granted", { source: "cookie_banner" });
    trackPageView();
  } else {
    consentGranted = false;
    lastTrackedPage = "";

    // Opt out of Amplitude
    if (initialized) {
      amplitude.setOptOut(true);
    }

    // Revoke GA consent
    if (typeof window.gtag === "function") {
      window.gtag("consent", "update", {
        analytics_storage: "denied",
      });
    }
  }
}

/**
 * Initialize analytics on app startup.
 * Only activates trackers if consent was previously granted.
 */
export function initAnalytics() {
  consentGranted = hasConsent();
  if (consentGranted) {
    initTrackers();
  }
}

function initTrackers() {
  if (initialized) return;
  initialized = true;

  installClickTracking();

  // Amplitude
  if (AMPLITUDE_KEY) {
    amplitude.init(AMPLITUDE_KEY, {
      autocapture: { elementInteractions: false },
    });
    amplitude.setOptOut(false);
  }

  // GA4 — load gtag script dynamically
  if (GA_ID && !document.getElementById("ga-script")) {
    const script = document.createElement("script");
    script.id = "ga-script";
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function (...args: any[]) {
      window.dataLayer!.push(args);
    };
    window.gtag("js", new Date());
    window.gtag("consent", "default", {
      analytics_storage: "granted",
    });
    // Disable automatic page_view and send explicit page_view events instead.
    // This is safer for SPA routing and easier to verify in GA4/DebugView.
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

/**
 * Track a page view explicitly for GA4 and Amplitude.
 * This is required for SPA navigation where the browser does not reload.
 */
export function trackPageView(path?: string, title?: string) {
  if (!consentGranted) return;

  initTrackers();

  const pagePath = getPagePath(path);
  const pageTitle = title || (typeof document !== "undefined" ? document.title : "Slugly");
  const pageLocation = typeof window !== "undefined"
    ? `${window.location.origin}${pagePath}`
    : pagePath;

  // Avoid duplicate page_view events for the same exact route.
  if (lastTrackedPage === pagePath) return;
  lastTrackedPage = pagePath;

  // Amplitude
  if (AMPLITUDE_KEY && initialized) {
    amplitude.track("page_view", {
      page_path: pagePath,
      page_title: pageTitle,
      page_location: pageLocation,
    });
  }

  // GA4
  if (GA_ID && typeof window.gtag === "function") {
    window.gtag("event", "page_view", {
      page_title: pageTitle,
      page_location: pageLocation,
      page_path: pagePath,
      debug_mode: import.meta.env.DEV,
    });
  }
}

/**
 * Track a custom event (only fires if consent is granted).
 */
export function trackEvent(name: string, properties?: Record<string, any>) {
  if (!consentGranted) return;

  initTrackers();

  const enrichedProperties = {
    path: typeof window !== "undefined" ? window.location.pathname : undefined,
    ...properties,
  };

  // Amplitude
  if (AMPLITUDE_KEY && initialized) {
    amplitude.track(name, enrichedProperties);
  }

  // GA4
  if (GA_ID && typeof window.gtag === "function") {
    window.gtag("event", name, enrichedProperties);
  }
}

/**
 * Identify user for analytics (only if consent granted).
 */
export function identifyUser(userId: string, traits?: Record<string, any>) {
  if (!consentGranted) return;

  initTrackers();

  if (AMPLITUDE_KEY && initialized) {
    amplitude.setUserId(userId);
    if (traits) {
      const identify = new amplitude.Identify();
      Object.entries(traits).forEach(([k, v]) => identify.set(k, v));
      amplitude.identify(identify);
    }
  }

  if (GA_ID && typeof window.gtag === "function") {
    window.gtag("set", { user_id: userId });
  }
}

function installClickTracking() {
  if (clickTrackingInstalled || typeof document === "undefined") return;
  clickTrackingInstalled = true;

  document.addEventListener("click", event => {
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
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function inferClickEvent(element: HTMLElement) {
  const label = getElementLabel(element).toLowerCase();
  const href = element instanceof HTMLAnchorElement ? element.getAttribute("href") || "" : "";

  if (href.includes("/auth") || label.includes("sign in") || label.includes("log in")) {
    return "login_started";
  }

  if (label.includes("get started") || label.includes("start free") || label.includes("sign up")) {
    return "signup_started";
  }

  if (label.includes("new project") || label.includes("create project") || label.includes("first project")) {
    return "project_create_clicked";
  }

  if (label.includes("create short link") || label.includes("shorten") || label.includes("add link")) {
    return "link_create_clicked";
  }

  if (label === "copy" || label.includes("copy")) {
    return "link_copy_clicked";
  }

  if (label.includes("qr")) {
    return "qr_opened";
  }

  if (label.includes("analytics") || label.includes("compare")) {
    return "analytics_opened";
  }

  if (label.includes("invite")) {
    return "invite_flow_started";
  }

  if (label.includes("billing") || href.includes("/billing")) {
    return "billing_opened";
  }

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

// Type augmentation for window
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
