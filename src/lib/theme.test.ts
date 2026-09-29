import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyThemePreference, syncThemeColor } from "./theme";

// The browser's toolbar and an installed iPhone app's status bar follow the
// picked theme: its `theme-color` tag matches everywhere, the other nowhere.

function media() {
  return Object.fromEntries(
    [
      ...document.head.querySelectorAll<HTMLMetaElement>(
        'meta[name="theme-color"]',
      ),
    ].map((meta) => [
      meta.getAttribute("data-scheme"),
      meta.getAttribute("media"),
    ]),
  );
}

const SYSTEM = {
  light: "(prefers-color-scheme: light)",
  dark: "(prefers-color-scheme: dark)",
};

describe("the theme color", () => {
  beforeEach(() => {
    document.head.innerHTML = `
      <meta name="theme-color" content="#fffcf0" media="${SYSTEM.light}" data-scheme="light">
      <meta name="theme-color" content="#100f0f" media="${SYSTEM.dark}" data-scheme="dark">`;
  });

  afterEach(() => {
    document.head.innerHTML = "";
    document.documentElement.classList.remove("dark");
    localStorage.clear();
  });

  it("matches only the picked theme's tag", () => {
    syncThemeColor("dark");
    expect(media()).toEqual({ light: "not all", dark: "all" });
    syncThemeColor("light");
    expect(media()).toEqual({ light: "all", dark: "not all" });
  });

  it("follows the system again on System", () => {
    syncThemeColor("system");
    expect(media()).toEqual(SYSTEM);
    syncThemeColor("dark");
    syncThemeColor("system");
    expect(media()).toEqual(SYSTEM);
  });

  it("follows a theme picked in the app", () => {
    applyThemePreference("dark");
    expect(media()).toEqual({ light: "not all", dark: "all" });
    expect(document.documentElement).toHaveClass("dark");
    applyThemePreference("system");
    expect(media()).toEqual(SYSTEM);
  });
});
