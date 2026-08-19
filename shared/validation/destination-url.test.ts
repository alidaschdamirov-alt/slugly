import { describe, expect, it } from "vitest";
import { normalizeDestinationUrl } from "./destination-url";

const longPath = "https://example.com/" + "a".repeat(500);

const cases: Array<{
  input: string;
  expected: string | null;
}> = [
  { input: "test", expected: null },
  { input: "dfdf", expected: null },
  { input: "тест", expected: null },
  { input: "не url", expected: null },
  { input: "", expected: null },
  { input: "   ", expected: null },
  { input: "javascript:alert(1)", expected: null },
  { input: "ftp://example.com", expected: null },
  { input: "http://localhost:3000", expected: null },
  { input: "http://192.168.1.1", expected: null },
  { input: "http://foo.local", expected: null },
  { input: "https://example.123", expected: null },
  { input: "example.com", expected: "https://example.com/" },
  { input: "example.com/page", expected: "https://example.com/page" },
  { input: "www.example.com", expected: "https://www.example.com/" },
  { input: "https://example.com", expected: "https://example.com/" },
  { input: "HTTPS://Example.COM/Path", expected: "https://example.com/Path" },
  {
    input: "https://example.com/p?a=1&b=2#x",
    expected: "https://example.com/p?a=1&b=2#x",
  },
  {
    input: "https://sub.domain.example.co.uk/x",
    expected: "https://sub.domain.example.co.uk/x",
  },
  { input: "пример.рф", expected: "https://xn--e1afmkfd.xn--p1ai/" },
  { input: longPath, expected: longPath },
];

describe("normalizeDestinationUrl", () => {
  it.each(cases)("normalizes %#", ({ input, expected }) => {
    expect(normalizeDestinationUrl(input)).toBe(expected);
  });
});
