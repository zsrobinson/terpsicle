import { beforeEach, describe, expect, it } from "vitest";
import { plansInTerm } from "./plan-ops";
import { resetStores } from "./testing";
import { UNDO_LIMIT, useWorkspace } from "./workspace-store";

const SPRING = "202701";
const NOW = "2026-09-25T12:00:00.000Z";

const names = () =>
  plansInTerm(useWorkspace.getState().plans, SPRING).map((p) => p.name);

function createPlan(id: string) {
  useWorkspace
    .getState()
    .dispatch(
      { type: "plan/create", id, termId: SPRING, now: NOW },
      "Created an empty plan",
    );
}

describe("workspace store", () => {
  beforeEach(() => {
    resetStores();
    useWorkspace.setState({ hydrated: true });
  });

  it("makes a first plan for a term, once, without history", () => {
    const { ensurePlan } = useWorkspace.getState();
    ensurePlan(SPRING);
    ensurePlan(SPRING);
    expect(names()).toEqual(["Plan A"]);
    expect(useWorkspace.getState().past).toEqual([]);
  });

  it("waits for persisted state before making a first plan", () => {
    useWorkspace.setState({ hydrated: false });
    useWorkspace.getState().ensurePlan(SPRING);
    expect(names()).toEqual([]);
  });

  it("undoes and redoes, restoring the open plan too", () => {
    createPlan("planAAAA");
    createPlan("planBBBB");
    useWorkspace.getState().dispatch(
      {
        type: "plan/delete",
        id: "planBBBB",
        replacementId: "unusedID",
        now: NOW,
      },
      "Deleted Plan B",
    );
    expect(names()).toEqual(["Plan A"]);
    expect(useWorkspace.getState().notice).toMatchObject({
      kind: "commit",
      label: "Deleted Plan B",
      toast: true,
    });

    expect(useWorkspace.getState().undo()).toBe(true);
    expect(names()).toEqual(["Plan A", "Plan B"]);
    expect(useWorkspace.getState().activePlanByTerm[SPRING]).toBe("planBBBB");
    expect(useWorkspace.getState().notice?.kind).toBe("undo");

    expect(useWorkspace.getState().redo()).toBe(true);
    expect(names()).toEqual(["Plan A"]);
  });

  it("a new change clears redo", () => {
    createPlan("planAAAA");
    useWorkspace.getState().undo();
    createPlan("planBBBB");
    expect(useWorkspace.getState().redo()).toBe(false);
  });

  it("does nothing, and keeps no history, for a no-op change", () => {
    useWorkspace.getState().commit("Nothing", (w) => w);
    expect(useWorkspace.getState().past).toEqual([]);
    expect(useWorkspace.getState().notice).toBeNull();
    expect(useWorkspace.getState().undo()).toBe(false);
  });

  it("keeps a bounded history", () => {
    for (let i = 0; i < UNDO_LIMIT + 5; i++)
      createPlan(`plan${String(i).padStart(4, "0")}`);
    expect(useWorkspace.getState().past).toHaveLength(UNDO_LIMIT);
  });

  it("quiet changes are still undoable", () => {
    createPlan("planAAAA");
    useWorkspace
      .getState()
      .dispatch(
        { type: "plan/rename", id: "planAAAA", name: "Mine", now: NOW },
        "Renamed Plan A",
        { toast: false },
      );
    expect(useWorkspace.getState().notice?.toast).toBe(false);
    useWorkspace.getState().undo();
    expect(names()).toEqual(["Plan A"]);
  });

  it("opening a plan tab isn't an edit", () => {
    createPlan("planAAAA");
    createPlan("planBBBB");
    const before = useWorkspace.getState().past.length;
    useWorkspace.getState().activatePlan(SPRING, "planAAAA");
    expect(useWorkspace.getState().activePlanByTerm[SPRING]).toBe("planAAAA");
    expect(useWorkspace.getState().past).toHaveLength(before);
  });
});
