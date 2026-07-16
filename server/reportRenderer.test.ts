import { describe, it, expect } from "vitest";
import { renderReportHtml, generatePdf } from "./reportRenderer";
import type { ReportData } from "./workspace";
import type { WorkspaceBranding } from "./workspace";

const mockBranding: WorkspaceBranding = {
  logoUrl: "https://example.com/logo.png",
  brandColor: "#ff6600",
  companyName: "Acme Agency",
  contactEmail: "reports@acme.com",
  website: "https://acme.com",
};

const mockReportData: ReportData = {
  title: "Test Project — Performance Report",
  period: { from: "2026-05-22", to: "2026-06-21", days: 30 },
  generatedAt: "2026-06-21T12:00:00.000Z",
  summary: {
    totalClicks: 1234,
    uniqueClicks: 890,
    linkCount: 15,
    topLink: { shortCode: "abc123", destinationUrl: "https://example.com", clicks: 500 },
  },
  timeSeries: [
    { day: "2026-06-01", clicks: 40 },
    { day: "2026-06-02", clicks: 55 },
    { day: "2026-06-03", clicks: 30 },
  ],
  channels: [
    { source: "twitter", medium: "social", clicks: 600, share: 48.6 },
    { source: "google", medium: "cpc", clicks: 400, share: 32.4 },
  ],
  topLinks: [
    { shortCode: "abc123", destinationUrl: "https://example.com", title: "Main Page", clicks: 500, uniqueClicks: 350 },
    { shortCode: "xyz789", destinationUrl: "https://example.com/promo", title: null, clicks: 200, uniqueClicks: 150 },
  ],
  topCountries: [
    { country: "US", clicks: 600 },
    { country: "UK", clicks: 200 },
  ],
  topDevices: [
    { device: "mobile", clicks: 700 },
    { device: "desktop", clicks: 500 },
  ],
  topReferrers: [
    { referrer: "https://twitter.com", clicks: 400 },
  ],
};

describe("reportRenderer", () => {
  describe("renderReportHtml", () => {
    it("renders valid HTML with branding", () => {
      const html = renderReportHtml(mockReportData, mockBranding);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("Acme Agency");
      expect(html).toContain("#ff6600");
      expect(html).toContain("https://example.com/logo.png");
      expect(html).toContain("reports@acme.com");
      expect(html).toContain("https://acme.com");
    });

    it("includes report title and period", () => {
      const html = renderReportHtml(mockReportData, mockBranding);
      expect(html).toContain("Test Project — Performance Report");
      expect(html).toContain("2026-05-22");
      expect(html).toContain("2026-06-21");
    });

    it("includes summary metrics", () => {
      const html = renderReportHtml(mockReportData, mockBranding);
      expect(html).toContain("1,234");
      expect(html).toContain("890");
      expect(html).toContain("15");
    });

    it("includes channel breakdown", () => {
      const html = renderReportHtml(mockReportData, mockBranding);
      expect(html).toContain("twitter");
      expect(html).toContain("google");
      expect(html).toContain("48.6%");
    });

    it("includes top links", () => {
      const html = renderReportHtml(mockReportData, mockBranding);
      expect(html).toContain("abc123");
      expect(html).toContain("xyz789");
    });

    it("includes countries and devices", () => {
      const html = renderReportHtml(mockReportData, mockBranding);
      expect(html).toContain("US");
      expect(html).toContain("UK");
      expect(html).toContain("mobile");
      expect(html).toContain("desktop");
    });

    it("renders with default branding when no custom branding", () => {
      const defaultBranding: WorkspaceBranding = {
        logoUrl: null,
        brandColor: "#6366f1",
        companyName: null,
        contactEmail: null,
        website: null,
      };
      const html = renderReportHtml(mockReportData, defaultBranding);
      expect(html).toContain("Analytics Report");
      expect(html).toContain("#6366f1");
      expect(html).not.toContain("reports@acme.com");
    });

    it("escapes HTML in user-provided content", () => {
      const xssBranding: WorkspaceBranding = {
        ...mockBranding,
        companyName: "<script>alert('xss')</script>",
      };
      const html = renderReportHtml(mockReportData, xssBranding);
      expect(html).not.toContain("<script>alert('xss')</script>");
      expect(html).toContain("&lt;script&gt;");
    });

    it("handles empty data gracefully", () => {
      const emptyData: ReportData = {
        title: "Empty Report",
        period: { from: "2026-06-01", to: "2026-06-21", days: 20 },
        generatedAt: "2026-06-21T12:00:00.000Z",
        summary: { totalClicks: 0, uniqueClicks: 0, linkCount: 0, topLink: null },
        timeSeries: [],
        channels: [],
        topLinks: [],
        topCountries: [],
        topDevices: [],
        topReferrers: [],
      };
      const html = renderReportHtml(emptyData, mockBranding);
      expect(html).toContain("Empty Report");
      expect(html).toContain("0");
    });
  });

  describe("generatePdf", () => {
    it("returns null when no PDF engine is available", async () => {
      const html = "<html><body>Test</body></html>";
      const result = await generatePdf(html);
      // On this runtime, headless Chromium is not available
      expect(result).toBeNull();
    });
  });
});
