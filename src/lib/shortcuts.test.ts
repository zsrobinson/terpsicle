import { describe, expect, it } from "vitest";
import { isTypingTarget, matches } from "./shortcuts";

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

describe("isTypingTarget", () => {
  it("is true for text fields", () => {
    expect(isTypingTarget(el("input"))).toBe(true);
    expect(isTypingTarget(el("input", { type: "search" }))).toBe(true);
    expect(isTypingTarget(el("textarea"))).toBe(true);
    expect(isTypingTarget(el("select"))).toBe(true);
    const editable = el("div");
    editable.contentEditable = "true";
    document.body.append(editable);
    expect(isTypingTarget(editable)).toBe(true);
    editable.remove();
  });

  it("is false for buttons, checkboxes and the page", () => {
    expect(isTypingTarget(el("button"))).toBe(false);
    expect(isTypingTarget(el("input", { type: "checkbox" }))).toBe(false);
    expect(isTypingTarget(document.body)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("matches", () => {
  const key = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init);

  it("matches plain keys only without modifiers", () => {
    expect(matches(key({ key: "3" }), { key: "3" })).toBe(true);
    expect(matches(key({ key: "3", ctrlKey: true }), { key: "3" })).toBe(false);
    expect(matches(key({ key: "3", altKey: true }), { key: "3" })).toBe(false);
  });

  it("tells undo from redo", () => {
    // Tests run off-Apple, so the mod key is Ctrl.
    const undo = { key: "z", mod: true, shift: false };
    const redo = { key: "z", mod: true, shift: true };
    const ctrlZ = key({ key: "z", ctrlKey: true });
    const ctrlShiftZ = key({ key: "Z", ctrlKey: true, shiftKey: true });
    expect(matches(ctrlZ, undo)).toBe(true);
    expect(matches(ctrlZ, redo)).toBe(false);
    expect(matches(ctrlShiftZ, redo)).toBe(true);
    expect(matches(ctrlShiftZ, undo)).toBe(false);
  });
});
