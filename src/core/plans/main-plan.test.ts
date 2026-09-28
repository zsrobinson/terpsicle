import { describe, expect, it } from "vitest";
import { aPlan, fixtureTermId } from "~/fixtures";
import {
  hasDrafts,
  isMainPlan,
  mainPlanFor,
  mainPlansAfterDelete,
  mainPlansBeforeMove,
  tabsInTerm,
  withMainPlan,
} from "./main-plan";

const TERM = fixtureTermId;
const OTHER_TERM = "202608";

const planA = aPlan({ id: "plan_a_000001", order: 0 });
const planB = aPlan({ id: "plan_b_000001", name: "Plan B", order: 1 });
const planC = aPlan({ id: "plan_c_000001", name: "Plan C", order: 2 });
const fallPlan = aPlan({ id: "plan_fall_0001", termId: OTHER_TERM, order: -5 });

describe("mainPlanFor", () => {
  it("takes the term's choice", () => {
    const plans = [planA, planB, fallPlan];
    expect(mainPlanFor(TERM, plans, { [TERM]: planB.id })).toBe(planB);
  });

  it("is the first tab without a choice: the first plan of a term is main", () => {
    expect(mainPlanFor(TERM, [planB, planA, fallPlan], {})).toBe(planA);
    // A choice that's gone (deleted), or from another term, doesn't count.
    expect(mainPlanFor(TERM, [planB, planA], { [TERM]: "plan_gone_001" })).toBe(
      planA,
    );
    expect(mainPlanFor(TERM, [planA, planB], { [TERM]: fallPlan.id })).toBe(
      planA,
    );
  });

  it("breaks tab-order ties by age, then id", () => {
    const older = aPlan({
      id: "plan_z_000001",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const newer = aPlan({ id: "plan_a_000009" });
    expect(mainPlanFor(TERM, [newer, older], {})).toBe(older);
    const twin = aPlan({ id: "plan_0_000001" });
    expect(mainPlanFor(TERM, [newer, twin], {})).toBe(twin);
  });

  it("is null without a plan in the term", () => {
    expect(mainPlanFor(TERM, [fallPlan], {})).toBeNull();
  });

  it("says whether a plan is main", () => {
    const plans = [planA, planB];
    expect(isMainPlan(planA, plans, {})).toBe(true);
    expect(isMainPlan(planB, plans, {})).toBe(false);
    expect(isMainPlan(planB, plans, { [TERM]: planB.id })).toBe(true);
  });
});

describe("hasDrafts", () => {
  it("is true only with two or more plans in the term", () => {
    expect(hasDrafts([planA, fallPlan], TERM)).toBe(false);
    expect(hasDrafts([planA, planB], TERM)).toBe(true);
    expect(hasDrafts([], TERM)).toBe(false);
  });
});

describe("withMainPlan", () => {
  it("names the plan for its term, keeping other terms", () => {
    expect(withMainPlan({ [OTHER_TERM]: fallPlan.id }, planB)).toEqual({
      [OTHER_TERM]: fallPlan.id,
      [TERM]: planB.id,
    });
  });

  it("is the same object when it's already main", () => {
    const mainPlans = { [TERM]: planB.id };
    expect(withMainPlan(mainPlans, planB)).toBe(mainPlans);
  });
});

describe("mainPlansAfterDelete", () => {
  const plans = [planA, planB, planC];

  it("passes main to the next tab", () => {
    expect(mainPlansAfterDelete({ [TERM]: planB.id }, plans, planB.id)).toEqual(
      { [TERM]: planC.id },
    );
    // Going by the first tab, the next one takes over by name.
    expect(mainPlansAfterDelete({}, plans, planA.id)).toEqual({
      [TERM]: planB.id,
    });
  });

  it("passes main to the tab before when it was the last", () => {
    expect(mainPlansAfterDelete({ [TERM]: planC.id }, plans, planC.id)).toEqual(
      { [TERM]: planB.id },
    );
  });

  it("forgets the term's choice when no plan is left", () => {
    expect(
      mainPlansAfterDelete(
        { [TERM]: planA.id, [OTHER_TERM]: fallPlan.id },
        [planA, fallPlan],
        planA.id,
      ),
    ).toEqual({ [OTHER_TERM]: fallPlan.id });
  });

  it("changes nothing when a draft goes", () => {
    const mainPlans = { [TERM]: planB.id };
    expect(mainPlansAfterDelete(mainPlans, plans, planC.id)).toBe(mainPlans);
    expect(mainPlansAfterDelete(mainPlans, plans, "plan_gone_001")).toBe(
      mainPlans,
    );
  });
});

describe("mainPlansBeforeMove", () => {
  it("names the first tab, so moving tabs never changes main", () => {
    const pinned = mainPlansBeforeMove({}, [planA, planB], TERM);
    expect(pinned).toEqual({ [TERM]: planA.id });
    const moved = [
      { ...planA, order: 1 },
      { ...planB, order: 0 },
    ];
    expect(mainPlanFor(TERM, moved, pinned)?.id).toBe(planA.id);
  });

  it("keeps a choice that's already made", () => {
    const mainPlans = { [TERM]: planB.id };
    expect(mainPlansBeforeMove(mainPlans, [planA, planB], TERM)).toBe(
      mainPlans,
    );
  });
});

describe("tabsInTerm", () => {
  it("is the term's plans in tab order", () => {
    expect(tabsInTerm([planC, fallPlan, planA, planB], TERM)).toEqual([
      planA,
      planB,
      planC,
    ]);
  });
});
