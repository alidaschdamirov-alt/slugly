import { describe, expect, it, vi } from "vitest";
import {
  AdminActionReasonRequiredError,
  injectAdminReasons,
} from "./adminReasonTransport";

describe("admin reason transport", () => {
  it("injects a reason into a single destructive mutation payload", () => {
    const body = JSON.stringify({ json: { id: 42 } });
    const result = injectAdminReasons(
      "https://slugly.io/api/trpc/admin.deleteUser",
      body,
      () => "Fraud investigation"
    );
    expect(JSON.parse(String(result))).toEqual({
      json: { id: 42, reason: "Fraud investigation" },
    });
  });

  it("injects reasons into batched destructive procedures without touching safe entries", () => {
    const ask = vi.fn()
      .mockReturnValueOnce("User violated AUP")
      .mockReturnValueOnce("Expired anonymous cleanup");
    const body = JSON.stringify({
      "0": { json: { id: 7 } },
      "1": { json: { id: 9 } },
      "2": { json: {} },
    });
    const result = injectAdminReasons(
      "https://slugly.io/api/trpc/admin.suspendUser,admin.unsuspendUser,admin.cleanupExpiredAnonymous?batch=1",
      body,
      ask
    );
    expect(JSON.parse(String(result))).toEqual({
      "0": { json: { id: 7, reason: "User violated AUP" } },
      "1": { json: { id: 9 } },
      "2": { json: { reason: "Expired anonymous cleanup" } },
    });
  });

  it("does not reprompt when a valid reason is already present", () => {
    const ask = vi.fn();
    const body = JSON.stringify({ json: { id: 42, reason: "Already supplied" } });
    const result = injectAdminReasons(
      "/api/trpc/admin.deleteLink",
      body,
      ask
    );
    expect(result).toBe(body);
    expect(ask).not.toHaveBeenCalled();
  });

  it("cancels destructive actions when no meaningful reason is supplied", () => {
    expect(() => injectAdminReasons(
      "/api/trpc/admin.deleteLink",
      JSON.stringify({ json: { id: 1 } }),
      () => ""
    )).toThrow(AdminActionReasonRequiredError);
  });
});
