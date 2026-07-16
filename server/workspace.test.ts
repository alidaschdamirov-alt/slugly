import { describe, it, expect } from "vitest";
import { canUseFeature, checkLimit } from "./workspace";
import type { PlanConfig } from "./workspace";

const freePlan: PlanConfig = {
  limits: { projects: 1, links: 5, domains: 0, analyticsRetentionDays: 30, seats: 1 },
  features: { utmTemplates: false, campaignDashboard: "none", csvExport: false, bulkOps: false, geoTarget: false, abTest: false, deepLinks: false, pixels: false, roles: false, whiteLabelReports: false },
};

const proPlan: PlanConfig = {
  limits: { projects: -1, links: -1, domains: 3, analyticsRetentionDays: 365, seats: 3 },
  features: { utmTemplates: true, campaignDashboard: "full", csvExport: true, bulkOps: true, geoTarget: true, abTest: true, deepLinks: true, pixels: true, roles: false, whiteLabelReports: false },
};

const teamPlan: PlanConfig = {
  limits: { projects: -1, links: -1, domains: 25, analyticsRetentionDays: 730, seats: 10 },
  features: { utmTemplates: true, campaignDashboard: "full", csvExport: true, bulkOps: true, geoTarget: true, abTest: true, deepLinks: true, pixels: true, roles: true, whiteLabelReports: true },
};

describe("workspace gating helpers", () => {
  describe("canUseFeature", () => {
    it("free plan cannot use UTM templates", () => {
      expect(canUseFeature(freePlan, "utmTemplates")).toBe(false);
    });

    it("free plan cannot use campaign dashboard (none)", () => {
      expect(canUseFeature(freePlan, "campaignDashboard")).toBe(false);
    });

    it("pro plan can use UTM templates", () => {
      expect(canUseFeature(proPlan, "utmTemplates")).toBe(true);
    });

    it("pro plan can use campaign dashboard (full)", () => {
      expect(canUseFeature(proPlan, "campaignDashboard")).toBe(true);
    });

    it("pro plan cannot use white-label reports", () => {
      expect(canUseFeature(proPlan, "whiteLabelReports")).toBe(false);
    });

    it("team plan can use white-label reports", () => {
      expect(canUseFeature(teamPlan, "whiteLabelReports")).toBe(true);
    });

    it("team plan can use roles", () => {
      expect(canUseFeature(teamPlan, "roles")).toBe(true);
    });
  });

  describe("checkLimit", () => {
    it("free plan: 0 projects used → allowed", () => {
      const result = checkLimit(freePlan, "projects", 0);
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(1);
    });

    it("free plan: 1 project used → not allowed", () => {
      const result = checkLimit(freePlan, "projects", 1);
      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(1);
    });

    it("free plan: 5 links used → not allowed", () => {
      const result = checkLimit(freePlan, "links", 5);
      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(5);
    });

    it("pro plan: unlimited projects (-1) → always allowed", () => {
      const result = checkLimit(proPlan, "projects", 9999);
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(-1);
    });

    it("pro plan: 2 domains used, limit 3 → allowed", () => {
      const result = checkLimit(proPlan, "domains", 2);
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(3);
    });

    it("pro plan: 3 domains used, limit 3 → not allowed", () => {
      const result = checkLimit(proPlan, "domains", 3);
      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(3);
    });

    it("team plan: 9 seats used, limit 10 → allowed", () => {
      const result = checkLimit(teamPlan, "seats", 9);
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(10);
    });

    it("team plan: 10 seats used, limit 10 → not allowed", () => {
      const result = checkLimit(teamPlan, "seats", 10);
      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(10);
    });
  });
});
