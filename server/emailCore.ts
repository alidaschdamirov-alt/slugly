import { Resend } from "resend";
import { getSiteSetting, setSiteSetting, writeAuditLog } from "./db";

// ============ RESEND CLIENT ============
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

// ============ EMAIL CONFIG (stored in site_settings) ============
export interface EmailConfig {
  enabled: boolean;
  senderName: string;
  senderEmail: string;
}

const DEFAULT_CONFIG: EmailConfig = {
  enabled: true,
  senderName: "Slugly",
  senderEmail: "onboarding@resend.dev",
};

export async function getEmailConfig(): Promise<EmailConfig> {
  const raw = await getSiteSetting("email_config_v2");
  if (!raw) {
    // Migrate from old config if exists
    const oldRaw = await getSiteSetting("email_config");
    if (oldRaw) {
      try {
        const old = JSON.parse(oldRaw);
        return { enabled: old.enabled ?? true, senderName: old.senderName || "Slugly", senderEmail: old.senderEmail || "onboarding@resend.dev" };
      } catch {}
    }
    return DEFAULT_CONFIG;
  }
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function setEmailConfig(config: Partial<EmailConfig>, actorId: number, actorName: string): Promise<void> {
  const current = await getEmailConfig();
  const merged = { ...current, ...config };
  await setSiteSetting("email_config_v2", JSON.stringify(merged));
  await writeAuditLog({
    actorId,
    actorName,
    action: "email.config_updated",
    targetType: "system",
    targetId: null,
    metadata: config,
  });
}

// ============ TEMPLATE REGISTRY ============

export type EmailTemplateType = "invite" | "welcome" | "reportReceived" | "anonymousLinkExpiring" | "weeklyDigest";

export interface TemplatePlaceholder {
  key: string;
  description: string;
  required: boolean;
  testValue: string;
}

export interface TemplateDefinition {
  type: EmailTemplateType;
  label: string;
  description: string;
  placeholders: TemplatePlaceholder[];
}

// Registry of all email template types and their placeholders
export const EMAIL_TEMPLATE_REGISTRY: TemplateDefinition[] = [
  {
    type: "invite",
    label: "Workspace Invitation",
    description: "Sent when a team member is invited to join a workspace.",
    placeholders: [
      { key: "inviterName", description: "Name of the person sending the invite", required: false, testValue: "John Doe" },
      { key: "workspaceName", description: "Name of the workspace", required: true, testValue: "Acme Marketing" },
      { key: "role", description: "Role assigned to the invitee", required: false, testValue: "editor" },
      { key: "inviteUrl", description: "URL to accept the invitation", required: true, testValue: "https://slugly.app/invite/abc123" },
      { key: "expiresIn", description: "How long until the invite expires", required: false, testValue: "7 days" },
    ],
  },
  {
    type: "welcome",
    label: "Welcome Email",
    description: "Sent to new users after they sign up.",
    placeholders: [
      { key: "name", description: "User's display name", required: false, testValue: "Jane Smith" },
      { key: "dashboardUrl", description: "Link to the dashboard", required: false, testValue: "https://slugly.app/dashboard" },
    ],
  },
  {
    type: "reportReceived",
    label: "Abuse Report Received",
    description: "Sent to admins when a link is reported for abuse.",
    placeholders: [
      { key: "shortCode", description: "The reported short code", required: true, testValue: "abc123" },
      { key: "reason", description: "Reason given by the reporter", required: true, testValue: "Phishing/scam content" },
      { key: "reporterEmail", description: "Email of the reporter (if provided)", required: false, testValue: "reporter@example.com" },
      { key: "adminUrl", description: "Link to the admin panel", required: false, testValue: "https://slugly.app/admin" },
    ],
  },
  {
    type: "anonymousLinkExpiring",
    label: "Anonymous Link Expiring",
    description: "Sent when an anonymous link is about to expire (3 days before TTL).",
    placeholders: [
      { key: "shortCode", description: "The short code of the expiring link", required: true, testValue: "xyz789" },
      { key: "destinationUrl", description: "The destination URL", required: false, testValue: "https://example.com/page" },
      { key: "expiryDate", description: "When the link expires", required: true, testValue: "July 15, 2026" },
      { key: "signupUrl", description: "URL to sign up and claim the link", required: false, testValue: "https://slugly.app/auth" },
    ],
  },
  {
    type: "weeklyDigest",
    label: "Weekly Digest",
    description: "Weekly summary of link performance sent to users.",
    placeholders: [
      { key: "totalClicks", description: "Total clicks this week", required: true, testValue: "1,234" },
      { key: "topLinksHtml", description: "HTML table of top performing links", required: false, testValue: "<tr><td>/summer-sale</td><td>500 clicks</td></tr>" },
    ],
  },
];

// ============ TEMPLATE STORAGE (site_settings) ============

export interface StoredTemplate {
  subject: string;
  bodyHtml: string;
  enabled: boolean;
  updatedAt: number;
  updatedBy: string | null;
}

function getTemplateSettingKey(type: EmailTemplateType): string {
  return `email_template_${type}`;
}

// Default templates (matching current hardcoded text)
const DEFAULT_TEMPLATES: Record<EmailTemplateType, { subject: string; bodyHtml: string }> = {
  invite: {
    subject: "You've been invited to join {workspaceName} on Slugly",
    bodyHtml: `<h2>Workspace Invitation</h2>
<p>{inviterName} has invited you to join <strong>{workspaceName}</strong> as {role}.</p>
<p><a href="{inviteUrl}" class="btn">Accept Invitation</a></p>
<p>This invitation expires in {expiresIn}.</p>`,
  },
  welcome: {
    subject: "Welcome to Slugly — your links, tracked",
    bodyHtml: `<h2>Hi {name}!</h2>
<p>Thanks for joining Slugly. You're all set to start shortening links and tracking clicks.</p>
<p><strong>Here's how to get started:</strong></p>
<ol style="padding-left:20px;">
  <li>Create a project to organize your links</li>
  <li>Shorten your first URL</li>
  <li>Share it and watch the clicks roll in</li>
</ol>
<a href="{dashboardUrl}" class="btn">Go to Dashboard</a>`,
  },
  reportReceived: {
    subject: "[Slugly] New abuse report: /{shortCode}",
    bodyHtml: `<h2>New Abuse Report</h2>
<p>A user has reported a link for potential abuse.</p>
<div class="meta">
  <strong>Short code:</strong> /{shortCode}<br>
  <strong>Reason:</strong> {reason}<br>
  <strong>Reporter:</strong> {reporterEmail}
</div>
<p>Review this report in the admin panel.</p>
<a href="{adminUrl}" class="btn">Open Admin Panel</a>`,
  },
  anonymousLinkExpiring: {
    subject: "[Slugly] Anonymous link /{shortCode} expiring soon",
    bodyHtml: `<h2>Link Expiring Soon</h2>
<p>An anonymous link is expiring in 3 days.</p>
<div class="meta">
  <strong>Short code:</strong> /{shortCode}<br>
  <strong>Destination:</strong> {destinationUrl}<br>
  <strong>Expires:</strong> {expiryDate}
</div>
<p>If this link should be preserved, claim it by signing in.</p>
<a href="{signupUrl}" class="btn">Sign Up to Claim</a>`,
  },
  weeklyDigest: {
    subject: "[Slugly] Your weekly link report — {totalClicks} clicks",
    bodyHtml: `<h2>Weekly Link Report</h2>
<p>Here's how your links performed this week:</p>
<div class="meta">
  <strong>Total clicks:</strong> {totalClicks}
</div>
<table style="width:100%;border-collapse:collapse;font-size:13px;">
  {topLinksHtml}
</table>`,
  },
};

export async function getTemplate(type: EmailTemplateType): Promise<StoredTemplate> {
  const key = getTemplateSettingKey(type);
  const raw = await getSiteSetting(key);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {}
  }
  // Return default (seed on first access)
  const def = DEFAULT_TEMPLATES[type];
  const template: StoredTemplate = {
    subject: def.subject,
    bodyHtml: def.bodyHtml,
    enabled: true,
    updatedAt: Date.now(),
    updatedBy: null,
  };
  await setSiteSetting(key, JSON.stringify(template));
  return template;
}

