import mysql from "mysql2/promise";

const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{1,62}$/i;
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

function getDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const { DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, DB_PORT = "3306" } = process.env;
  if (!DB_HOST || !DB_NAME || !DB_USER || DB_PASSWORD === undefined) return null;
  return `mysql://${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASSWORD)}@${DB_HOST}:${DB_PORT}/${encodeURIComponent(DB_NAME)}`;
}

function hasScheme(value) {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

function looksLikeHostname(value) {
  const firstSegment = value.split(/[/?#]/, 1)[0] || "";
  if (!firstSegment.includes(".")) return false;
  return firstSegment.length <= 253;
}

function isBlockedPublicHostname(hostname) {
  const host = hostname.toLowerCase();
  return host === "localhost" || IPV4_RE.test(host) || host.endsWith(".local") || host.endsWith(".internal");
}

function normalizeDestinationUrl(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) return null;
  if (!hasScheme(trimmed) && !looksLikeHostname(trimmed)) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url;
  try {
    url = new URL(withProtocol);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!HOSTNAME_RE.test(url.hostname)) return null;
  if (isBlockedPublicHostname(url.hostname)) return null;
  return url.toString();
}

const databaseUrl = getDatabaseUrl();
if (!databaseUrl) {
  console.error("DATABASE_URL or DB_HOST/DB_NAME/DB_USER/DB_PASSWORD is required.");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const connection = await mysql.createConnection(databaseUrl);
const [rows] = await connection.execute("SELECT id, shortCode, destinationUrl, status FROM links ORDER BY id ASC");
const invalid = rows.filter(row => !normalizeDestinationUrl(row.destinationUrl));

console.log(`Scanned ${rows.length} links.`);
console.log(`Invalid destination URLs: ${invalid.length}`);

if (invalid.length > 0) {
  console.table(invalid.map(row => ({ id: row.id, shortCode: row.shortCode, destinationUrl: row.destinationUrl })));
}

if (apply && invalid.length > 0) {
  const ids = invalid.map(row => row.id);
  const placeholders = ids.map(() => "?").join(",");
  await connection.execute(`UPDATE links SET status = 'paused' WHERE id IN (${placeholders})`, ids);
  console.log(`Paused ${ids.length} links with invalid destination URLs.`);
} else if (!apply) {
  console.log("Dry run only. Re-run with --apply to pause invalid legacy links.");
}

await connection.end();
