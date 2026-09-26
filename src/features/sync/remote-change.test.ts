import { beforeEach, describe, expect, it } from "vitest";
import {
  aBlock,
  aPlan,
  archivedFixtureTermId,
  aSavedCourse,
  aSettingsDoc,
} from "~/fixtures";
import { resetStores } from "~/state/testing";
import { useWorkspace } from "~/state/workspace-store";
import { applyRemoteChange, rebaseHistory } from "./remote-change";

// A change from the account isn't undoable, and undo never brings back what
// it replaced (V2 §5.4: a replaced plan's undo history is cleared).

const planA = aPlan({ id: "plan_a_0001", name: "Plan A" });
const planB = aPlan({ id: "plan_b_0001", name: "Plan B", order: 1 });

const store = () => useWorkspace.getState();
const names = () => store().plans.map((p) => p.name);

function rename(id: string, name: string) {
  store().commit(`Renamed to ${name}`, (w) => ({
    ...w,
    plans: w.plans.map((p) => (p.id === id ? { ...p, name } : p)),
  }));
}

describe("a change from the account", () => {
  beforeEach(() => {
    resetStores();
    useWorkspace.setState({ hydrated: true, plans: [planA, planB] });
  });

  it("replaces the plan with no undo step, and undo leaves it alone", () => {
    rename(planA.id, "Mine");
    rename(planB.id, "Other");
    expect(store().past).toHaveLength(2);

    const theirs = { ...planA, name: "Theirs", courses: [aSavedCourse()] };
    applyRemoteChange(useWorkspace, { plans: [[planA.id, theirs]] });
    expect(names()).toEqual(["Theirs", "Other"]);
    expect(store().notice?.label).toBe("Renamed to Other");
    // The step that only renamed Plan A is gone; Plan B's stays.
    expect(store().past.map((e) => e.label)).toEqual(["Renamed to Other"]);

    store().undo();
    expect(names()).toEqual(["Theirs", "Plan B"]);
    expect(store().undo()).toBe(false);
    store().redo();
    expect(names()).toEqual(["Theirs", "Other"]);
  });

  it("removes a plan deleted elsewhere for good, and adds new ones", () => {
    rename(planA.id, "Mine");
    const copy = aPlan({ id: "plan_copy_01", name: "Plan A (copy)" });
    applyRemoteChange(useWorkspace, {
      plans: [
        [planA.id, null],
        [copy.id, copy],
      ],
    });
    expect(names()).toEqual(["Plan B", "Plan A (copy)"]);
    expect(store().past).toEqual([]);
    expect(store().undo()).toBe(false);
    expect(names()).toEqual(["Plan B", "Plan A (copy)"]);
  });

  it("applies the settings doc: blocks, colors, travel and chat plans", () => {
    store().commit("Added a block", (w) => ({
      ...w,
      blocks: [aBlock({ label: "Mine" })],
    }));
    const settings = aSettingsDoc({
      blocks: [aBlock({ label: "Work" })],
      colors: { CMSC351: "pink" },
      travel: { pace: "faster", accessible: true, extraMinutes: 5 },
      chatPlans: { "202701": planB.id },
    });
    applyRemoteChange(useWorkspace, { settings });
    expect(store()).toMatchObject({
      blocks: settings.blocks,
      colors: settings.colors,
      travel: settings.travel,
      chatPlans: settings.chatPlans,
    });
    expect(store().undo()).toBe(false);
  });

  it("drops only the untouched plans storage never saw, in the terms the account's plans arrived in", () => {
    const theirs = aPlan({ id: "plan_acct_01", name: "Plan A" });
    const unseen = aPlan({ id: "plan_auto_01", name: "Plan A", courses: [] });
    const savedEmpty = aPlan({
      id: "plan_auto_02",
      name: "Plan C",
      courses: [],
    });
    const elsewhere = aPlan({
      id: "plan_auto_03",
      termId: archivedFixtureTermId,
      courses: [],
    });
    useWorkspace.setState({ plans: [unseen, savedEmpty, elsewhere, planB] });
    applyRemoteChange(useWorkspace, {
      plans: [[theirs.id, theirs]],
      arrived: {
        terms: [theirs.termId],
        known: [theirs.id, savedEmpty.id, planB.id],
      },
    });
    expect(store().plans.map((p) => p.id)).toEqual([
      savedEmpty.id,
      elsewhere.id,
      planB.id,
      theirs.id,
    ]);
    expect(store().undo()).toBe(false);
  });

  it("does nothing when nothing changes", () => {
    const before = store();
    applyRemoteChange(useWorkspace, { plans: [[planA.id, planA]] });
    expect(store()).toBe(before);
  });
});

describe("rebaseHistory", () => {
  it("keeps steps that still change something, in order", () => {
    const w = (plans: (typeof planA)[]) => ({
      plans,
      blocks: [],
      colors: {},
      activePlanByTerm: {},
    });
    const entries = [
      { label: "one", before: w([planA, planB]) },
      { label: "two", before: w([{ ...planA, name: "x" }, planB]) },
    ];
    const next = w([
      { ...planA, name: "x" },
      { ...planB, name: "y" },
    ]);
    expect(
      rebaseHistory(
        entries,
        { plans: [[planA.id, planA]] },
        {
          ...next,
          plans: [planA, { ...planB, name: "y" }],
        },
      ).map((e) => e.label),
    ).toEqual(["two"]);
  });
});
