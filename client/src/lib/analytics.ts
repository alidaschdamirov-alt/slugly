/**
 * Analytics module — Amplitude + GA4, gated behind cookie consent.
 * 
 * Usage:
 *   import { initAnalytics, trackEvent, setAnalyticsConsent } from "@/lib/analytics";
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
  } else {
    consentGranted = false;
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
    window.gtag("config", GA_ID, {
      anonymize_ip: true,
      send_page_view: true,
    });
  }
}

/**
 * Track a custom event (only fires if consent is granted).
 */
export function trackEvent(name: string, properties?: Record<string, any>) {
  if (!consentGranted) return;

  // Amplitude
  if (AMPLITUDE_KEY && initialized) {
    amplitude.track(name, properties);
  }

  // GA4
  if (GA_ID && typeof window.gtag === "function") {
    window.gtag("event", name, properties);
  }
}

/**
 * Identify user for analytics (only if consent granted).
 */
export function identifyUser(userId: string, traits?: Record<string, any>) {
  if (!consentGranted) return;

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

// Type augmentation for window
declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
  }
}
