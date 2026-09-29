import { afterEach, describe, expect, it, vi } from "vitest";
import { returnFocusProp } from "./radix-compat";

afterEach(() => {
  document.body.innerHTML = "";
});

function setUp() {
  document.body.innerHTML = `
    <button id="next">Ends</button>
    <div id="popup"><button id="item">12pm</button></div>`;
  const byId = (id: string) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`no #${id}`);
    return el;
  };
  return {
    next: byId("next"),
    item: byId("item"),
    popup: { current: byId("popup") },
  };
}

describe("returnFocusProp", () => {
  it("hands focus back when it's still in the popup, or nowhere", () => {
    const { item, popup } = setUp();
    const quiet = vi.fn();
    item.focus();
    expect(returnFocusProp(undefined, popup, quiet)()).toBe(true);
    item.blur();
    expect(returnFocusProp(undefined, popup, quiet)()).toBe(true);
    expect(quiet).toHaveBeenCalledTimes(2);
  });

  it("leaves focus on what the person moved on to while the popup closed", () => {
    // A select's list fades out after a pick; a press on the next field
    // meanwhile has focused it, and that focus must stay (e2e/plan-tabs).
    const { next, popup } = setUp();
    const onCloseAutoFocus = vi.fn();
    next.focus();
    expect(returnFocusProp(onCloseAutoFocus, popup)()).toBe(false);
    expect(onCloseAutoFocus).not.toHaveBeenCalled();
    expect(next).toHaveFocus();
  });

  it("lets onCloseAutoFocus put focus somewhere itself", () => {
    const { item, next, popup } = setUp();
    item.focus();
    const moved = returnFocusProp((event) => {
      event.preventDefault();
      next.focus();
    }, popup)();
    expect(moved).toBe(false);
    expect(next).toHaveFocus();
  });
});
