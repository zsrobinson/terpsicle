import { afterEach, describe, expect, it } from "vitest";
import { describeElement, stableSelector, visibleText } from "./element";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("stableSelector", () => {
  it("anchors on the nearest unique data attribute", () => {
    document.body.innerHTML = `
      <main>
        <div data-queue-item="abc"><p>One</p><p><span>Two</span></p></div>
        <div data-queue-item="def"><p>Three</p></div>
      </main>`;
    const span = document.querySelector("span");
    if (!span) throw new Error("no span");
    const selector = stableSelector(span);
    expect(selector).toBe(
      'div[data-queue-item="abc"] > p:nth-of-type(2) > span',
    );
    expect(document.querySelector(selector)).toBe(span);
  });

  it("uses a real id, never a generated one", () => {
    document.body.innerHTML = `
      <section id="main"><button id="radix-:r1:">Go</button></section>`;
    const button = document.querySelector("button");
    if (!button) throw new Error("no button");
    expect(stableSelector(button)).toBe("#main > button");
  });

  it("uses an aria-label when it's unique", () => {
    document.body.innerHTML = `<nav><button aria-label="Open Problems">!</button><button>x</button></nav>`;
    const button = document.querySelector("button");
    if (!button) throw new Error("no button");
    expect(stableSelector(button)).toBe('button[aria-label="Open Problems"]');
  });
});

describe("visibleText", () => {
  it("leaves out private text", () => {
    document.body.innerHTML = `
      <div id="row">Work <span data-private>Secret label</span> 9:00</div>`;
    const row = document.getElementById("row");
    if (!row) throw new Error("no row");
    expect(visibleText(row)).toBe("Work 9:00");
    const label = row.querySelector("span");
    if (!label) throw new Error("no label");
    expect(visibleText(label)).toBe("");
  });

  it("cuts long text to 200 characters", () => {
    document.body.innerHTML = `<p>${"word ".repeat(100)}</p>`;
    const p = document.querySelector("p");
    if (!p) throw new Error("no p");
    expect(visibleText(p)).toHaveLength(200);
  });
});

describe("describeElement", () => {
  it("keeps its own and its nearest ancestor's ids, without plumbing", () => {
    document.body.innerHTML = `
      <div data-course="CMSC131" data-state="open">
        <button data-section="0101" data-slot="button">0101</button>
      </div>`;
    const button = document.querySelector("button");
    if (!button) throw new Error("no button");
    expect(describeElement(button)).toMatchObject({
      text: "0101",
      ids: { "data-section": "0101", "data-course": "CMSC131" },
    });
  });
});
