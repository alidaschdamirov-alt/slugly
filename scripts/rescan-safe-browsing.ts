import "dotenv/config";
import { rescanActiveLinksWithSafeBrowsing } from "../server/safeBrowsingRescan";

const requestedLimit = Number(process.env.SAFE_BROWSING_RESCAN_LIMIT || "250");
const limit = Number.isFinite(requestedLimit) ? requestedLimit : 250;

const result = await rescanActiveLinksWithSafeBrowsing(limit);
console.log(`[SafeBrowsingRescan] scanned=${result.scanned} quarantined=${result.quarantined} errors=${result.errors}`);

if (result.errors > 0) {
  process.exitCode = 1;
}
