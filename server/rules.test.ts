import { describe, it, expect } from "vitest";
import { evaluateRules } from "./rules";
import type { EvaluationContext } from "./rules";

describe("evaluateRules", () => {
  const baseCtx: EvaluationContext = {
    country: "US",
    deviceType: "desktop",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    originalDestination: "https://example.com",
  };

  it("returns original destination when no rules", () => {
    const result = evaluateRules([], baseCtx);
    expect(result.destination).toBe("https://example.com");
    expect(result.variant).toBeUndefined();
    expect(result.pixelIds).toBeUndefined();
  });

  it("applies geo rule when country matches", () => {
    const rules = [{
      id: 1, linkId: 1, type: "geo" as const, priority: 1, enabled: true,
      config: { rules: [{ countries: ["US", "CA"], destination: "https://us.example.com" }] },
      createdAt: new Date(), updatedAt: new Date(),
    }];
    const result = evaluateRules(rules, baseCtx);
    expect(result.destination).toBe("https://us.example.com");
  });

  it("uses fallback when geo country does not match", () => {
    const rules = [{
      id: 1, linkId: 1, type: "geo" as const, priority: 1, enabled: true,
      config: { rules: [{ countries: ["DE", "FR"], destination: "https://eu.example.com" }], fallback: "https://global.example.com" },
      createdAt: new Date(), updatedAt: new Date(),
    }];
    const result = evaluateRules(rules, baseCtx);
    expect(result.destination).toBe("https://global.example.com");
  });

  it("applies device rule for mobile", () => {
    const rules = [{
      id: 1, linkId: 1, type: "device" as const, priority: 1, enabled: true,
      config: { rules: [{ devices: ["mobile"], destination: "https://m.example.com" }] },
      createdAt: new Date(), updatedAt: new Date(),
    }];
    const result = evaluateRules(rules, { ...baseCtx, deviceType: "mobile" });
    expect(result.destination).toBe("https://m.example.com");
  });

  it("picks A/B variant with 100% weight", () => {
    const rules = [{
      id: 1, linkId: 1, type: "ab" as const, priority: 1, enabled: true,
      config: { variants: [{ name: "control", destination: "https://a.example.com", weight: 100 }, { name: "variant", destination: "https://b.example.com", weight: 0 }] },
      createdAt: new Date(), updatedAt: new Date(),
    }];
    const result = evaluateRules(rules, baseCtx);
    expect(result.destination).toBe("https://a.example.com");
    expect(result.variant).toBe("control");
  });

  it("applies deep link for iOS mobile", () => {
    const rules = [{
      id: 1, linkId: 1, type: "deeplink" as const, priority: 1, enabled: true,
      config: { ios: { scheme: "myapp://open", appStoreUrl: "https://apps.apple.com/app" }, webFallback: "https://web.example.com" },
      createdAt: new Date(), updatedAt: new Date(),
    }];
    const ctx = { ...baseCtx, deviceType: "mobile", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS)" };
    const result = evaluateRules(rules, ctx);
    expect(result.destination).toBe("myapp://open");
    expect(result.isDeepLink).toBe(true);
  });

  it("uses web fallback for deep link on desktop", () => {
    const rules = [{
      id: 1, linkId: 1, type: "deeplink" as const, priority: 1, enabled: true,
      config: { ios: { scheme: "myapp://open", appStoreUrl: "https://apps.apple.com/app" }, webFallback: "https://web.example.com" },
      createdAt: new Date(), updatedAt: new Date(),
    }];
    const result = evaluateRules(rules, baseCtx);
    expect(result.destination).toBe("https://web.example.com");
    expect(result.isDeepLink).toBeUndefined();
  });

  it("sets pixel IDs from pixel rule", () => {
    const rules = [{
      id: 1, linkId: 1, type: "pixel" as const, priority: 1, enabled: true,
      config: { pixelIds: [10, 20], delayMs: 2000 },
      createdAt: new Date(), updatedAt: new Date(),
    }];
    const result = evaluateRules(rules, baseCtx);
    expect(result.pixelIds).toEqual([10, 20]);
    expect(result.pixelDelay).toBe(2000);
  });

  it("composes multiple rules in priority order", () => {
    const rules = [
      {
        id: 1, linkId: 1, type: "geo" as const, priority: 1, enabled: true,
        config: { rules: [{ countries: ["US"], destination: "https://us.example.com" }] },
        createdAt: new Date(), updatedAt: new Date(),
      },
      {
        id: 2, linkId: 1, type: "pixel" as const, priority: 2, enabled: true,
        config: { pixelIds: [5], delayMs: 1000 },
        createdAt: new Date(), updatedAt: new Date(),
      },
    ];
    const result = evaluateRules(rules, baseCtx);
    expect(result.destination).toBe("https://us.example.com");
    expect(result.pixelIds).toEqual([5]);
  });
});
