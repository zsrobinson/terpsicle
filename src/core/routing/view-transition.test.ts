import { describe, expect, it } from "vitest";
import {
  type NavigationPlace,
  screenOf,
  viewTransitionType,
} from "./view-transition";

const at = (
  pathname: string,
  index: number,
  search: Record<string, unknown> = {},
): NavigationPlace => ({ pathname, search, index });

const type = (
  from: NavigationPlace | undefined,
  to: NavigationPlace,
  options: { reduceMotion?: boolean; uaAnimated?: boolean } = {},
) =>
  viewTransitionType({
    from,
    to,
    reduceMotion: options.reduceMotion ?? false,
    uaAnimated: options.uaAnimated ?? false,
  });

describe("screenOf", () => {
  it("puts rail tabs at the top of their product", () => {
    expect(screenOf("/schedule/search", {})).toMatchObject({
      product: "schedule",
      depth: 0,
    });
    expect(screenOf("/schedule", {}).depth).toBe(0);
    expect(screenOf("/plan/problems", {}).depth).toBe(0);
    expect(screenOf("/admin/feedback", {}).depth).toBe(0);
  });

  it("puts drill-ins and pages under a product one deeper", () => {
    expect(screenOf("/schedule/course/CMSC351", {})).toMatchObject({
      product: "schedule",
      depth: 1,
      base: "/schedule/courses",
    });
    expect(screenOf("/schedule/course/CMSC351", { tab: "search" }).base).toBe(
      "/schedule/search",
    );
    expect(screenOf("/reviews/cmsc351", {})).toMatchObject({
      product: "reviews",
      depth: 1,
      base: "/reviews",
    });
    expect(screenOf("/settings/notifications", {}).depth).toBe(1);
  });

  it("reads Chat's room and thread from its search params", () => {
    expect(screenOf("/chat", {}).depth).toBe(0);
    expect(screenOf("/chat/", { room: "202701:CMSC351" }).depth).toBe(1);
    expect(
      screenOf("/chat", { room: "202701:CMSC351", thread: "m1" }).depth,
    ).toBe(2);
  });

  it("ignores a trailing slash", () => {
    expect(screenOf("/chat/", {}).key).toBe(screenOf("/chat", {}).key);
  });
});

describe("viewTransitionType", () => {
  it("doesn't animate the first render", () => {
    expect(type(undefined, at("/schedule", 0))).toBeNull();
  });

  it("doesn't animate search params that stay on one screen", () => {
    expect(
      type(at("/schedule/search", 3), at("/schedule/search", 3, { q: "cm" })),
    ).toBeNull();
    // A drill-in's sub-tab is the same screen.
    expect(
      type(
        at("/schedule/course/CMSC351", 4),
        at("/schedule/course/CMSC351", 4, { tab: "search" }),
      ),
    ).toBeNull();
    expect(
      type(at("/reviews", 1), at("/reviews", 1, { q: "kruskal" })),
    ).toBeNull();
  });

  it("pushes a drill-in and pops back out", () => {
    expect(
      type(at("/schedule/search", 3), at("/schedule/course/CMSC351", 4)),
    ).toBe("push");
    expect(
      type(at("/schedule/course/CMSC351", 4), at("/schedule/search", 3)),
    ).toBe("pop");
    expect(type(at("/reviews", 1), at("/reviews/cmsc351", 2))).toBe("push");
    expect(type(at("/reviews/cmsc351", 2), at("/reviews", 1))).toBe("pop");
  });

  it("pushes a drill-in over another, and Back pops it by the history index", () => {
    expect(
      type(
        at("/schedule/course/CMSC351", 4),
        at("/schedule/course/CMSC330", 5),
      ),
    ).toBe("push");
    expect(
      type(
        at("/schedule/course/CMSC330", 5),
        at("/schedule/course/CMSC351", 4),
      ),
    ).toBe("pop");
  });

  it("pops a link back up to the place a drill-in is over", () => {
    // Chat's "Your classes" and Esc are new entries that go up a level.
    expect(
      type(at("/chat", 7, { room: "202701:CMSC351" }), at("/chat", 8, {})),
    ).toBe("pop");
    expect(
      type(
        at("/schedule/course/CMSC351", 4, { tab: "search" }),
        at("/schedule/search", 5),
      ),
    ).toBe("pop");
  });

  it("cross-fades a rail tab picked from inside another tab's drill-in", () => {
    expect(
      type(
        at("/schedule/course/CMSC351", 4, { tab: "search" }),
        at("/schedule/blocks", 5),
      ),
    ).toBe("tab");
  });

  it("opens and closes a Chat room with push and pop", () => {
    expect(type(at("/chat", 1), at("/chat", 2, { room: "202701:X" }))).toBe(
      "push",
    );
    expect(type(at("/chat", 2, { room: "202701:X" }), at("/chat", 1))).toBe(
      "pop",
    );
    expect(
      type(
        at("/chat", 2, { room: "202701:X" }),
        at("/chat", 3, { room: "202701:X", thread: "m1" }),
      ),
    ).toBe("push");
  });

  it("cross-fades between products and between rail tabs", () => {
    expect(type(at("/schedule/search", 3), at("/reviews", 4))).toBe("tab");
    expect(type(at("/reviews/cmsc351", 4), at("/schedule/courses", 5))).toBe(
      "tab",
    );
    // Back to another product is still a product switch.
    expect(type(at("/reviews", 4), at("/schedule/search", 3))).toBe("tab");
    expect(type(at("/schedule/search", 3), at("/schedule/courses", 4))).toBe(
      "tab",
    );
    expect(type(at("/plan", 1), at("/plan/problems", 2))).toBe("tab");
    expect(type(at("/home", 0), at("/todo", 1))).toBe("tab");
  });

  it("doesn't animate a replace, where the app corrects its place", () => {
    // `/schedule` restoring the saved view, or a result gone after a reload.
    expect(type(at("/schedule", 2), at("/schedule/travel", 2))).toBeNull();
    expect(
      type(at("/schedule/result/r1", 3), at("/schedule/generate", 3)),
    ).toBeNull();
  });

  it("stays still when the browser already animated Back", () => {
    expect(
      type(at("/schedule/course/CMSC351", 4), at("/schedule/search", 3), {
        uaAnimated: true,
      }),
    ).toBeNull();
  });

  it("moves nothing under Reduce Motion", () => {
    const reduced = { reduceMotion: true };
    expect(
      type(
        at("/schedule/search", 3),
        at("/schedule/course/CMSC351", 4),
        reduced,
      ),
    ).toBe("none");
    expect(type(at("/reviews", 4), at("/schedule", 3), reduced)).toBe("none");
    // …and still nothing at all for search params.
    expect(
      type(at("/reviews", 1), at("/reviews", 1, { q: "k" }), reduced),
    ).toBeNull();
  });
});
