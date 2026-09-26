import { describe, expect, it } from "vitest";
import { expandCustomHtml, prepareSandboxedCustomHtml, renderPublicPageHtml } from "./pagesPublic";

function model() {
  return {
    page: {
      id: 1,
      workspaceId: 1,
      userId: 1,
      type: "landing",
      slug: "custom",
      title: "Custom Page",
      headline: "Custom Headline",
      description: "Description",
      avatarUrl: null,
      heroImageUrl: null,
      accentColor: "#5A3FF0",
      backgroundColor: "#FFFFFF",
      textColor: "#14152B",
      buttonStyle: "rounded",
      renderMode: "custom_html",
      customHtml: '<html><head><title>Own</title></head><body><a href="{{SLUGLY_CTA_7}}">Buy</a><script>window.customRan=true</script></body></html>',
      domainId: null,
      status: "published",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    buttons: [
      {
        id: 7,
        pageId: 1,
        linkId: 99,
        label: "Buy",
        subtitle: null,
        style: "primary",
        position: 0,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        href: "/r/abc123",
        destinationUrl: "https://example.com",
        shortCode: "abc123",
      },
    ],
  } as any;
}

describe("Pages custom HTML rendering", () => {
  it("expands connected Slugly CTA placeholders", () => {
    const html = expandCustomHtml('<a href="{{SLUGLY_CTA_7}}">Buy</a>', model());
    expect(html).toContain('href="/r/abc123"');
  });

  it("forces user-initiated links to leave the sandbox frame", () => {
    const html = prepareSandboxedCustomHtml("<html><head></head><body>ok</body></html>", model());
    expect(html).toContain('<head><base target="_top">');
  });

  it("reports content height after layout and image changes", () => {
    const html = prepareSandboxedCustomHtml("<html><head></head><body><img src='hero.jpg'></body></html>", model());
    expect(html).toContain('type: MESSAGE_TYPE, height: height');
    expect(html).toContain('new ResizeObserver(measure)');
    expect(html).toContain('image.addEventListener("load", measure');
  });

  it("renders custom HTML in a sandbox without same-origin or form privileges", () => {
    const html = renderPublicPageHtml(model());
    expect(html).toContain("sandbox=");
    expect(html).toContain("allow-scripts");
    expect(html).toContain("allow-top-navigation-by-user-activation");
    expect(html).not.toContain("allow-same-origin");
    expect(html).not.toContain("allow-forms");
    expect(html).toContain("srcdoc=");
    expect(html).toContain('event.source !== frame.contentWindow');
    expect(html).toContain('event.data.type !== "slugly:custom-page-size"');
    expect(html).toContain('class="custom-shell"');
    expect(html).not.toContain('.custom-frame{position:fixed');
    expect(html).toContain("Powered by Slugly");
  });
});
