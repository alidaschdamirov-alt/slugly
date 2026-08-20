import { describe, expect, it } from "vitest";
import { hostnameMatchesBlockPattern } from "./blocklist";

describe("hostnameMatchesBlockPattern", () => {
  it("matches exact hostnames case-insensitively", () => {
    expect(hostnameMatchesBlockPattern("Bad.Example.com", "bad.example.com")).toBe(true);
    expect(hostnameMatchesBlockPattern("other.example.com", "bad.example.com")).toBe(false);
  });

  it("matches any subdomain for wildcard patterns", () => {
    expect(hostnameMatchesBlockPattern("a.example.com", "*.example.com")).toBe(true);
    expect(hostnameMatchesBlockPattern("deep.a.example.com", "*.example.com")).toBe(true);
  });

  it("does not match the bare root for a wildcard", () => {
    expect(hostnameMatchesBlockPattern("example.com", "*.example.com")).toBe(false);
  });

  it("does not allow suffix confusion", () => {
    expect(hostnameMatchesBlockPattern("notexample.com", "*.example.com")).toBe(false);
    expect(hostnameMatchesBlockPattern("example.com.evil.test", "*.example.com")).toBe(false);
  });
});
