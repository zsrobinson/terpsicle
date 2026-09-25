import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { aBlock, aMeeting, aSection } from "~/fixtures";
import { snapshotOf } from "../catalog/catalog-index";
import { COURSE_COLORS, PlanSchema } from "../schema";
import {
  applyWithHistory,
  canRedo,
  canUndo,
  createHistory,
  type History,
  pushHistory,
  redo,
  resetHistory,
  undo,
} from "./history";
import { cleanPlanName, copyName, nextPlanName, PLAN_NAME_MAX } from "./naming";
import {
  blocksInTerm,
  EMPTY_PLANS_STATE,
  type PlanAction,
  type PlansState,
  plansInTerm,
  plansReducer,
} from "./reducer";

const SPRING = "202701";
const FALL = "202608";
const T0 = "2026-09-25T12:00:00.000Z";
const T1 = "2026-09-25T12:05:00.000Z";
const snap = snapshotOf(aSection());
const snap2 = snapshotOf(aSection({ meetings: [aMeeting({ days: ["Tu"] })] }));

function run(
  actions: PlanAction[],
  state: PlansState = EMPTY_PLANS_STATE,
): PlansState {
  return actions.reduce(plansReducer, state);
}

const create = (id: string, termId = SPRING, name?: string): PlanAction => ({
  type: "plan/create",
  id,
  termId,
  now: T0,
  ...(name ? { name } : {}),
});

describe("plan names", () => {
  it("counts Plan A, B, … Z, AA", () => {
    expect(nextPlanName([])).toBe("Plan A");
    expect(nextPlanName(["Plan A", "Plan C"])).toBe("Plan B");
    const az = Array.from(
      { length: 26 },
      (_, i) => `Plan ${String.fromCharCode(65 + i)}`,
    );
    expect(nextPlanName(az)).toBe("Plan AA");
    expect(nextPlanName([...az, "Plan AA"])).toBe("Plan AB");
  });

  it("names copies", () => {
    expect(copyName("Plan A", [])).toBe("Copy of Plan A");
    expect(copyName("Plan A", ["Copy of Plan A"])).toBe("Copy of Plan A 2");
    const long = "x".repeat(60);
    expect(copyName(long, []).length).toBe(PLAN_NAME_MAX);
    expect(copyName(long, [copyName(long, [])]).endsWith(" 2")).toBe(true);
  });

  it("cleans names", () => {
    expect(cleanPlanName("  My   plan ")).toBe("My plan");
    expect(cleanPlanName("   ")).toBeNull();
    expect(cleanPlanName("y".repeat(80))).toHaveLength(PLAN_NAME_MAX);
  });
});

