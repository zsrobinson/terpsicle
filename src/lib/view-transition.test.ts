import type { AnyRouter, ParsedLocation } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultViewTransition,
  historyFollower,
  settleViewTransitions,
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

  it("names the row that was pressed when a course is listed twice", async () => {
    document.body.innerHTML = `<a data-vt-course="CMSC351" id="a" href="#">CMSC351</a><a data-vt-course="CMSC351" id="b" href="#">CMSC351</a>`;
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
    document.querySelector<HTMLElement>("#b")?.click();
    navigate(at("/reviews", 5), at("/reviews/cmsc351", 6));
    expect(
      document.querySelector<HTMLElement>("#a")?.style.viewTransitionName,
    ).toBe("");
    expect(
      document.querySelector<HTMLElement>("#b")?.style.viewTransitionName,
    ).toBe("course");
    // A later transition starts clean, whatever the last one left named.
    navigate(at("/reviews/cmsc351", 6), at("/reviews", 7));
    expect(
      document.querySelector<HTMLElement>("#b")?.style.viewTransitionName,
    ).toBe("");
    await Promise.resolve();
    for (const t of started) t.finish();
  });

  it("forgets a render step when the router's next navigation has none", () => {
    document.body.innerHTML = `<a data-vt-course="CMSC351" href="#">CMSC351</a>`;
    const row = document.querySelector<HTMLElement>("[data-vt-course]");
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
    const router = {
      resolved: new Set<() => void>(),
      subscribe(_event: string, fn: () => void) {
        this.resolved.add(fn);
        return () => this.resolved.delete(fn);
      },
    };
    settleViewTransitions(router as unknown as AnyRouter);
    row?.click();
    navigate(at("/reviews", 8), at("/reviews/cmsc351", 9));
    // The next navigation has no transition (search params only)…
    navigate(at("/reviews/cmsc351", 9), at("/reviews/cmsc351", 9, { x: 1 }));
    document.body.innerHTML += `<h1 data-vt-course="CMSC351">CMSC351</h1>`;
    // …so its render doesn't name a second element.
    for (const fn of router.resolved) fn();
    expect(document.querySelector("h1")?.style.viewTransitionName).toBe("");
  });
});

describe("historyFollower", () => {
  interface Started {
    types: string[];
    update: () => Promise<void> | void;
    skipTransition: ReturnType<typeof vi.fn>;
    finish: () => void;
  }
  let started: Started[] = [];

  beforeEach(() => {
    started = [];
    vi.spyOn(CSS, "supports").mockReturnValue(true);
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: false,
    } as MediaQueryList);
    (
      document as unknown as { startViewTransition: unknown }
    ).startViewTransition = vi.fn(
      (arg: { update: () => Promise<void> | void; types: string[] }) => {
        let finish = () => {};
        const finished = new Promise<void>((resolve) => {
          finish = resolve;
        });
        // The browser calls `update` a frame later: tests call it by hand.
        const skipTransition = vi.fn(() => finish());
        started.push({ ...arg, skipTransition, finish });
        return {
          updateCallbackDone: Promise.resolve(),
          ready: Promise.resolve(),
          finished,
          skipTransition,
        };
      },
    );
  });
  afterEach(() => {
    delete (document as unknown as { startViewTransition?: unknown })
      .startViewTransition;
    vi.restoreAllMocks();
  });

  /** Just enough of the router: its history, and `onResolved`. */
  function fakeRouter(first: ParsedLocation) {
    let location = first;
    const moves = new Set<() => void>();
    const router = {
      history: {
        get location() {
          return location;
        },
        subscribe(fn: () => void) {
          moves.add(fn);
          return () => moves.delete(fn);
        },
      },
      parseLocation: (l: ParsedLocation) => l,
      subscribe: () => () => undefined,
    };
    return {
      router: router as unknown as AnyRouter,
      go(next: ParsedLocation) {
        location = next;
        for (const fn of [...moves]) fn();
      },
    };
  }

  const search = at("/schedule/search", 3);
  const course = (code: string, index = 4) =>
    at(`/schedule/course/${code}`, index, { tab: "search" });

  function follow(first: ParsedLocation) {
    const fake = fakeRouter(first);
    const follower = historyFollower(fake.router);
    const onChange = vi.fn();
    follower.subscribe(onChange);
    const path = () => follower.getSnapshot().pathname;
    return { ...fake, onChange, path };
  }

  it("shows a push inside its transition's update, not before", async () => {
    const view = follow(search);
    view.go(course("CMSC131"));
    expect(started.map((s) => s.types)).toEqual([["push"]]);
    // The old place is what gets captured first.
    expect(view.path()).toBe("/schedule/search");
    expect(view.onChange).not.toHaveBeenCalled();
    await started[0]?.update();
    expect(view.path()).toBe("/schedule/course/CMSC131");
    expect(view.onChange).toHaveBeenCalledTimes(1);
  });

  it("skips a push that Back undid before it showed", async () => {
    const view = follow(search);
    view.go(course("CMSC131"));
    view.go(search);
    expect(started[0]?.skipTransition).toHaveBeenCalled();
    // Nothing else starts: the view never left Search.
    expect(started).toHaveLength(1);
    await started[0]?.update();
    expect(view.path()).toBe("/schedule/search");
    expect(view.onChange).not.toHaveBeenCalled();
  });

  it("skips its waiting push when Safari animates a swipe Back", async () => {
    const view = follow(search);
    view.go(course("CMSC131"));
    const swipe = new PopStateEvent("popstate");
    Object.defineProperty(swipe, "hasUAVisualTransition", { value: true });
    window.dispatchEvent(swipe);
    view.go(search);
    expect(started[0]?.skipTransition).toHaveBeenCalled();
    expect(started).toHaveLength(1);
    await started[0]?.update();
    expect(view.path()).toBe("/schedule/search");
  });

  it("gives a waiting move up to a later one, which starts from where the view is", async () => {
    const view = follow(search);
    view.go(course("CMSC131"));
    view.go(course("CMSC132", 5));
    expect(started[0]?.skipTransition).toHaveBeenCalled();
    expect(started.map((s) => s.types)).toEqual([["push"], ["push"]]);
    // The skipped one's update renders nothing.
    await started[0]?.update();
    expect(view.path()).toBe("/schedule/search");
    await started[1]?.update();
    expect(view.path()).toBe("/schedule/course/CMSC132");
    expect(view.onChange).toHaveBeenCalledTimes(1);
  });

  it("holds its place when leaving for another product", () => {
    const view = follow(course("CMSC131"));
    view.go(at("/reviews", 5));
    expect(started).toHaveLength(0);
    expect(view.path()).toBe("/schedule/course/CMSC131");
    expect(view.onChange).not.toHaveBeenCalled();
  });

  it("follows a replace at once, without a transition", () => {
    const view = follow(at("/schedule", 2));
    view.go(at("/schedule/travel", 2));
    expect(started).toHaveLength(0);
    expect(view.path()).toBe("/schedule/travel");
    expect(view.onChange).toHaveBeenCalledTimes(1);
  });
});
