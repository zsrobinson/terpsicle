import { describe, expect, it } from "vitest";
import { mainPlanFor } from "~/core/plans";
import { archivedFixtureTermId, fixtureTermId } from "~/fixtures";
import {
  activePlanId,
  EMPTY_WORKSPACE,
  plansInTerm,
  reduceWorkspace,
  type Workspace,
  type WorkspaceAction,
} from "./plan-ops";

// Core's reducer has its own tests; these cover what the workspace adds:
// the open plan per term, and never leaving a term without a plan.

const SPRING = fixtureTermId;
const SUMMER = archivedFixtureTermId;
const NOW = "2026-09-25T12:00:00.000Z";

function apply(w: Workspace, ...actions: WorkspaceAction[]): Workspace {
  return actions.reduce(reduceWorkspace, w);
}

const create = (id: string, termId = SPRING): WorkspaceAction => ({
  type: "plan/create",
  id,
  termId,
  now: NOW,
});

describe("reduceWorkspace", () => {
  it("creates plans per term and opens the new one", () => {
    const w = apply(
      EMPTY_WORKSPACE,
      create("planAAAA"),
      create("planBBBB"),
      create("summerAA", SUMMER),
    );
    expect(plansInTerm(w.plans, SPRING).map((p) => p.name)).toEqual([
      "Plan A",
      "Plan B",
    ]);
    expect(activePlanId(w, SPRING)).toBe("planBBBB");
    expect(activePlanId(w, SUMMER)).toBe("summerAA");
  });

  it("opens a duplicate, which sits right after its source", () => {
    const w = apply(EMPTY_WORKSPACE, create("planAAAA"), create("planBBBB"), {
      type: "plan/duplicate",
      planId: "planAAAA",
      id: "copyAAAA",
      now: NOW,
    });
    expect(plansInTerm(w.plans, SPRING).map((p) => p.name)).toEqual([
      "Plan A",
      "Copy of Plan A",
      "Plan B",
    ]);
    expect(activePlanId(w, SPRING)).toBe("copyAAAA");
  });

  it("deleting the open plan opens its left neighbor", () => {
    const w = apply(
      EMPTY_WORKSPACE,
      create("planAAAA"),
      create("planBBBB"),
      create("planCCCC"),
      {
        type: "plan/delete",
        planId: "planCCCC",
        replacementId: "unusedID",
        now: NOW,
      },
    );
    expect(activePlanId(w, SPRING)).toBe("planBBBB");
    expect(w.plans.map((p) => p.id)).toEqual(["planAAAA", "planBBBB"]);
  });

  it("deleting a term's last plan leaves a fresh empty one", () => {
    const w = apply(EMPTY_WORKSPACE, create("planAAAA"), {
      type: "plan/delete",
      planId: "planAAAA",
      replacementId: "freshAAA",
      now: NOW,
    });
    expect(plansInTerm(w.plans, SPRING)).toMatchObject([
      { id: "freshAAA", name: "Plan A", courses: [] },
    ]);
    expect(activePlanId(w, SPRING)).toBe("freshAAA");
  });

  it("falls back to the first tab when the remembered plan is gone", () => {
    const w = apply(EMPTY_WORKSPACE, create("planAAAA"), create("planBBBB"));
    expect(
      activePlanId(
        { ...w, activePlanByTerm: { [SPRING]: "missing1" } },
        SPRING,
      ),
    ).toBe("planAAAA");
  });

  it("returns the same workspace for changes that change nothing", () => {
    const w = apply(EMPTY_WORKSPACE, create("planAAAA"));
    for (const action of [
      { type: "plan/activate", termId: SUMMER, planId: "planAAAA" },
      {
        type: "plan/delete",
        planId: "missing1",
        replacementId: "unusedID",
        now: NOW,
      },
      { type: "plan/rename", planId: "planAAAA", name: "  ", now: NOW },
    ] satisfies WorkspaceAction[])
      expect(reduceWorkspace(w, action)).toBe(w);
  });

  it("keeps the open plans through core actions", () => {
    const w = apply(EMPTY_WORKSPACE, create("planAAAA"), {
      type: "color/set",
      courseCode: "CMSC351",
      color: "teal",
    });
    expect(w.colors).toEqual({ CMSC351: "teal" });
    expect(activePlanId(w, SPRING)).toBe("planAAAA");
  });
});

describe("main plans in the workspace", () => {
  const three = apply(
    EMPTY_WORKSPACE,
    create("planAAAA"),
    create("planBBBB"),
    create("planCCCC"),
  );
  const mainId = (w: Workspace) =>
    mainPlanFor(SPRING, w.plans, w.mainPlans)?.id;
  const remove = (planId: string): WorkspaceAction => ({
    type: "plan/delete",
    planId,
    replacementId: "freshAAA",
    now: NOW,
  });

  it("starts with the first plan as main, and makes another main", () => {
    expect(mainId(three)).toBe("planAAAA");
    const w = apply(three, { type: "plan/make-main", planId: "planBBBB" });
    expect(w.mainPlans).toEqual({ [SPRING]: "planBBBB" });
    // Already main: nothing changes, so nothing to undo.
    expect(apply(w, { type: "plan/make-main", planId: "planBBBB" })).toBe(w);
  });

  it("passes main to the next tab when the main plan is deleted", () => {
    const w = apply(three, { type: "plan/make-main", planId: "planBBBB" });
    expect(mainId(apply(w, remove("planBBBB")))).toBe("planCCCC");
    expect(mainId(apply(three, remove("planAAAA")))).toBe("planBBBB");
    // A draft going leaves main alone.
    expect(apply(w, remove("planCCCC")).mainPlans).toBe(w.mainPlans);
  });

  it("gives a term's fresh plan main when its last plan goes", () => {
    const one = apply(EMPTY_WORKSPACE, create("planAAAA"), {
      type: "plan/make-main",
      planId: "planAAAA",
    });
    const w = apply(one, remove("planAAAA"));
    expect(mainId(w)).toBe("freshAAA");
  });

  it("keeps main where it is when tabs move", () => {
    const w = apply(three, {
      type: "plan/move",
      planId: "planCCCC",
      toIndex: 0,
    });
    expect(plansInTerm(w.plans, SPRING)[0]?.id).toBe("planCCCC");
    expect(mainId(w)).toBe("planAAAA");
  });

  it("keeps main plans through core actions", () => {
    const w = apply(three, { type: "plan/make-main", planId: "planCCCC" });
    const renamed = apply(w, {
      type: "plan/rename",
      planId: "planAAAA",
      name: "Mine",
      now: NOW,
    });
    expect(renamed.mainPlans).toBe(w.mainPlans);
  });
});
