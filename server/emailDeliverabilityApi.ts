import { Router, type Request, type Response } from "express";
import { Resend } from "resend";
import { isPrivilegedRole } from "./adminAccess";
import { getEmailDeliverabilitySnapshot, recordEmailWebhookEvent, type EmailMetricEvent } from "./emailMetrics";
import { isPrivilegedIpAllowed } from "./privilegedIp";
import { sdk } from "./_core/sdk";

export const emailDeliverabilityRouter = Router();

const SUPPORTED_EVENTS = new Map<string, EmailMetricEvent>([
  ["email.sent", "sent"],
  ["email.delivered", "delivered"],
  ["email.opened", "opened"],
  ["email.bounced", "bounced"],
  ["email.complained", "complained"],
  ["email.failed", "failed"],
]);

function header(req: Request, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : typeof value === "string" ? value : undefined;
}

async function requirePrivileged(req: Request, res: Response) {
  const actor = await sdk.authenticateRequest(req);
  if (!isPrivilegedRole(actor.role)) {
    res.status(403).json({ error: "Administrator or support access required." });
    return null;
  }
  if (!sdk.hasVerifiedSecondFactor(req)) {
    res.status(403).json({ error: "Two-factor authentication is required.", code: "MFA_REQUIRED" });
    return null;
  }
  if (!(await isPrivilegedIpAllowed(req))) {
    res.status(403).json({ error: "This IP address is not allowed to use privileged tools.", code: "IP_NOT_ALLOWED" });
    return null;
  }
  return actor;
}

function getRawBody(req: Request): string | null {
  const raw = (req as Request & { rawBody?: string }).rawBody;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

function normalizeRecipients(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.includes("@"));
  if (typeof value === "string" && value.includes("@")) return [value];
  return [];
}

emailDeliverabilityRouter.post("/webhook", async (req, res) => {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    console.error("[ResendWebhook] RESEND_WEBHOOK_SECRET is not configured");
    return res.status(503).json({ error: "Webhook verification is not configured." });
  }

  const payload = getRawBody(req);
  const id = header(req, "svix-id");
  const timestamp = header(req, "svix-timestamp");
  const signature = header(req, "svix-signature");
  if (!payload || !id || !timestamp || !signature) {
    return res.status(400).json({ error: "Invalid webhook: raw payload and Svix headers are required." });
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY || "re_webhook_verify_only");
    const verified = resend.webhooks.verify({
      payload,
      headers: { id, timestamp, signature },
      webhookSecret,
    }) as any;

    const metricEvent = SUPPORTED_EVENTS.get(String(verified?.type || ""));
    if (!metricEvent) return res.json({ ok: true, ignored: true });

    const data = verified?.data || {};
    const emailId = typeof data.email_id === "string" ? data.email_id : "";
    const recipients = normalizeRecipients(data.to);
    if (!emailId || recipients.length === 0) {
      return res.status(400).json({ error: "Verified webhook did not include an email id and recipient." });
    }

    const bounceMessage = typeof data?.bounce?.message === "string"
      ? data.bounce.message
      : typeof data?.error === "string"
        ? data.error
        : undefined;

    await Promise.all(recipients.map(recipient => recordEmailWebhookEvent({
      event: metricEvent,
      emailId,
      recipient,
      subject: typeof data.subject === "string" ? data.subject : undefined,
      tags: data.tags,
      createdAt: typeof verified.created_at === "string" ? verified.created_at : undefined,
      bounceMessage,
    })));

    return res.json({ ok: true, event: metricEvent, recipients: recipients.length });
  } catch (error) {
    console.warn("[ResendWebhook] Signature verification failed:", error instanceof Error ? error.message : "unknown error");
    return res.status(400).json({ error: "Invalid webhook signature." });
  }
});

emailDeliverabilityRouter.get("/metrics", async (req, res) => {
  try {
    const actor = await requirePrivileged(req, res);
    if (!actor) return;
    const requestedDays = Number(req.query.days || 30);
    const days = Number.isFinite(requestedDays) ? requestedDays : 30;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const snapshot = await getEmailDeliverabilitySnapshot({ days, search, category });
    return res.json({
      ...snapshot,
      webhookConfigured: !!process.env.RESEND_WEBHOOK_SECRET?.trim(),
      webhookEndpoint: "/api/security/email/webhook",
      trackedEvents: Array.from(SUPPORTED_EVENTS.keys()),
    });
  } catch (error: any) {
    const status = error?.code === "FORBIDDEN" ? 403 : 500;
    return res.status(status).json({ error: error?.message || "Failed to load email deliverability metrics." });
  }
});
