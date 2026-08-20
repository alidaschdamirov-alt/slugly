import { describe, expect, it, vi } from "vitest";
import { runSafeBrowsingRescan } from "./safeBrowsingRescan";

describe("Safe Browsing rescan", () => {
  it("quarantines only links flagged unsafe", async () => {
    const quarantine = vi.fn().mockResolvedValue(undefined);
    const result = await runSafeBrowsingRescan({
      listActiveLinks: vi.fn().mockResolvedValue([
        { id: 1, shortCode: "safe", destinationUrl: "https://example.com" },
        { id: 2, shortCode: "bad", destinationUrl: "https://malware.example" },
      ]),
      check: vi.fn(async url =>
        url.includes("malware")
          ? { safe: false, reason: "malware" }
          : { safe: true }
      ),
      quarantine,
    });

    expect(result).toEqual({ scanned: 2, quarantined: 1, errors: 0 });
    expect(quarantine).toHaveBeenCalledTimes(1);
    expect(quarantine).toHaveBeenCalledWith(
      expect.objectContaining({ id: 2, shortCode: "bad" }),
      "malware"
    );
  });

  it("continues scanning after one provider error", async () => {
    const quarantine = vi.fn().mockResolvedValue(undefined);
    const result = await runSafeBrowsingRescan({
      listActiveLinks: vi.fn().mockResolvedValue([
        { id: 1, shortCode: "one", destinationUrl: "https://one.example" },
        { id: 2, shortCode: "two", destinationUrl: "https://two.example" },
      ]),
      check: vi.fn(async url => {
        if (url.includes("one")) throw new Error("provider unavailable");
        return { safe: false, reason: "phishing" };
      }),
      quarantine,
    });

    expect(result).toEqual({ scanned: 2, quarantined: 1, errors: 1 });
    expect(quarantine).toHaveBeenCalledTimes(1);
  });

  it("caps a requested batch at 1000 links", async () => {
    const listActiveLinks = vi.fn().mockResolvedValue([]);
    await runSafeBrowsingRescan(
      {
        listActiveLinks,
        check: vi.fn(),
        quarantine: vi.fn(),
      },
      5000
    );
    expect(listActiveLinks).toHaveBeenCalledWith(1000);
  });
});
