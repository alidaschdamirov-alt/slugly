import { getDatabaseUrl } from "./databaseUrl";

const protectedAdminEmails = Array.from(
  new Set(
    [
      "alidaschdamirov@gmail.com",
      process.env.BOOTSTRAP_ADMIN_EMAIL,
      ...(process.env.ADMIN_EMAILS ?? "").split(","),
    ]
      .map(email => email?.trim().toLowerCase())
      .filter((email): email is string => Boolean(email))
  )
);

export function isProtectedAdminEmail(email: string | null | undefined) {
  return Boolean(
    email && protectedAdminEmails.includes(email.trim().toLowerCase())
  );
}

export const ENV = {
  databaseUrl: getDatabaseUrl() ?? "",
  clerkAdminUserId: process.env.CLERK_ADMIN_USER_ID ?? "",
  bootstrapAdminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL ?? "",
  protectedAdminEmails,
  storageDir: process.env.STORAGE_DIR ?? "./data/storage",
  cronSecret: process.env.CRON_SECRET ?? "",
  isProduction: process.env.NODE_ENV === "production",
};