export async function getAllTemplates(): Promise<Record<EmailTemplateType, StoredTemplate>> {
  const result: Partial<Record<EmailTemplateType, StoredTemplate>> = {};
  for (const def of EMAIL_TEMPLATE_REGISTRY) {
    result[def.type] = await getTemplate(def.type);
  }
  return result as Record<EmailTemplateType, StoredTemplate>;
}

export async function saveTemplate(
  type: EmailTemplateType,
  data: { subject?: string; bodyHtml?: string; enabled?: boolean },
  actorId: number,
  actorName: string
): Promise<{ success: boolean; warnings: string[] }> {
  const current = await getTemplate(type);
  const warnings: string[] = [];

  const newSubject = data.subject ?? current.subject;
  const newBody = data.bodyHtml ?? current.bodyHtml;
  const newEnabled = data.enabled ?? current.enabled;

  // Validate required placeholders
  const def = EMAIL_TEMPLATE_REGISTRY.find(d => d.type === type);
  if (def) {
    for (const ph of def.placeholders) {
      if (ph.required) {
        const pattern = `{${ph.key}}`;
        if (!newSubject.includes(pattern) && !newBody.includes(pattern)) {
          warnings.push(`Required placeholder {${ph.key}} is missing from the template.`);
        }
      }
    }

    // Check for unknown placeholders
    const allKnownKeys = new Set(def.placeholders.map(p => p.key));
    const usedPlaceholders = Array.from(newSubject.matchAll(/\{(\w+)\}/g)).concat(Array.from(newBody.matchAll(/\{(\w+)\}/g)));
    for (const match of usedPlaceholders) {
      if (!allKnownKeys.has(match[1])) {
        warnings.push(`Unknown placeholder {${match[1]}} found in template.`);
      }
    }
  }

  const updated: StoredTemplate = {
    subject: newSubject,
    bodyHtml: newBody,
    enabled: newEnabled,
    updatedAt: Date.now(),
    updatedBy: actorName,
  };

  await setSiteSetting(getTemplateSettingKey(type), JSON.stringify(updated));
  await writeAuditLog({
    actorId,
    actorName,
    action: "email.template_updated",
    targetType: "email_template",
    targetId: type,
    metadata: { subject: newSubject, enabled: newEnabled, warnings },
  });

  return { success: true, warnings };
}

