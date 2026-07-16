import * as Sentry from "@sentry/node";

/**
 * Initialize Sentry for backend error tracking.
 * Only initializes if SENTRY_DSN is set.
 */
export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log("[Sentry] No DSN configured, skipping initialization");
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    // Don't send PII
    sendDefaultPii: false,
  });

  console.log("[Sentry] Backend initialized");
}

/**
 * Capture an exception and send to Sentry.
 */
export function captureException(err: unknown, context?: Record<string, any>) {
  if (!process.env.SENTRY_DSN) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

/**
 * Express error handler middleware for Sentry.
 */
export function sentryErrorHandler() {
  return Sentry.setupExpressErrorHandler;
}
