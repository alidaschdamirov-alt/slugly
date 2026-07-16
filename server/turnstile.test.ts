import { afterEach, describe, expect, it } from "vitest";
import { isTurnstileEnabled, verifyTurnstileToken } from "./rateLimit";

const originalSecret = process.env.TURNSTILE_SECRET_KEY;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
  else process.env.TURNSTILE_SECRET_KEY = originalSecret;
});

describe("Turnstile configuration", () => {
  it("is optional and fails open when no secret is configured", async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    expect(isTurnstileEnabled()).toBe(false);
    await expect(verifyTurnstileToken("")).resolves.toBe(true);
  });

  it("rejects an empty token when a secret is configured", async () => {
    process.env.TURNSTILE_SECRET_KEY = "test-secret-key";
    expect(isTurnstileEnabled()).toBe(true);
    await expect(verifyTurnstileToken("")).resolves.toBe(false);
  });
});
