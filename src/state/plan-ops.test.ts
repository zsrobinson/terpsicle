import { describe, expect, it } from "vitest";
import {
  activePlanId,
  EMPTY_WORKSPACE,
  nextPlanName,
  plansInTerm,
  reduceWorkspace,
  uniquePlanName,
  type Workspace,
  type WorkspaceAction,
} from "./plan-ops";

const SPRING = "202701";
const FALL = "202608";
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

describe("plan names", () => {
  it("counts up from Plan A, skipping names in use", () => {
    expect(nextPlanName([])).toBe("Plan A");
    expect(nextPlanName([{ name: "Plan A" }, { name: "Plan C" }])).toBe(
      "Plan B",
    );
  });

  it("numbers past Z", () => {
    const taken = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map((l) => ({
      name: `Plan ${l}`,
    }));
    expect(nextPlanName(taken)).toBe("Plan 27");
  });

  it("keeps copies unique and within 60 characters", () => {
    expect(uniquePlanName("Plan A copy", [{ name: "Plan A copy" }])).toBe(
      "Plan A copy 2",
    );
    const long = "x".repeat(70);
    expect(uniquePlanName(long, [])).toHaveLength(60);
    expect(uniquePlanName(long, [{ name: "x".repeat(60) }])).toBe(
      `${"x".repeat(58)} 2`,
    );
  });
});

describe("reduceWorkspace", () => {
  it("creates plans per term and opens the new one", () => {
    const w = apply(
      EMPTY_WORKSPACE,
      create("planAAAA"),
      create("planBBBB"),
      create("fallAAAA", FALL),
    );
    expect(plansInTerm(w.plans, SPRING).map((p) => p.name)).toEqual([
      "Plan A",
      "Plan B",
    ]);
    expect(plansInTerm(w.plans, FALL).map((p) => p.name)).toEqual(["Plan A"]);
    expect(activePlanId(w, SPRING)).toBe("planBBBB");
    expect(activePlanId(w, FALL)).toBe("fallAAAA");
  });

  it("renames, trimming, and ignores empty names", () => {
    let w = apply(EMPTY_WORKSPACE, create("planAAAA"));
    w = reduceWorkspace(w, {
      type: "plan/rename",
      id: "planAAAA",
      name: "  Chill week ",
      now: NOW,
    });
    expect(w.plans[0]?.name).toBe("Chill week");
    const same = reduceWorkspace(w, {
      type: "plan/rename",
      id: "planAAAA",
      name: "   ",
      now: NOW,
    });
    expect(same).toBe(w);
  });

  it("duplicates right after the source tab, with its courses", () => {
    let w = apply(EMPTY_WORKSPACE, create("planAAAA"), create("planBBBB"));
    w = {
      ...w,
      plans: w.plans.map((p) =>
        p.id === "planAAAA"
          ? {
              ...p,
              courses: [
                { courseCode: "CMSC351", sectionCode: null, snapshot: null },
              ],
            }
          : p,
      ),
    };
    w = reduceWorkspace(w, {
      type: "plan/duplicate",
      id: "planAAAA",
      newId: "copyAAAA",
      now: NOW,
    });
    const tabs = plansInTerm(w.plans, SPRING);
    expect(tabs.map((p) => p.name)).toEqual([
      "Plan A",
      "Plan A copy",
      "Plan B",
    ]);
    expect(tabs[1]?.courses).toEqual(tabs[0]?.courses);
    expect(activePlanId(w, SPRING)).toBe("copyAAAA");
  });

  it("deleting the open plan opens its left neighbor", () => {
    let w = apply(
      EMPTY_WORKSPACE,
      create("planAAAA"),
      create("planBBBB"),
      create("planCCCC"),
    );
    w = reduceWorkspace(w, {
      type: "plan/delete",
      id: "planCCCC",
      replacementId: "unusedID",
      now: NOW,
    });
    expect(activePlanId(w, SPRING)).toBe("planBBBB");
    expect(w.plans.map((p) => p.id)).toEqual(["planAAAA", "planBBBB"]);
  });

  it("deleting a term's last plan leaves a fresh empty one", () => {
    let w = apply(EMPTY_WORKSPACE, create("planAAAA"));
    w = reduceWorkspace(w, {
      type: "plan/delete",
      id: "planAAAA",
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

  it("ignores unknown ids and plans from another term", () => {
    const w = apply(EMPTY_WORKSPACE, create("planAAAA"));
    expect(
      reduceWorkspace(w, {
        type: "plan/activate",
        termId: FALL,
        id: "planAAAA",
      }),
    ).toBe(w);
    expect(
      reduceWorkspace(w, {
        type: "plan/delete",
        id: "missing1",
        replacementId: "unusedID",
        now: NOW,
      }),
    ).toBe(w);
  });
});
