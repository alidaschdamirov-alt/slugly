const baseUrl = (process.env.PRODUCTION_BASE_URL || "https://slugly.io").replace(/\/$/, "");
const expectedCommit = String(process.env.EXPECTED_COMMIT || "").trim();
const expectedNodeMajor = String(process.env.EXPECTED_NODE_MAJOR || "24").trim();
const maxAttempts = Math.max(1, Number(process.env.SMOKE_MAX_ATTEMPTS || 36));
const delayMs = Math.max(1000, Number(process.env.SMOKE_DELAY_MS || 20_000));

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function commitsMatch(actual, expected) {
  if (!expected) return true;
  if (!actual) return false;
  const a = String(actual).trim().toLowerCase();
  const e = String(expected).trim().toLowerCase();
  return a === e || a.startsWith(e) || e.startsWith(a);
}

async function fetchWithTimeout(url, init = {}, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "cache-control": "no-cache",
        "user-agent": "slugly-production-smoke/1.0",
        ...(init.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function verifyOnce() {
  const cacheBust = `smoke=${Date.now()}`;
  const healthResponse = await fetchWithTimeout(`${baseUrl}/healthz?${cacheBust}`);
  if (!healthResponse.ok) throw new Error(`healthz returned HTTP ${healthResponse.status}`);
  const health = await healthResponse.json();
  if (health?.status !== "ok") throw new Error(`healthz status is ${JSON.stringify(health?.status)}`);
  if (!commitsMatch(health?.commit, expectedCommit)) {
    throw new Error(`deployed commit ${health?.commit || "unknown"} does not match ${expectedCommit}`);
  }
  if (expectedNodeMajor && !String(health?.runtime || "").startsWith(`v${expectedNodeMajor}.`)) {
    throw new Error(`runtime ${health?.runtime || "unknown"} is not Node ${expectedNodeMajor}`);
  }

  for (const path of ["/", "/pricing"]) {
    const response = await fetchWithTimeout(`${baseUrl}${path}?${cacheBust}`, { redirect: "follow" });
    if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) throw new Error(`${path} did not return HTML`);
    const html = await response.text();
    if (!html.includes('id="root"')) throw new Error(`${path} did not return the Slugly SPA shell`);
  }

  return health;
}

let lastError;
for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  try {
    const health = await verifyOnce();
    console.log(`Production smoke passed on attempt ${attempt}/${maxAttempts}`);
    console.log(JSON.stringify({
      baseUrl,
      commit: health.commit,
      runtime: health.runtime,
      uptime: health.uptime,
      timestamp: health.timestamp,
    }, null, 2));
    process.exit(0);
  } catch (error) {
    lastError = error;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`Smoke attempt ${attempt}/${maxAttempts} not ready: ${message}`);
    if (attempt < maxAttempts) await sleep(delayMs);
  }
}

throw new Error(`Production smoke failed after ${maxAttempts} attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
