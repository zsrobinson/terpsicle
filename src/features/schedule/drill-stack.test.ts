import { describe, expect, it } from "vitest";
import { followStack, MOUNTED_DRILLS } from "./drill-stack";

const a = { kind: "course", courseCode: "CMSC351" } as const;
const b = { kind: "course", courseCode: "CMSC330" } as const;
const conn = { kind: "connection", connectionId: "M:a>b" } as const;

describe("followStack", () => {
  it("stacks views as they're opened, and Back returns to a mounted one", () => {
    let stack = followStack([], a, "push");
    stack = followStack(stack, conn, "push");
    stack = followStack(stack, b, "push");
    expect(stack).toEqual([a, conn, b]);
    expect(followStack(stack, conn, "back")).toEqual([a, conn]);
    expect(followStack(stack, a, "back")).toEqual([a]);
    expect(followStack(stack, null, "back")).toEqual([]);
  });

  it("Forward stacks the view again", () => {
    expect(followStack([a], b, "forward")).toEqual([a, b]);
  });

  it("after a reload nothing is mounted under a view: just that view", () => {
    expect(followStack([b], a, "back")).toEqual([a]);
  });

  it("a new tab or term starts over", () => {
    expect(followStack([a, b], conn, "reset")).toEqual([conn]);
    expect(followStack([a, b], null, "reset")).toEqual([]);
  });

  it("closing the top view by going to the one under it reuses that level", () => {
    const stack = [a, b];
    const closed = followStack(stack, a, "push");
    expect(closed).toEqual([a]);
    expect(closed[0]).toBe(stack[0]);
  });

  it("a replace swaps the top view", () => {
    expect(followStack([a, b], conn, "replace")).toEqual([a, conn]);
  });

  it("the same view keeps its level, taking a new details sub-tab", () => {
    const stack = [a];
    expect(followStack(stack, { ...a }, "push")).toBe(stack);
    expect(followStack(stack, { ...a, tab: "grades" }, "push")).toEqual([
      { ...a, tab: "grades" },
    ]);
  });

  it("keeps a bounded number of views mounted", () => {
    let stack: ReturnType<typeof followStack> = [];
    for (let i = 0; i < MOUNTED_DRILLS + 3; i++)
      stack = followStack(
        stack,
        { kind: "course", courseCode: `CMSC${100 + i}` },
        "push",
      );
    expect(stack).toHaveLength(MOUNTED_DRILLS);
    expect(stack.at(-1)).toEqual({
      kind: "course",
      courseCode: `CMSC${100 + MOUNTED_DRILLS + 2}`,
    });
  });
});
