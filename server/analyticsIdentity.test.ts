import { describe, expect, it } from "vitest";
import { normalizeAnalyticsId, normalizeAnalyticsTraits } from "../client/src/lib/analyticsIdentity";

describe("analytics identity normalization", () => {
  it("accepts short numeric workspace ids after namespacing", () => {
    expect(normalizeAnalyticsId("ws", 4)).toBe("ws_4");
    expect(normalizeAnalyticsTraits({ workspaceId: 4 })).toEqual({ workspaceId: "ws_4" });
  });

  it("keeps already namespaced ids and rejects empty values", () => {
    expect(normalizeAnalyticsId("user", "user_12")).toBe("user_12");
    expect(normalizeAnalyticsId("user", "  ")).toBeNull();
  });
});
