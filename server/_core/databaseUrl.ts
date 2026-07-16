export function getDatabaseUrl(
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  if (env.DATABASE_URL) return env.DATABASE_URL;

  const host = env.DB_HOST;
  const database = env.DB_NAME;
  const user = env.DB_USER;
  const password = env.DB_PASSWORD;
  if (!host || !database || !user || password === undefined) return undefined;

  const port = env.DB_PORT || "3306";
  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${encodeURIComponent(database)}`;
}
