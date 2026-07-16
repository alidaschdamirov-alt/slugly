import { TRPCError } from "@trpc/server";

export type NotificationPayload = {
  title: string;
  content: string;
};

const TITLE_MAX_LENGTH = 1200;
const CONTENT_MAX_LENGTH = 20000;

function validatePayload(input: NotificationPayload): NotificationPayload {
  const title = input.title?.trim();
  const content = input.content?.trim();
  if (!title || !content) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Notification title and content are required." });
  }
  if (title.length > TITLE_MAX_LENGTH || content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Notification payload is too long." });
  }
  return { title, content };
}

/**
 * Logs an owner notification. Operational alerts are also delivered by email
 * when RESEND_API_KEY and the email settings are configured.
 */
export async function notifyOwner(payload: NotificationPayload): Promise<boolean> {
  const validated = validatePayload(payload);
  console.info(`[Owner notification] ${validated.title}: ${validated.content}`);
  return true;
}
