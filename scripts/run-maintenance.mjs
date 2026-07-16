const host = process.env.APP_HOST;
const secret = process.env.CRON_SECRET;

if (!host || !secret) {
  throw new Error("APP_HOST and CRON_SECRET are required");
}

const baseUrl =
  host.startsWith("http://") || host.startsWith("https://")
    ? host.replace(/\/$/, "")
    : `https://${host}`;

const endpoints = [
  "/api/scheduled/backup",
  "/api/scheduled/notify-expiring-links",
  "/api/scheduled/cleanup-rate-limits",
];

for (const endpoint of endpoints) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${endpoint} failed with ${response.status}: ${body}`);
  }
  console.log(`${endpoint}: ${body}`);
}
