import type { ParsedLocation } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultViewTransition,
  supportsTypedViewTransitions,
  viewTransitionTypes,
} from "./view-transition";

// The browser's side of the router's view transitions: typed ones only,
// the type on <html> while one runs, and a course row sharing its name with
// the header it opens. The type rules themselves are
// ~/core/routing/view-transition's.

const at = (
  pathname: string,
  index: number,
  search: Record<string, unknown> = {},
): ParsedLocation =>
  ({
    pathname,
    search,
    href: pathname,
    state: { __TSR_index: index, __TSR_key: `${pathname}#${index}` },
  }) as unknown as ParsedLocation;

interface FakeTransition {
  update: () => unknown;
  types: string[];
  finish: () => void;
}

describe("without transition types", () => {
  it("leaves navigations alone", () => {
    expect(supportsTypedViewTransitions()).toBe(false);
    expect(defaultViewTransition()).toBe(false);
  });
});

describe("with transition types", () => {
  let started: FakeTransition[] = [];
  beforeEach(() => {
    started = [];
    vi.spyOn(CSS, "supports").mockReturnValue(true);
    (
      document as unknown as { startViewTransition: unknown }
    ).startViewTransition = vi.fn(
      (arg: { update: () => unknown; types: string[] }) => {
        let finish = () => {};
        const finished = new Promise<void>((resolve) => {
          finish = resolve;
        });
        started.push({ ...arg, finish });
        return {
          updateCallbackDone: Promise.resolve(),
          ready: Promise.resolve(),
          finished,
          skipTransition() {},
        };
      },
    );
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: false,
    } as MediaQueryList);
  });
  afterEach(() => {
    delete (document as unknown as { startViewTransition?: unknown })
      .startViewTransition;
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  /** What the router does with `types`: calls it, then starts the transition. */
  function navigate(from: ParsedLocation, to: ParsedLocation) {
    const types = viewTransitionTypes({ fromLocation: from, toLocation: to });
    if (types === false) return false;
    document.startViewTransition({ update: () => undefined, types });
    return types;
  }

  it("gives the router a types function", () => {
    const options = defaultViewTransition();
    expect(options && typeof options.types).toBe("function");
  });

  it("names the type on <html> while the transition runs", async () => {
    expect(navigate(at("/reviews", 1), at("/reviews/cmsc351", 2))).toEqual([
      "push",
    ]);
    expect(document.documentElement.dataset.vtType).toBe("push");
    await Promise.resolve();
    started.at(-1)?.finish();
    await vi.waitFor(() =>
      expect(document.documentElement.dataset.vtType).toBeUndefined(),
    );
  });

  it("starts nothing for search params on one screen", () => {
    expect(
      navigate(at("/reviews", 1), at("/reviews", 1, { q: "kruskal" })),
    ).toBe(false);
    expect(started).toHaveLength(0);
  });

  it("shares a name between the pressed row and the header, one at a time", async () => {
    document.body.innerHTML = `<a data-vt-course="CMSC351" href="#">CMSC351</a>`;
    const row = document.querySelector<HTMLElement>("[data-vt-course]");
    // happy-dom lays nothing out: give the row a box on screen.
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 100,
      top: 100,
      bottom: 140,
      left: 0,
      right: 300,
      width: 300,
      height: 40,
      toJSON: () => ({}),
    });
    row?.click();
    navigate(at("/reviews", 3), at("/reviews/cmsc351", 4));
    expect(row?.style.viewTransitionName).toBe("course");
    await Promise.resolve();
    started.at(-1)?.finish();
    await vi.waitFor(() => expect(row?.style.viewTransitionName).toBe(""));
  });
});
