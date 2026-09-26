import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "~/ui/tooltip";
import { HEADLINE, Hero } from "./hero";
import { railPath, SEGMENTS, tanglePath } from "./tangle";

const CSS =
  Object.values(
    import.meta.glob<string>("./marketing.css", {
      query: "?raw",
      import: "default",
      eager: true,
    }),
  )[0] ?? "";

// Plain links throughout (the page stays off the router's Link), so no
// router is needed here.
async function renderHero(ui: ReactNode) {
  render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);
  await screen.findByRole("heading", { level: 1 });
}

const COLOR_ORDER = ["schedule", "reviews", "chat", "plan", "todo"];

describe("the hero", () => {
  it("says the headline once to a screen reader, though it's printed twice", async () => {
    await renderHero(<Hero />);
    expect(
      screen.getByRole("heading", { level: 1, name: HEADLINE }),
    ).toBeInTheDocument();
    // The misprint's second impression is hidden from assistive tech.
    expect(screen.getAllByText(HEADLINE)).toHaveLength(2);
    expect(
      screen
        .getAllByText(HEADLINE)
        .filter((el) => el.closest("[aria-hidden='true']")),
    ).toHaveLength(1);
  });

  it("opens the scheduler, and signs in with a plain link to /signin", async () => {
    await renderHero(<Hero />);
    expect(
      screen.getByRole("link", { name: "Open the scheduler" }),
    ).toHaveAttribute("href", "/schedule");
    expect(
      screen.getByRole("link", { name: "Sign in with Google" }),
    ).toHaveAttribute("href", "/signin");
  });

  it("draws five lines in color order, each as segments, a rail, a misprint and a ghost", async () => {
    await renderHero(<Hero />);
    for (const layout of ["wide", "tall"] as const) {
      const drawing = document.querySelector(`[data-layout="${layout}"]`);
      if (!drawing) throw new Error(`No ${layout} drawing`);
      const rails = [...drawing.querySelectorAll("[data-rail]")];
      expect(rails.map((r) => r.getAttribute("data-rail"))).toEqual(
        COLOR_ORDER,
      );
      rails.forEach((r, i) => {
        expect(r.getAttribute("d")).toBe(railPath(layout, i));
      });
      const ghosts = [...drawing.querySelectorAll(".mk-ghost")];
      expect(ghosts.map((g) => g.getAttribute("d"))).toEqual(
        COLOR_ORDER.map((_, i) => tanglePath(layout, i)),
      );
      expect(drawing.querySelectorAll(".mk-seg")).toHaveLength(
        SEGMENTS * COLOR_ORDER.length,
      );
      // Each segment's start and end poses are set, for the CSS to move.
      const seg = drawing.querySelector<SVGElement>(".mk-seg");
      expect(seg?.style.getPropertyValue("--from")).toMatch(/^translate\(/);
      expect(seg?.style.getPropertyValue("--to")).toMatch(/^translate\(/);
      // The ends link to each product's block, in the same order.
      const ends = [...drawing.querySelectorAll("a[href^='#']")];
      expect(ends.map((a) => a.getAttribute("href"))).toEqual(
        COLOR_ORDER.map((p) => `#${p}`),
      );
    }
  });

  it("replays by drawing the tangle afresh", async () => {
    const user = userEvent.setup();
    await renderHero(<Hero />);
    const before = document.querySelector("[data-tangle]");
    await user.click(screen.getByRole("button", { name: "Replay" }));
    const after = document.querySelector("[data-tangle]");
    expect(after).not.toBeNull();
    expect(after).not.toBe(before);
  });
});

/** A comma-separated CSS value's parts, ignoring commas inside `var(…)`. */
function topLevelList(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += ch;
  }
  parts.push(current.trim());
  return parts;
}

/** The CSS inside each `@media (…) { … }` with this condition. */
function mediaBlocks(css: string, condition: string): string[] {
  const out: string[] = [];
  const opener = `@media (${condition})`;
  let at = css.indexOf(opener);
  while (at !== -1) {
    let i = css.indexOf("{", at) + 1;
    const start = i;
    let depth = 1;
    while (depth > 0 && i < css.length) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      i++;
    }
    out.push(css.slice(start, i - 1));
    at = css.indexOf(opener, i);
  }
  return out;
}

describe("the motion (marketing.css)", () => {
  const text = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

  it("is read from the stylesheet", () => {
    expect(text).toContain("@keyframes mk-seg-move");
  });

  it("only ever runs for people who haven't asked for reduced motion", () => {
    const motionOk = mediaBlocks(text, "prefers-reduced-motion: no-preference");
    const everywhere = (text.match(/\b(?:animation|transition)\s*:/g) ?? [])
      .length;
    const allowed = motionOk
      .join("\n")
      .match(/\b(?:animation|transition)\s*:/g)?.length;
    expect(everywhere).toBeGreaterThan(0);
    expect(allowed).toBe(everywhere);
  });

  it("shows the tangle as a ghost under reduced motion", () => {
    const reduce = mediaBlocks(text, "prefers-reduced-motion: reduce").join("");
    expect(reduce).toMatch(/\.mk-ghost\s*\{\s*display:\s*inline/);
    // Without motion, segments are hidden and the rails are drawn straight.
    expect(text).toMatch(/\.mk-seg\s*\{[^}]*opacity:\s*0/);
    expect(text).not.toMatch(/\.mk-rail\s*\{[^}]*opacity:\s*0/);
  });

  it("animates transform and opacity only", () => {
    const frames = [
      ...text.matchAll(/@keyframes\s+[\w-]+\s*\{([\s\S]*?\}\s*)\}/g),
    ];
    expect(frames.length).toBeGreaterThan(5);
    for (const [, body] of frames) {
      const props = [...(body ?? "").matchAll(/([\w-]+)\s*:/g)].map(
        (m) => m[1],
      );
      for (const p of props) expect(["transform", "opacity"]).toContain(p);
    }
    for (const [, value] of text.matchAll(/\btransition\s*:([^;]+);/g)) {
      for (const part of topLevelList(value ?? ""))
        expect(["transform", "opacity"]).toContain(part.split(/\s+/)[0]);
    }
  });
});
