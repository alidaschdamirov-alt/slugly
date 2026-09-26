import { describe, expect, it, vi } from "vitest";
import { fetchProjectAnalyticsCsv, fetchTagAnalyticsCsv } from "../client/src/lib/csvExport";

describe("project CSV export", () => {
  it("uses the render-time tRPC utility instead of invoking a hook on click", async () => {
    const fetch = vi.fn().mockResolvedValue([{ day: "2026-09-03", clicks: 2 }]);
    const utils = { analyticsExport: { projectCsv: { fetch }, tagCsv: { fetch: vi.fn() } } };

    await expect(fetchProjectAnalyticsCsv(utils, 6, 30)).resolves.toEqual([
      { day: "2026-09-03", clicks: 2 },
    ]);
    expect(fetch).toHaveBeenCalledWith({ projectId: 6, days: 30 });
  });

  it("also keeps the tag export hook-free", async () => {
    const fetch = vi.fn().mockResolvedValue([{ tag: "launch", clicks: 4 }]);
    const utils = { analyticsExport: { projectCsv: { fetch: vi.fn() }, tagCsv: { fetch } } };

    await expect(fetchTagAnalyticsCsv(utils, "launch", 14)).resolves.toEqual([
      { tag: "launch", clicks: 4 },
    ]);
    expect(fetch).toHaveBeenCalledWith({ tag: "launch", days: 14 });
  });
});
