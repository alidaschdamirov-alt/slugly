import { describe, expect, it } from "vitest";
import { planAnonymousShorten, resumeAnonymousShorten } from "../client/src/lib/anonymousShorten";

describe("anonymous shortening with Turnstile", () => {
  it("queues the first URL and submits it automatically when verification succeeds", () => {
    const url = "https://example.com/very-long-campaign-page-2026";
    const firstAction = planAnonymousShorten(url, true, null);

    expect(firstAction).toEqual({ kind: "await-captcha", pendingUrl: url });
    expect(resumeAnonymousShorten(firstAction.kind === "await-captcha" ? firstAction.pendingUrl : null, "captcha-token"))
      .toEqual({ url, captchaToken: "captcha-token" });
  });

  it("submits immediately when Turnstile is already complete", () => {
    expect(planAnonymousShorten("https://example.com/", true, "ready-token")).toEqual({
      kind: "submit",
      payload: { url: "https://example.com/", captchaToken: "ready-token" },
    });
  });
});
