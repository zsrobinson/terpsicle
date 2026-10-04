import { afterEach, describe, expect, it, vi } from "vitest";
import { focusBackQuietly, focusQuietly } from "./popup-focus";

const quiet = vi.hoisted(() => vi.fn());
vi.mock("./tooltip", () => ({ quietTooltips: quiet }));

afterEach(() => {
  document.body.innerHTML = "";
  quiet.mockClear();
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

describe("focusQuietly", () => {
  it("quiets tooltips, then answers as Base UI would for the target", () => {
    setUp();
    expect(focusQuietly(undefined)("mouse")).toBe(true);
    expect(focusQuietly(false)("mouse")).toBe(false);
    expect(focusQuietly((type) => type === "touch")("touch")).toBe(true);
    expect(focusQuietly({ current: null })("mouse")).toBeNull();
    expect(quiet).toHaveBeenCalledTimes(4);
  });

  it("focuses an element it's given right away, rather than a frame later", () => {
    const { next, item } = setUp();
    expect(focusQuietly({ current: next })("keyboard")).toBe(false);
    expect(next).toHaveFocus();
    expect(focusQuietly(() => item)("mouse")).toBe(false);
    expect(item).toHaveFocus();
  });
});

describe("focusBackQuietly", () => {
  it("hands focus back when it's still in the popup, or nowhere", () => {
    const { item, popup } = setUp();
    item.focus();
    expect(focusBackQuietly(undefined, popup)("mouse")).toBe(true);
    item.blur();
    expect(focusBackQuietly(undefined, popup)("mouse")).toBe(true);
    expect(quiet).toHaveBeenCalledTimes(2);
  });

  it("leaves focus on what the person moved on to while the popup closed", () => {
    // A select's list fades out after a pick; a press on the next field
    // meanwhile has focused it, and that focus must stay (e2e/plan-tabs).
    const { next, popup } = setUp();
    const target = vi.fn(() => true);
    next.focus();
    expect(focusBackQuietly(target, popup)("mouse")).toBe(false);
    expect(target).not.toHaveBeenCalled();
    expect(next).toHaveFocus();
    expect(quiet).toHaveBeenCalledTimes(1);
  });

  it("sends focus where the caller's target says", () => {
    const { item, next, popup } = setUp();
    item.focus();
    expect(focusBackQuietly(() => false, popup)("keyboard")).toBe(false);
    expect(item).toHaveFocus();
    expect(focusBackQuietly({ current: next }, popup)("keyboard")).toBe(false);
    expect(next).toHaveFocus();
  });
});
