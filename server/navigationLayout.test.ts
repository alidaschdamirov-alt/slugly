import { describe, expect, it } from "vitest";
import {
  APP_NAV_CLASSES,
  DESKTOP_NAV_MIN_WIDTH,
  usesCompactAppNavigation,
} from "../client/src/lib/navigationLayout";

describe("application navigation layout", () => {
  it("uses the drawer at the reported 1182px laptop viewport", () => {
    expect(DESKTOP_NAV_MIN_WIDTH).toBe(1280);
    expect(usesCompactAppNavigation(1182)).toBe(true);
    expect(usesCompactAppNavigation(1280)).toBe(false);
    expect(APP_NAV_CLASSES.menuButton).toContain("xl:hidden");
    expect(APP_NAV_CLASSES.desktopNav).toContain("xl:flex");
  });
});