describe("plans reducer", () => {
  it("creates plans per term with names and order", () => {
    const s = run([
      create("plan-0001"),
      create("plan-0002"),
      create("plan-0003", FALL),
      create("plan-0004", SPRING, "Mine"),
    ]);
    expect(plansInTerm(s, SPRING).map((p) => [p.name, p.order])).toEqual([
      ["Plan A", 0],
      ["Plan B", 1],
      ["Mine", 2],
    ]);
    expect(plansInTerm(s, FALL).map((p) => p.name)).toEqual(["Plan A"]);
    for (const p of s.plans) expect(PlanSchema.safeParse(p).success).toBe(true);
    expect(run([create("plan-0001")], s)).toBe(s);
  });

  it("duplicates right after the source, as Copy of X", () => {
    const s = run([
      create("plan-0001"),
      create("plan-0002"),
      {
        type: "course/add",
        planId: "plan-0001",
        courseCode: "CMSC351",
        section: { code: "0101", snapshot: snap },
        now: T0,
      },
      { type: "plan/duplicate", planId: "plan-0001", id: "plan-0003", now: T1 },
    ]);
    expect(plansInTerm(s, SPRING).map((p) => p.name)).toEqual([
      "Plan A",
      "Copy of Plan A",
      "Plan B",
    ]);
    const copy = s.plans.find((p) => p.id === "plan-0003");
    expect(copy?.courses).toEqual(s.plans[0]?.courses);
    expect(copy?.courses).not.toBe(s.plans[0]?.courses);
    expect(copy?.createdAt).toBe(T1);
    expect(
      run(
        [
          {
            type: "plan/duplicate",
            planId: "nope-nope",
            id: "plan-0009",
            now: T1,
          },
        ],
        s,
      ),
    ).toBe(s);
  });

  it("renames, ignoring blank and unchanged names", () => {
    const s = run([create("plan-0001")]);
    const renamed = plansReducer(s, {
      type: "plan/rename",
      planId: "plan-0001",
      name: " Fall  plan ",
      now: T1,
    });
    expect(renamed.plans[0]).toMatchObject({
      name: "Fall plan",
      updatedAt: T1,
    });
    expect(
      plansReducer(renamed, {
        type: "plan/rename",
        planId: "plan-0001",
        name: "  ",
        now: T1,
      }),
    ).toBe(renamed);
    expect(
      plansReducer(renamed, {
        type: "plan/rename",
        planId: "plan-0001",
        name: "Fall plan",
        now: T1,
      }),
    ).toBe(renamed);
  });

  it("deletes and moves plan tabs within a term", () => {
    const s = run([
      create("plan-0001"),
      create("plan-0002"),
      create("plan-0003"),
      create("plan-0004", FALL),
    ]);
    const moved = plansReducer(s, {
      type: "plan/move",
      planId: "plan-0003",
      toIndex: 0,
    });
    expect(plansInTerm(moved, SPRING).map((p) => p.id)).toEqual([
      "plan-0003",
      "plan-0001",
      "plan-0002",
    ]);
    expect(plansInTerm(moved, FALL)[0]?.order).toBe(0);
    expect(
      plansReducer(moved, {
        type: "plan/move",
        planId: "plan-0003",
        toIndex: -5,
      }),
    ).toBe(moved);
    const deleted = plansReducer(moved, {
      type: "plan/delete",
      planId: "plan-0001",
    });
    expect(plansInTerm(deleted, SPRING).map((p) => p.id)).toEqual([
      "plan-0003",
      "plan-0002",
    ]);
    expect(
      plansReducer(deleted, { type: "plan/delete", planId: "plan-0001" }),
    ).toBe(deleted);
  });

  describe("courses", () => {
    const base = run([create("plan-0001")]);
    const add = (
      courseCode: string,
      section: { code: string; snapshot: typeof snap } | null = null,
    ): Extract<PlanAction, { type: "course/add" }> => ({
      type: "course/add",
      planId: "plan-0001",
      courseCode,
      section,
      now: T1,
    });
    const courses = (s: PlansState) => s.plans[0]?.courses ?? [];

    it("adds placed and saved courses, assigning a color once", () => {
      const s = run(
        [add("CMSC351", { code: "0101", snapshot: snap }), add("MATH240")],
        base,
      );
      expect(courses(s)).toEqual([
        { courseCode: "CMSC351", sectionCode: "0101", snapshot: snap },
        { courseCode: "MATH240", sectionCode: null, snapshot: null },
      ]);
      expect(Object.keys(s.colors)).toEqual(["CMSC351", "MATH240"]);
      expect(s.colors.CMSC351).not.toBe(s.colors.MATH240);
      expect(s.plans[0]?.updatedAt).toBe(T1);
      const recolored = plansReducer(s, {
        type: "color/set",
        courseCode: "CMSC351",
        color: "pink",
      });
      expect(
        run([add("CMSC351"), add("ENGL101")], recolored).colors.CMSC351,
      ).toBe("pink");
      expect(
        plansReducer(recolored, {
          type: "color/set",
          courseCode: "CMSC351",
          color: "pink",
        }),
      ).toBe(recolored);
    });

    it("switches instead of adding a course twice", () => {
      const s = run(
        [add("CMSC351"), add("CMSC351", { code: "0201", snapshot: snap2 })],
        base,
      );
      expect(courses(s)).toEqual([
        { courseCode: "CMSC351", sectionCode: "0201", snapshot: snap2 },
      ]);
      expect(plansReducer(s, add("CMSC351"))).toBe(s);
    });

    it("switches, saves for later, places again and accepts changes", () => {
      let s = run([add("CMSC351", { code: "0101", snapshot: snap })], base);
      const sw = (
        code: string,
      ): Extract<PlanAction, { type: "course/switch" }> => ({
        type: "course/switch",
        planId: "plan-0001",
        courseCode: "CMSC351",
        section: { code, snapshot: snap2 },
        now: T1,
      });
      s = plansReducer(s, sw("0201"));
      expect(courses(s)[0]).toMatchObject({ sectionCode: "0201" });
      expect(plansReducer(s, sw("0201"))).toBe(s);
      s = plansReducer(s, {
        type: "course/save-for-later",
        planId: "plan-0001",
        courseCode: "CMSC351",
        now: T1,
      });
      expect(courses(s)[0]).toEqual({
        courseCode: "CMSC351",
        sectionCode: null,
        snapshot: null,
      });
      expect(
        plansReducer(s, {
          type: "course/save-for-later",
          planId: "plan-0001",
          courseCode: "CMSC351",
          now: T1,
        }),
      ).toBe(s);
      const acceptSaved: PlanAction = {
        type: "course/accept-change",
        planId: "plan-0001",
        courseCode: "CMSC351",
        snapshot: snap,
        now: T1,
      };
      expect(plansReducer(s, acceptSaved)).toBe(s);
      s = plansReducer(s, sw("0101"));
      s = plansReducer(s, acceptSaved);
      expect(courses(s)[0]).toEqual({
        courseCode: "CMSC351",
        sectionCode: "0101",
        snapshot: snap,
      });
      expect(plansReducer(s, { ...sw("0101"), courseCode: "NOPE101" })).toBe(s);
    });

    it("removes and reorders", () => {
      const s = run([add("CMSC351"), add("CMSC330"), add("MATH240")], base);
      const moved = plansReducer(s, {
        type: "course/move",
        planId: "plan-0001",
        courseCode: "MATH240",
        toIndex: 0,
        now: T1,
      });
      expect(courses(moved).map((c) => c.courseCode)).toEqual([
        "MATH240",
        "CMSC351",
        "CMSC330",
      ]);
      expect(
        plansReducer(moved, {
          type: "course/move",
          planId: "plan-0001",
          courseCode: "MATH240",
          toIndex: 0,
          now: T1,
        }),
      ).toBe(moved);
      const removed = plansReducer(moved, {
        type: "course/remove",
        planId: "plan-0001",
        courseCode: "CMSC351",
        now: T1,
      });
      expect(courses(removed).map((c) => c.courseCode)).toEqual([
        "MATH240",
        "CMSC330",
      ]);
      expect(
        plansReducer(removed, {
          type: "course/remove",
          planId: "plan-0001",
          courseCode: "CMSC351",
          now: T1,
        }),
      ).toBe(removed);
      expect(plansReducer(removed, { ...add("X"), planId: "nope-nope" })).toBe(
        removed,
      );
    });

    it("assigns colors to courses a new plan starts with", () => {
      const s = plansReducer(EMPTY_PLANS_STATE, {
        type: "plan/create",
        id: "plan-0001",
        termId: SPRING,
        now: T0,
        courses: [{ courseCode: "CMSC351", sectionCode: null, snapshot: null }],
      });
      expect(s.colors.CMSC351).toBeDefined();
    });
  });

  describe("blocks", () => {
    const lunch = aBlock({ termId: SPRING, id: "block-0001" });

    it("adds, edits and removes blocks per term", () => {
      let s = plansReducer(EMPTY_PLANS_STATE, {
        type: "block/add",
        block: lunch,
      });
      expect(plansReducer(s, { type: "block/add", block: lunch })).toBe(s);
      expect(blocksInTerm(s, SPRING)).toEqual([lunch]);
      expect(blocksInTerm(s, FALL)).toEqual([]);
      s = plansReducer(s, {
        type: "block/update",
        blockId: "block-0001",
        patch: { label: "Work", end: 800 },
      });
      expect(s.blocks[0]).toMatchObject({
        label: "Work",
        start: 720,
        end: 800,
      });
      expect(
        plansReducer(s, {
          type: "block/update",
          blockId: "block-0001",
          patch: { label: "Work" },
        }),
      ).toBe(s);
      expect(
        plansReducer(s, {
          type: "block/update",
          blockId: "block-0001",
          patch: { end: 700 },
        }),
      ).toBe(s);
      expect(
        plansReducer(s, {
          type: "block/update",
          blockId: "block-0001",
          patch: { days: [] },
        }),
      ).toBe(s);
      expect(
        plansReducer(s, {
          type: "block/update",
          blockId: "nope-nope",
          patch: { end: 900 },
        }),
      ).toBe(s);
      s = plansReducer(s, { type: "block/remove", blockId: "block-0001" });
      expect(s.blocks).toEqual([]);
      expect(
        plansReducer(s, { type: "block/remove", blockId: "block-0001" }),
      ).toBe(s);
    });
  });
});

