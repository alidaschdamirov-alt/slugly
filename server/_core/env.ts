import { getDatabaseUrl } from "./databaseUrl";

export const ENV = {
  databaseUrl: getDatabaseUrl() ?? "",
  clerkAdminUserId: process.env.CLERK_ADMIN_USER_ID ?? "",
  bootstrapAdminEmail: process.env.BOOTSTRAP_ADMIN_EMAIL ?? "",
  storageDir: process.env.STORAGE_DIR ?? "./data/storage",
  cronSecret: process.env.CRON_SECRET ?? "",
  isProduction: process.env.NODE_ENV === "production",
};
