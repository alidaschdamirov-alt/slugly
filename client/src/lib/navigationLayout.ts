export const DESKTOP_NAV_MIN_WIDTH = 1280;

export function usesCompactAppNavigation(viewportWidth: number) {
  return viewportWidth < DESKTOP_NAV_MIN_WIDTH;
}

export const APP_NAV_CLASSES = {
  menuButton: "xl:hidden h-8 w-8",
  workspaceSwitcher: "ml-1 hidden border-l border-border pl-3.5 xl:block",
  desktopNav: "ml-1 hidden min-w-0 items-center gap-0.5 xl:flex",
} as const;