describe("history", () => {
  it("undoes and redoes, skipping no-ops", () => {
    let h: History<PlansState> = createHistory(EMPTY_PLANS_STATE);
    expect(canUndo(h)).toBe(false);
    h = applyWithHistory(h, plansReducer, create("plan-0001"));
    h = applyWithHistory(h, plansReducer, {
      type: "plan/delete",
      planId: "nope-nope",
    });
    expect(h.past).toHaveLength(1);
    h = undo(h);
    expect(h.present).toBe(EMPTY_PLANS_STATE);
    expect(canRedo(h)).toBe(true);
    expect(undo(h)).toBe(h);
    h = redo(h);
    expect(h.present.plans).toHaveLength(1);
    expect(redo(h)).toBe(h);
    expect(resetHistory(h.present)).toEqual(createHistory(h.present));
  });

  it("drops redo on a new change and caps the stack", () => {
    let h = createHistory(0);
    for (let i = 1; i <= 5; i++) h = pushHistory(h, i, 3);
    expect(h.past).toEqual([2, 3, 4]);
    h = pushHistory(undo(h), 9, 3);
    expect(h.future).toEqual([]);
  });

  // ---------- properties ----------

  const planIds = ["plan-0001", "plan-0002", "plan-0003"];
  const courseCodes = ["CMSC351", "CMSC330", "MATH240"];
  const action: fc.Arbitrary<PlanAction> = fc.oneof(
    fc.record({
      type: fc.constant("plan/create" as const),
      id: fc.constantFrom(...planIds),
      termId: fc.constantFrom(SPRING, FALL),
      now: fc.constant(T0),
    }),
    fc.record({
      type: fc.constant("plan/duplicate" as const),
      planId: fc.constantFrom(...planIds),
      id: fc.constantFrom(...planIds, "plan-0004"),
      now: fc.constant(T1),
    }),
    fc.record({
      type: fc.constant("plan/rename" as const),
      planId: fc.constantFrom(...planIds),
      name: fc.string({ maxLength: 8 }),
      now: fc.constant(T1),
    }),
    fc.record({
      type: fc.constant("plan/delete" as const),
      planId: fc.constantFrom(...planIds),
    }),
    fc.record({
      type: fc.constant("plan/move" as const),
      planId: fc.constantFrom(...planIds),
      toIndex: fc.integer({ min: -1, max: 4 }),
    }),
    fc.record({
      type: fc.constant("course/add" as const),
      planId: fc.constantFrom(...planIds),
      courseCode: fc.constantFrom(...courseCodes),
      section: fc.option(
        fc.record({
          code: fc.constantFrom("0101", "0201"),
          snapshot: fc.constant(snap),
        }),
        { nil: null },
      ),
      now: fc.constant(T1),
    }),
    fc.record({
      type: fc.constant("course/remove" as const),
      planId: fc.constantFrom(...planIds),
      courseCode: fc.constantFrom(...courseCodes),
      now: fc.constant(T1),
    }),
    fc.record({
      type: fc.constant("course/switch" as const),
      planId: fc.constantFrom(...planIds),
      courseCode: fc.constantFrom(...courseCodes),
      section: fc.record({
        code: fc.constantFrom("0101", "0201"),
        snapshot: fc.constant(snap2),
      }),
      now: fc.constant(T1),
    }),
    fc.record({
      type: fc.constant("course/save-for-later" as const),
      planId: fc.constantFrom(...planIds),
      courseCode: fc.constantFrom(...courseCodes),
      now: fc.constant(T1),
    }),
    fc.record({
      type: fc.constant("course/move" as const),
      planId: fc.constantFrom(...planIds),
      courseCode: fc.constantFrom(...courseCodes),
      toIndex: fc.integer({ min: 0, max: 3 }),
      now: fc.constant(T1),
    }),
    fc.record({
      type: fc.constant("color/set" as const),
      courseCode: fc.constantFrom(...courseCodes),
      color: fc.constantFrom(...COURSE_COLORS),
    }),
    fc.record({
      type: fc.constant("block/add" as const),
      block: fc.constantFrom(
        aBlock({ termId: SPRING, id: "block-0001" }),
        aBlock({ termId: FALL, id: "block-0002" }),
      ),
    }),
    fc.record({
      type: fc.constant("block/update" as const),
      blockId: fc.constantFrom("block-0001", "block-0002"),
      patch: fc.record({ label: fc.constantFrom("Gym", "Work") }),
    }),
    fc.record({
      type: fc.constant("block/remove" as const),
      blockId: fc.constantFrom("block-0001", "block-0002"),
    }),
  );

  it("undo(apply(x)) = x (property)", () => {
    fc.assert(
      fc.property(fc.array(action, { maxLength: 20 }), action, (setup, a) => {
        const h = createHistory(run(setup));
        expect(undo(applyWithHistory(h, plansReducer, a)).present).toEqual(
          h.present,
        );
        const redone = redo(undo(applyWithHistory(h, plansReducer, a)));
        expect(redone.present).toEqual(plansReducer(h.present, a));
      }),
    );
  });

  it("never moves a plan between terms or mixes courses across them (property)", () => {
    fc.assert(
      fc.property(fc.array(action, { maxLength: 40 }), (actions) => {
        const termOf = new Map<string, string>();
        let s = EMPTY_PLANS_STATE;
        for (const a of actions) {
          const before = s;
          s = plansReducer(s, a);
          // A deleted id may be reused by a later create, in any term.
          for (const id of termOf.keys())
            if (!s.plans.some((p) => p.id === id)) termOf.delete(id);
          for (const p of s.plans) {
            const known = termOf.get(p.id);
            if (known) expect(p.termId).toBe(known);
            else termOf.set(p.id, p.termId);
            expect(PlanSchema.safeParse(p).success).toBe(true);
          }
          // Only the plan an action names changes its courses.
          if ("planId" in a && a.type.startsWith("course/"))
            for (const p of s.plans)
              if (p.id !== a.planId)
                expect(p.courses).toBe(
                  before.plans.find((q) => q.id === p.id)?.courses,
                );
        }
      }),
    );
  });
});
