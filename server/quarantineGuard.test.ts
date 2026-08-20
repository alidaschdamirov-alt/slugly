import { describe, expect, it } from "vitest";
import { renderQuarantinePage } from "./quarantineGuard";

describe("quarantine warning page", () => {
  it("does not expose a continue-to-destination action", () => {
    const html = renderQuarantinePage("abc123", "Phishing signal", ["SOCIAL_ENGINEERING"]);
    expect(html).toContain("under security review");
    expect(html).toContain("/r/abc123");
    expect(html).toContain("Request review");
    expect(html).not.toContain("Continue to destination");
    expect(html).not.toContain("http://evil.example");
  });

  it("escapes untrusted reason and short code content", () => {
    const html = renderQuarantinePage("abc<script>", "<img src=x onerror=alert(1)>", []);
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;img");
    expect(html).toContain("abc&lt;script&gt;");
  });
});
