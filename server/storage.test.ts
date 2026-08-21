import { beforeEach, describe, expect, it } from "vitest";
import {
  isPrivateStorageKey,
  storageGet,
  verifyStorageSignature,
} from "./storage";

describe("private storage classification", () => {
  beforeEach(() => {
    process.env.STORAGE_SIGNING_SECRET = "slugly-storage-test-secret";
  });

  it("keeps backups and generated reports private while branding remains public", () => {
    expect(isPrivateStorageKey("backups/v2/example.json.enc")).toBe(true);
    expect(isPrivateStorageKey("reports/report-ws1.html")).toBe(true);
    expect(isPrivateStorageKey("branding/ws-1-logo.png")).toBe(false);
  });

  it("returns a verifiable short-lived signed URL for reports", async () => {
    const result = await storageGet("reports/report-ws1.html");
    expect(result.url).toMatch(/^\/storage-private\/reports\/report-ws1\.html\?/);

    const parsed = new URL(result.url, "https://slugly.test");
    const expires = Number(parsed.searchParams.get("expires"));
    const signature = parsed.searchParams.get("signature") || "";
    expect(expires).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(verifyStorageSignature(result.key, expires, signature)).toBe(true);
  });

  it("keeps ordinary public assets on the public storage route", async () => {
    await expect(storageGet("branding/ws-1-logo.png")).resolves.toEqual({
      key: "branding/ws-1-logo.png",
      url: "/storage/branding/ws-1-logo.png",
    });
  });
});
