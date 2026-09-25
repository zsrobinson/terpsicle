import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_UI_STATE, useUi } from "~/state/ui-store";
import { TooltipProvider } from "~/ui/tooltip";
import { SidebarResizeHandle, sidebarWidthForKey } from "./sidebar-resize";
import {
  COMPACT_SIDEBAR_QUERY,
  SIDEBAR_WIDTH_STORAGE_KEY,
  shownSidebarWidth,
} from "./sidebar-width";

// The sidebar's draggable edge (owner decision 3): 320–480px, by pointer or
// keyboard, saved once per drag, and mirrored for the next first paint.

function renderHandle() {
  render(
    <TooltipProvider>
      <aside id="sidebar">
        <SidebarResizeHandle controls="sidebar" />
      </aside>
    </TooltipProvider>,
  );
  return screen.getByRole("separator", { name: "Sidebar width" });
}

const cssWidth = () =>
  document.documentElement.style.getPropertyValue("--sidebar-width");

beforeEach(() => {
  useUi.setState(INITIAL_UI_STATE);
  window.localStorage.clear();
  document.documentElement.style.removeProperty("--sidebar-width");
  // jsdom has no pointer capture.
  HTMLElement.prototype.setPointerCapture = () => {};
});

describe("sidebarWidthForKey", () => {
  it("steps by 16px, jumps with Home and End, and ignores other keys", () => {
    expect(sidebarWidthForKey(360, "ArrowRight")).toBe(376);
    expect(sidebarWidthForKey(360, "ArrowLeft")).toBe(344);
    expect(sidebarWidthForKey(470, "ArrowRight")).toBe(480);
    expect(sidebarWidthForKey(360, "Home")).toBe(320);
    expect(sidebarWidthForKey(360, "End")).toBe(480);
    expect(sidebarWidthForKey(360, "ArrowUp")).toBeNull();
  });
});

describe("SidebarResizeHandle", () => {
  it("is a focusable vertical separator with its range", () => {
    const handle = renderHandle();
    expect(handle).toHaveAttribute("aria-orientation", "vertical");
    expect(handle).toHaveAttribute("aria-controls", "sidebar");
    expect(handle).toHaveAttribute("aria-valuemin", "320");
    expect(handle).toHaveAttribute("aria-valuemax", "480");
    expect(handle).toHaveAttribute("aria-valuenow", "360");
    expect(handle).toHaveAttribute("tabindex", "0");
    expect(cssWidth()).toBe("360px");
  });

  it("resizes from the keyboard, and remembers it for the next paint", async () => {
    const handle = renderHandle();
    const user = userEvent.setup();
    handle.focus();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(useUi.getState().sidebarWidth).toBe(392);
    expect(cssWidth()).toBe("392px");
    expect(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBe("392");
    await user.keyboard("{End}");
    expect(handle).toHaveAttribute("aria-valuenow", "480");
    await user.keyboard("{Home}");
    expect(useUi.getState().sidebarWidth).toBe(320);
  });

  it("follows a drag, clamped, and saves once on release", async () => {
    const handle = renderHandle();
    fireEvent.pointerDown(handle, { button: 0, clientX: 400, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 450, pointerId: 1 });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(cssWidth()).toBe("410px");
    // Not saved mid-drag: IndexedDB would get a write per frame.
    expect(useUi.getState().sidebarWidth).toBe(360);
    fireEvent.pointerMove(handle, { clientX: 900, pointerId: 1 });
    fireEvent.pointerUp(handle, { pointerId: 1 });
    expect(useUi.getState().sidebarWidth).toBe(480);
    expect(cssWidth()).toBe("480px");
    expect(document.documentElement.style.cursor).toBe("");
  });

  it("goes back to the default on double-click", async () => {
    useUi.getState().setSidebarWidth(440);
    const handle = renderHandle();
    await userEvent.setup().dblClick(handle);
    expect(useUi.getState().sidebarWidth).toBe(360);
    expect(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBeNull();
  });

  describe("on a tablet", () => {
    beforeEach(() => {
      vi.spyOn(window, "matchMedia").mockImplementation(
        (query) =>
          ({
            matches: query === COMPACT_SIDEBAR_QUERY,
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {},
          }) as unknown as MediaQueryList,
      );
    });
    afterEach(() => vi.restoreAllMocks());

    it("draws the default at the minimum, so the calendar keeps its room", async () => {
      // An 820px iPad: 360px left the calendar about 400px.
      const handle = renderHandle();
      expect(cssWidth()).toBe("320px");
      expect(handle).toHaveAttribute("aria-valuenow", "320");
      // Nothing saved: a desktop visit still gets 360.
      expect(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)).toBeNull();
      // Keys step from what's on screen.
      handle.focus();
      await userEvent.setup().keyboard("{ArrowRight}");
      expect(useUi.getState().sidebarWidth).toBe(336);
    });

    it("keeps a width the user chose", () => {
      useUi.getState().setSidebarWidth(400);
      renderHandle();
      expect(cssWidth()).toBe("400px");
    });
  });
});

describe("shownSidebarWidth", () => {
  it("swaps only the default, only when compact", () => {
    expect(shownSidebarWidth(360, true)).toBe(320);
    expect(shownSidebarWidth(360, false)).toBe(360);
    expect(shownSidebarWidth(400, true)).toBe(400);
  });
});
