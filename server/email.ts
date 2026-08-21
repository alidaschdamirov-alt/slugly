import * as core from "./emailCore";
import type { EmailTemplateType } from "./emailCore";
import { recordEmailSent } from "./emailMetrics";

export * from "./emailCore";

interface TrackedSendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
  category?: string;
}

export async function sendEmail(params: TrackedSendEmailParams): Promise<{ success: boolean; id?: string; error?: string }> {
  const { category, ...message } = params;
  const result = await core.sendEmail(message);
  if (result.success && result.id) {
    const recipients = Array.isArray(params.to) ? params.to : [params.to];
    await recordEmailSent({
      emailId: result.id,
      recipients,
      category: category || "custom",
      subject: params.subject,
    }).catch(error => console.error("[EmailMetrics] Failed to log sent email:", error));
  }
  return result;
}

export async function sendTemplatedEmail(
  type: EmailTemplateType,
  to: string | string[],
  variables: Record<string, string>
): Promise<{ success: boolean; id?: string; error?: string } | null> {
  const rendered = await core.renderTemplate(type, variables);
  if (!rendered) return null;
  return sendEmail({ to, ...rendered, category: type });
}
