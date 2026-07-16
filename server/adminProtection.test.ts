import { describe, expect, it } from "vitest";
import { isProtectedAdminEmail } from "./_core/env";

describe("protected administrator identity", () => {
  it("always recognizes the owner email", () => {
    expect(isProtectedAdminEmail("alidaschdamirov@gmail.com")).toBe(true);
    expect(isProtectedAdminEmail("  AliDaschdamirov@GMAIL.com ")).toBe(true);
  });

  it("does not grant admin access to unrelated emails", () => {
    expect(isProtectedAdminEmail("someone@example.com")).toBe(false);
    expect(isProtectedAdminEmail(null)).toBe(false);
  });
});
