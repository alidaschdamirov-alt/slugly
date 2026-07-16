import { defineConfig } from "drizzle-kit";
import { getDatabaseUrl } from "./server/_core/databaseUrl";

const connectionString = getDatabaseUrl();
if (!connectionString) {
  throw new Error(
    "Database configuration is required. Set DATABASE_URL or DB_HOST, DB_PORT, DB_NAME, DB_USER, and DB_PASSWORD."
  );
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: connectionString,
  },
});