// ============ TEMPLATE RENDERING ============

function baseLayout(content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #f8f9fa; }
    .container { max-width: 560px; margin: 0 auto; padding: 40px 20px; }
    .card { background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .logo { font-size: 20px; font-weight: 700; color: #7c3aed; margin-bottom: 24px; }
    .content { color: #374151; font-size: 15px; line-height: 1.6; }
    .content h2 { color: #111827; font-size: 18px; margin: 0 0 12px; }
    .btn { display: inline-block; padding: 10px 20px; background: #7c3aed; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 500; font-size: 14px; }
    .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px; }
    .meta { background: #f3f4f6; border-radius: 8px; padding: 12px 16px; margin: 16px 0; font-size: 13px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo">Slugly</div>
      <div class="content">${content}</div>
      <div class="footer">
        This email was sent by Slugly. If you didn't expect this, you can ignore it.
      </div>
    </div>
  </div>
</body>
</html>`;
}

function substituteVariables(text: string, variables: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (match, key) => {
    return variables[key] !== undefined ? variables[key] : match;
  });
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render a template with variables. Returns { subject, html } ready to send.
 * If template is disabled, returns null (caller should skip sending).
 */
export async function renderTemplate(
  type: EmailTemplateType,
  variables: Record<string, string>
): Promise<{ subject: string; html: string } | null> {
  const template = await getTemplate(type);
  if (!template.enabled) return null;

  const subject = substituteVariables(template.subject, variables);
  const bodyHtml = substituteVariables(template.bodyHtml, variables);
  const html = baseLayout(bodyHtml);

  return { subject, html };
}

/**
 * Render a preview with test values (does not check enabled status).
 */
export function renderPreview(
  type: EmailTemplateType,
  subject: string,
  bodyHtml: string
): { subject: string; html: string } {
  const def = EMAIL_TEMPLATE_REGISTRY.find(d => d.type === type);
  const testVars: Record<string, string> = {};
  if (def) {
    for (const ph of def.placeholders) {
      testVars[ph.key] = ph.testValue;
    }
  }
  const renderedSubject = substituteVariables(subject, testVars);
  const renderedBody = substituteVariables(bodyHtml, testVars);
  return { subject: renderedSubject, html: baseLayout(renderedBody) };
}

// ============ SEND EMAIL ============
interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

export async function sendEmail(params: SendEmailParams): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!resend) {
    console.warn("[Email] Resend not configured (RESEND_API_KEY missing)");
    return { success: false, error: "Resend not configured" };
  }

  const config = await getEmailConfig();
  if (!config.enabled) {
    return { success: false, error: "Email sending is disabled" };
  }

  const from = `${config.senderName} <${config.senderEmail}>`;

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: Array.isArray(params.to) ? params.to : [params.to],
      subject: params.subject,
      html: params.html,
      replyTo: params.replyTo,
    });

    if (error) {
      console.error("[Email] Send failed:", error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err: any) {
    console.error("[Email] Exception:", err);
    return { success: false, error: err.message || "Unknown error" };
  }
}

/**
 * High-level: render template + send in one call.
 * Returns null if template is disabled.
 */
export async function sendTemplatedEmail(
  type: EmailTemplateType,
  to: string | string[],
  variables: Record<string, string>
): Promise<{ success: boolean; id?: string; error?: string } | null> {
  const rendered = await renderTemplate(type, variables);
  if (!rendered) return null; // Template disabled
  return sendEmail({ to, ...rendered });
}
