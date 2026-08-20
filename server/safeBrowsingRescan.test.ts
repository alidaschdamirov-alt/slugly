import { describe, expect, it, vi } from "vitest";
import { runSafeBrowsingRescan } from "./safeBrowsingRescan";

describe("Safe Browsing rescan", () => {
  it("quarantines only links flagged malicious", async () => {
    const quarantine = vi.fn().mockResolvedValue(undefined);
    const result = await runSafeBrowsingRescan({
      listActiveLinks: vi.fn().mockResolvedValue([
        { id: 1, userId: 10, shortCode: "safe", destinationUrl: "https://example.com" },
        { id: 2, userId: 11, shortCode: "bad", destinationUrl: "https://malware.example" },
      ]),
      check: vi.fn(async url =>
        url.includes("malware")
          ? { safe: false, verdict: "malicious" as const, threatTypes: ["MALWARE"], reason: "malware" }
          : { safe: true, verdict: "clean" as const, threatTypes: [] }
      ),
      quarantine,
    });

    expect(result).toEqual({ scanned: 2, quarantined: 1, unknown: 0, errors: 0 });
    expect(quarantine).toHaveBeenCalledTimes(1);
    expect(quarantine).toHaveBeenCalledWith(
      expect.objectContaining({ id: 2, shortCode: "bad" }),
      expect.objectContaining({ verdict: "malicious", reason: "malware" })
    );
  });

  it("keeps unknown links active and records them for later recheck", async () => {
    const quarantine = vi.fn().mockResolvedValue(undefined);
    const recordUnknown = vi.fn().mockResolvedValue(undefined);
    const unknownLink = {
      id: 3,
      userId: 12,
      shortCode: "unknown",
      destinationUrl: "https://unknown.example",
    };

    const result = await runSafeBrowsingRescan({
      listActiveLinks: vi.fn().mockResolvedValue([unknownLink]),
      check: vi.fn().mockResolvedValue({
        safe: true,
        verdict: "unknown",
        threatTypes: [],
      }),
      quarantine,
      recordUnknown,
    });

    expect(result).toEqual({ scanned: 1, quarantined: 0, unknown: 1, errors: 0 });
    expect(quarantine).not.toHaveBeenCalled();
    expect(recordUnknown).toHaveBeenCalledWith(unknownLink);
  });

  it("continues scanning after one provider error", async () => {
    const quarantine = vi.fn().mockResolvedValue(undefined);
    const result = await runSafeBrowsingRescan({
      listActiveLinks: vi.fn().mockResolvedValue([
        { id: 1, userId: 10, shortCode: "one", destinationUrl: "https://one.example" },
        { id: 2, userId: 11, shortCode: "two", destinationUrl: "https://two.example" },
      ]),
      check: vi.fn(async url => {
        if (url.includes("one")) throw new Error("provider unavailable");
        return { safe: false, verdict: "malicious" as const, threatTypes: ["SOCIAL_ENGINEERING"], reason: "phishing" };
      }),
      quarantine,
    });

    expect(result).toEqual({ scanned: 2, quarantined: 1, unknown: 0, errors: 1 });
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
