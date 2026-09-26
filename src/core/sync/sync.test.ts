import { describe, expect, it } from "vitest";
import {
  aBlock,
  aPlan,
  aPlanCourse,
  aPlanSyncDoc,
  aSavedCourse,
  aSettingsDoc,
  aSettingsSyncDoc,
} from "~/fixtures";
import {
  DEFAULT_TRAVEL_SETTINGS,
  PlanSchema,
  type SettingsDoc,
  SyncDocSchema,
} from "../schema";
import {
  conflictCopyName,
  mergeSettings,
  nextOrder,
  plansAfterConflict,
  resolvePlanConflict,
  samePlanContent,
} from "./conflict";
import {
  applyDoc,
  changedDocKeys,
  docBody,
  docKeyOf,
  parseDocKey,
  planDocKey,
  SETTINGS_DOC_KEY,
  type SyncedTables,
  settingsDocOf,
  withPlan,
  withSettingsDoc,
} from "./docs";
import { sameJson } from "./equal";
import { firstSignInUnion, isUntouchedPlan } from "./first-sign-in";
import {
  baseRev,
  docsInFlight,
  docsToPush,
  hasUnsaved,
  INITIAL_PLAN_SYNC_STATE,
  type PlanSyncEvent,
  type PlanSyncState,
  planSyncReducer,
  shouldApplyPulled,
} from "./state";

const SPRING = "202701";
const FALL = "202608";
const LATER = "2026-09-26T09:00:00.000Z";

const planA = aPlan({ id: "plan_a_0001", name: "Plan A", order: 0 });
const planB = aPlan({
  id: "plan_b_0001",
  name: "Plan B",
  order: 1,
  courses: [aPlanCourse(), aSavedCourse()],
});

function tables(overrides: Partial<SyncedTables> = {}): SyncedTables {
  return {
    plans: [planA, planB],
    blocks: [aBlock()],
    colors: { CMSC351: "blue" },
    travel: DEFAULT_TRAVEL_SETTINGS,
    chatPlans: {},
    ...overrides,
  };
}

function ids(counter = { n: 0 }) {
  return () => `plan_new_${String(++counter.n).padStart(4, "0")}`;
}

describe("sameJson", () => {
  it("compares JSON structurally, in any key order", () => {
    expect(
      sameJson({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 }),
    ).toBe(true);
    expect(sameJson({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameJson([1, 2], [2, 1])).toBe(false);
    expect(sameJson([1], { 0: 1 })).toBe(false);
    expect(sameJson(null, {})).toBe(false);
    expect(sameJson({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it("treats a key set to undefined as missing", () => {
    expect(sameJson({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(sameJson(undefined, undefined)).toBe(true);
    expect(sameJson(undefined, null)).toBe(false);
  });
});

describe("sync doc schemas", () => {
  it("accept plan docs, tombstones and the settings doc", () => {
    expect(SyncDocSchema.safeParse(aPlanSyncDoc()).success).toBe(true);
    expect(
      SyncDocSchema.safeParse(aPlanSyncDoc({ id: "plan_gone_1", body: null }))
        .success,
    ).toBe(true);
    expect(SyncDocSchema.safeParse(aSettingsSyncDoc()).success).toBe(true);
  });

  it("reject a plan doc whose body has another id, and rev 0", () => {
    expect(
      SyncDocSchema.safeParse(aPlanSyncDoc({ id: "plan_other_1" })).success,
    ).toBe(false);
    expect(SyncDocSchema.safeParse(aPlanSyncDoc({ rev: 0 })).success).toBe(
      false,
    );
  });

  it("reject a settings doc with a block twice", () => {
    const doc = aSettingsSyncDoc({
      body: aSettingsDoc({ blocks: [aBlock(), aBlock()] }),
    });
    expect(SyncDocSchema.safeParse(doc).success).toBe(false);
  });
});

describe("doc keys", () => {
  it("round-trips plan and settings keys", () => {
    expect(planDocKey("plan_a_0001")).toBe("plan:plan_a_0001");
    expect(parseDocKey("plan:plan_a_0001")).toEqual({
      kind: "plan",
      id: "plan_a_0001",
    });
    expect(parseDocKey(SETTINGS_DOC_KEY)).toEqual({ kind: "settings" });
    expect(docKeyOf(aPlanSyncDoc())).toBe("plan:plan_fixture_a");
    expect(docKeyOf(aSettingsSyncDoc())).toBe(SETTINGS_DOC_KEY);
  });
});

describe("mapping tables and docs", () => {
  it("gathers blocks, colors, travel and chat plans into the settings doc", () => {
    const t = tables({ chatPlans: { [SPRING]: planA.id } });
    expect(settingsDocOf(t)).toEqual({
      blocks: [aBlock()],
      colors: { CMSC351: "blue" },
      travel: DEFAULT_TRAVEL_SETTINGS,
      chatPlans: { [SPRING]: planA.id },
    });
  });

  it("applies a settings doc, keeping unchanged tables as they were", () => {
    const t = tables();
    expect(withSettingsDoc(t, settingsDocOf(t))).toBe(t);
    const doc = { ...settingsDocOf(t), colors: { CMSC351: "green" as const } };
    const next = withSettingsDoc(t, doc);
    expect(next.colors).toEqual({ CMSC351: "green" });
    expect(next.blocks).toBe(t.blocks);
    expect(next.travel).toBe(t.travel);
    expect(next.plans).toBe(t.plans);
  });

  it("gives the body to push: the plan, null once deleted, or the settings", () => {
    const t = tables();
    expect(docBody(t, planDocKey(planA.id))).toBe(planA);
    expect(docBody(t, planDocKey("plan_gone_1"))).toBeNull();
    expect(docBody(t, SETTINGS_DOC_KEY)).toEqual(settingsDocOf(t));
  });

  it("replaces, adds and removes plans, keeping the array when nothing changes", () => {
    const plans = [planA, planB];
    const renamed = { ...planA, name: "Mine" };
    expect(withPlan(plans, planA.id, renamed)).toEqual([renamed, planB]);
    expect(withPlan(plans, planA.id, { ...planA })).toBe(plans);
    expect(withPlan(plans, "plan_c_0001", null)).toBe(plans);
    expect(withPlan(plans, planB.id, null)).toEqual([planA]);
    const planC = aPlan({ id: "plan_c_0001" });
    expect(withPlan(plans, planC.id, planC)).toEqual([planA, planB, planC]);
  });

  it("applies server docs as they are", () => {
    const t = tables();
    const renamed = { ...planA, name: "From my phone" };
    expect(applyDoc(t, aPlanSyncDoc({ body: renamed })).plans).toEqual([
      renamed,
      planB,
    ]);
    expect(
      applyDoc(t, aPlanSyncDoc({ id: planB.id, body: null })).plans,
    ).toEqual([planA]);
    expect(applyDoc(t, aPlanSyncDoc({ body: planA }))).toBe(t);
    const settings = aSettingsSyncDoc({
      body: aSettingsDoc({ blocks: [], chatPlans: { [SPRING]: planB.id } }),
    });
    const next = applyDoc(t, settings);
    expect(next.blocks).toEqual([]);
    expect(next.chatPlans).toEqual({ [SPRING]: planB.id });
    expect(next.plans).toBe(t.plans);
  });

  it("lists the docs an edit changed", () => {
    const t = tables();
    expect(changedDocKeys(t, t)).toEqual([]);
    // A new object with the same contents (an undo back to it) changes nothing.
    expect(changedDocKeys(t, { ...t, plans: [{ ...planA }, planB] })).toEqual(
      [],
    );
    const planC = aPlan({ id: "plan_c_0001" });
    expect(
      changedDocKeys(t, {
        ...t,
        plans: [{ ...planA, name: "Mine" }, planC],
      }),
    ).toEqual([
      planDocKey(planA.id),
      planDocKey(planC.id),
      planDocKey(planB.id),
    ]);
    expect(changedDocKeys(t, { ...t, blocks: [] })).toEqual([SETTINGS_DOC_KEY]);
    expect(changedDocKeys(t, { ...t, blocks: [aBlock()] })).toEqual([]);
    expect(
      changedDocKeys(t, { ...t, travel: { ...t.travel, accessible: true } }),
    ).toEqual([SETTINGS_DOC_KEY]);
  });
});

describe("conflictCopyName", () => {
  it("adds (copy), then counts up", () => {
    expect(conflictCopyName("Plan A", [])).toBe("Plan A (copy)");
    expect(conflictCopyName("Plan A", ["Plan A (copy)"])).toBe(
      "Plan A (copy 2)",
    );
    expect(
      conflictCopyName("Plan A", ["Plan A (copy)", "Plan A (copy 2)"]),
    ).toBe("Plan A (copy 3)");
  });

  it("counts on from the original name for a copy of a copy", () => {
    expect(conflictCopyName("Plan A (copy)", ["Plan A (copy)"])).toBe(
      "Plan A (copy 2)",
    );
    expect(conflictCopyName("Plan A (copy 2)", ["Plan A (copy)"])).toBe(
      "Plan A (copy 2)",
    );
  });

  it("fits the name limit", () => {
    const long = "x".repeat(60);
    const name = conflictCopyName(long, []);
    expect(name).toHaveLength(60);
    expect(name.endsWith(" (copy)")).toBe(true);
    expect(PlanSchema.shape.name.safeParse(name).success).toBe(true);
  });
});

describe("resolvePlanConflict", () => {
  const input = { plans: [planA, planB], copyId: "plan_copy_01", now: LATER };

  it("takes the server's version when both hold the same work", () => {
    const server = { ...planA, order: 5, updatedAt: LATER };
    expect(samePlanContent(planA, server)).toBe(true);
    expect(resolvePlanConflict({ ...input, local: planA, server })).toEqual({
      kind: "take-server",
      plan: server,
    });
  });

  it("keeps both when they differ: the server's stays, this device's becomes a copy", () => {
    const local = { ...planA, courses: [aPlanCourse()] };
    const server = { ...planA, name: "Plan A", courses: [aSavedCourse()] };
    const result = resolvePlanConflict({ ...input, local, server });
    expect(result).toEqual({
      kind: "keep-both",
      plan: server,
      copy: {
        ...local,
        id: "plan_copy_01",
        name: "Plan A (copy)",
        order: 2,
        createdAt: LATER,
        updatedAt: LATER,
      },
    });
    if (result.kind !== "keep-both") throw new Error("expected keep-both");
    expect(PlanSchema.safeParse(result.copy).success).toBe(true);
    expect(plansAfterConflict([planA, planB], planA.id, result)).toEqual([
      server,
      planB,
      result.copy,
    ]);
  });

  it("names the copy against the server's names, not this device's old one", () => {
    const local = { ...planA, name: "Mine", courses: [] };
    const server = { ...planA, name: "Plan B (copy)" };
    const result = resolvePlanConflict({ ...input, local, server });
    expect(result.kind === "keep-both" && result.copy.name).toBe("Mine (copy)");
    const clash = resolvePlanConflict({
      ...input,
      local: { ...planA, name: "Plan B", courses: [] },
      server: { ...planA, name: "Plan C" },
    });
    expect(clash.kind === "keep-both" && clash.copy.name).toBe("Plan B (copy)");
  });

  it("lets an edit win over a delete, either way", () => {
    expect(
      resolvePlanConflict({ ...input, local: null, server: planA }),
    ).toEqual({ kind: "take-server", plan: planA });
    expect(
      resolvePlanConflict({ ...input, local: planA, server: null }),
    ).toEqual({ kind: "keep-local", plan: planA });
    expect(
      resolvePlanConflict({ ...input, local: null, server: null }),
    ).toEqual({ kind: "take-server", plan: null });
  });

  it("updates the plans for each outcome", () => {
    const plans = [planA, planB];
    expect(
      plansAfterConflict(plans, planA.id, { kind: "take-server", plan: null }),
    ).toEqual([planB]);
    expect(
      plansAfterConflict(plans, planA.id, { kind: "keep-local", plan: planA }),
    ).toBe(plans);
  });

  it("puts the copy after the term's last tab", () => {
    expect(nextOrder([])).toBe(0);
    expect(nextOrder([{ order: 0 }, { order: 3 }])).toBe(4);
    expect(nextOrder([{ order: 1.5 }])).toBe(2);
  });
});

describe("mergeSettings", () => {
  const lunch = aBlock({ id: "block_lunch_1", label: "Lunch" });
  const work = aBlock({
    id: "block_work_01",
    label: "Work",
    start: 900,
    end: 1020,
  });
  const gym = aBlock({
    id: "block_gym_001",
    label: "Gym",
    start: 420,
    end: 480,
  });
  const base = aSettingsDoc({
    blocks: [lunch, work],
    colors: { CMSC351: "blue", MATH240: "green" },
    chatPlans: { [SPRING]: planA.id },
  });
  const edit = (doc: SettingsDoc, patch: Partial<SettingsDoc>) => ({
    ...doc,
    ...patch,
  });

  it("keeps what each side changed when they changed different things", () => {
    const local = edit(base, {
      blocks: [{ ...lunch, label: "Long lunch" }, work],
    });
    const server = edit(base, {
      travel: { ...DEFAULT_TRAVEL_SETTINGS, pace: "slower" },
      colors: { ...base.colors, MATH240: "pink" },
    });
    expect(mergeSettings({ base, local, server })).toEqual({
      ...server,
      blocks: [{ ...lunch, label: "Long lunch" }, work],
    });
  });

  it("keeps this device's value for a key both changed", () => {
    const local = edit(base, { colors: { ...base.colors, CMSC351: "teal" } });
    const server = edit(base, { colors: { ...base.colors, CMSC351: "pink" } });
    expect(mergeSettings({ base, local, server }).colors.CMSC351).toBe("teal");
  });

  it("keeps additions from both sides", () => {
    const local = edit(base, { blocks: [lunch, work, gym] });
    const run = aBlock({ id: "block_run_001", label: "Run" });
    const server = edit(base, { blocks: [run, lunch, work] });
    expect(mergeSettings({ base, local, server }).blocks).toEqual([
      run,
      lunch,
      work,
      gym,
    ]);
  });

  it("applies a delete from either side unless the other side edited it", () => {
    const deletedHere = edit(base, { blocks: [work] });
    expect(
      mergeSettings({ base, local: deletedHere, server: base }).blocks,
    ).toEqual([work]);
    const deletedThere = edit(base, { blocks: [lunch] });
    expect(
      mergeSettings({ base, local: base, server: deletedThere }).blocks,
    ).toEqual([lunch]);
    const editedThere = edit(base, {
      blocks: [{ ...lunch, start: 690 }, work],
    });
    expect(
      mergeSettings({ base, local: deletedHere, server: editedThere }).blocks,
    ).toEqual([{ ...lunch, start: 690 }, work]);
    const editedHere = edit(base, { blocks: [{ ...lunch, start: 690 }, work] });
    expect(
      mergeSettings({ base, local: editedHere, server: deletedHere }).blocks,
    ).toEqual([work, { ...lunch, start: 690 }]);
  });

  it("with no base, takes the server's value for shared keys and keeps the rest", () => {
    const local = aSettingsDoc({
      blocks: [{ ...lunch, label: "Mine" }, gym],
      colors: { CMSC351: "teal", ENGL101: "pink" },
      travel: { ...DEFAULT_TRAVEL_SETTINGS, accessible: true },
      chatPlans: { [SPRING]: planB.id, [FALL]: planA.id },
    });
    expect(mergeSettings({ base: null, local, server: base })).toEqual({
      blocks: [lunch, work, gym],
      colors: { CMSC351: "blue", MATH240: "green", ENGL101: "pink" },
      travel: DEFAULT_TRAVEL_SETTINGS,
      chatPlans: { [SPRING]: planA.id, [FALL]: planA.id },
    });
  });
});

describe("isUntouchedPlan", () => {
  it("is a default name with no courses", () => {
    expect(isUntouchedPlan(aPlan({ name: "Plan A", courses: [] }))).toBe(true);
    expect(isUntouchedPlan(aPlan({ name: "Plan AB", courses: [] }))).toBe(true);
    expect(isUntouchedPlan(aPlan({ name: "Plan A" }))).toBe(false);
    expect(isUntouchedPlan(aPlan({ name: "Fall ideas", courses: [] }))).toBe(
      false,
    );
    expect(
      isUntouchedPlan(aPlan({ name: "Plan A", courses: [aSavedCourse()] })),
    ).toBe(false);
  });
});

describe("firstSignInUnion", () => {
  const base = { cursor: 7, now: LATER };

  it("uploads everything to an empty account", () => {
    const local = tables();
    const result = firstSignInUnion({
      ...base,
      local,
      server: [],
      newId: ids(),
    });
    expect(result.tables.plans).toEqual([planA, planB]);
    expect(result.tables.blocks).toBe(local.blocks);
    expect(result.uploaded).toEqual([planA.id, planB.id]);
    expect(result.renamed).toEqual([]);
    expect(result.sync).toEqual({
      cursor: 7,
      docs: {
        [planDocKey(planA.id)]: { rev: 0, dirty: true, inFlight: false },
        [planDocKey(planB.id)]: { rev: 0, dirty: true, inFlight: false },
        [SETTINGS_DOC_KEY]: { rev: 0, dirty: true, inFlight: false },
      },
    });
  });

  it("keeps the account's plans and adds this device's after them, renaming a clash", () => {
    const mine = aPlan({
      id: "plan_mine_01",
      name: "Plan B",
      order: 0,
      courses: [aSavedCourse("ENGL101")],
    });
    const theirs = aPlanSyncDoc({
      rev: 3,
      body: aPlan({ id: "plan_acct_01", name: "Plan B", order: 0 }),
    });
    const result = firstSignInUnion({
      ...base,
      local: tables({ plans: [mine] }),
      server: [theirs],
      newId: ids(),
    });
    expect(result.tables.plans).toEqual([
      theirs.body,
      { ...mine, name: "Plan B (copy)", order: 1, updatedAt: LATER },
    ]);
    expect(result.renamed).toEqual([
      { id: mine.id, from: "Plan B", to: "Plan B (copy)" },
    ]);
    expect(result.sync.docs[planDocKey("plan_acct_01")]).toEqual({
      rev: 3,
      dirty: false,
      inFlight: false,
    });
    expect(result.sync.docs[planDocKey(mine.id)]?.dirty).toBe(true);
  });

  it("never renames onto a name this device already uses", () => {
    const a = aPlan({ id: "plan_mine_01", name: "Plan B", order: 0 });
    const b = aPlan({ id: "plan_mine_02", name: "Plan B (copy)", order: 1 });
    const result = firstSignInUnion({
      ...base,
      local: tables({ plans: [a, b] }),
      server: [
        aPlanSyncDoc({ body: aPlan({ id: "plan_acct_01", name: "Plan B" }) }),
      ],
      newId: ids(),
    });
    expect(result.tables.plans.map((p) => p.name)).toEqual([
      "Plan B",
      "Plan B (copy 2)",
      "Plan B (copy)",
    ]);
  });

  it("keeps this device's tab order in a term the account doesn't have", () => {
    const fall = aPlan({ id: "plan_fall_01", termId: FALL, order: 3 });
    const result = firstSignInUnion({
      ...base,
      local: tables({ plans: [fall] }),
      server: [aPlanSyncDoc()],
      newId: ids(),
    });
    expect(result.tables.plans).toContainEqual(fall);
  });

  it("leaves out an untouched auto-made plan only where the account has plans", () => {
    const empty = aPlan({ id: "plan_auto_01", name: "Plan A", courses: [] });
    const emptyFall = { ...empty, id: "plan_auto_02", termId: FALL };
    const result = firstSignInUnion({
      ...base,
      local: tables({
        plans: [empty, emptyFall],
        chatPlans: { [SPRING]: empty.id, [FALL]: emptyFall.id },
      }),
      server: [aPlanSyncDoc()],
      newId: ids(),
    });
    expect(result.skipped).toEqual([empty.id]);
    expect(result.uploaded).toEqual([emptyFall.id]);
    expect(result.tables.plans.map((p) => p.id)).toEqual([
      emptyFall.id,
      "plan_fixture_a",
    ]);
    expect(result.tables.chatPlans).toEqual({ [FALL]: emptyFall.id });
  });

  it("skips a plan the account already has as it is", () => {
    const doc = aPlanSyncDoc({ rev: 4, body: { ...planA, order: 9 } });
    const result = firstSignInUnion({
      ...base,
      local: tables({ plans: [planA] }),
      server: [doc],
      newId: ids(),
    });
    expect(result.tables.plans).toEqual([doc.body]);
    expect(result.uploaded).toEqual([]);
    expect(result.sync.docs[planDocKey(planA.id)]?.dirty).toBe(false);
  });

  it("keeps both when the account has this plan but different", () => {
    const edited = { ...planA, courses: [aSavedCourse("ENGL101")] };
    const doc = aPlanSyncDoc({ rev: 4, body: planA });
    const result = firstSignInUnion({
      ...base,
      local: tables({ plans: [edited] }),
      server: [doc],
      newId: ids(),
    });
    const copy = {
      ...edited,
      id: "plan_new_0001",
      name: "Plan A (copy)",
      order: 1,
      createdAt: LATER,
      updatedAt: LATER,
    };
    expect(result.tables.plans).toEqual([planA, copy]);
    expect(result.copies).toEqual([{ id: copy.id, of: planA.id }]);
    expect(result.sync.docs[planDocKey(copy.id)]).toEqual({
      rev: 0,
      dirty: true,
      inFlight: false,
    });
  });

  it("brings back a plan the account deleted, based on the tombstone's rev", () => {
    const result = firstSignInUnion({
      ...base,
      local: tables({ plans: [planB] }),
      server: [aPlanSyncDoc({ id: planB.id, rev: 5, body: null })],
      newId: ids(),
    });
    expect(result.tables.plans).toEqual([planB]);
    expect(result.sync.docs[planDocKey(planB.id)]).toEqual({
      rev: 5,
      dirty: true,
      inFlight: false,
    });
  });

  it("merges the settings doc and marks it dirty only if it gained something", () => {
    const server = aSettingsSyncDoc({ rev: 2 });
    const same = firstSignInUnion({
      ...base,
      local: tables({ plans: [] }),
      server: [server],
      newId: ids(),
    });
    expect(same.sync.docs[SETTINGS_DOC_KEY]).toEqual({
      rev: 2,
      dirty: false,
      inFlight: false,
    });
    const gym = aBlock({ id: "block_gym_001", label: "Gym" });
    const more = firstSignInUnion({
      ...base,
      local: tables({
        plans: [],
        blocks: [aBlock(), gym],
        colors: { CMSC351: "pink" },
      }),
      server: [server],
      newId: ids(),
    });
    expect(more.tables.blocks).toEqual([aBlock(), gym]);
    expect(more.tables.colors).toEqual({ CMSC351: "blue" });
    expect(more.sync.docs[SETTINGS_DOC_KEY]?.dirty).toBe(true);
  });
});

describe("planSyncReducer", () => {
  const a = planDocKey(planA.id);
  const b = planDocKey(planB.id);
  const run = (events: PlanSyncEvent[], state = INITIAL_PLAN_SYNC_STATE) =>
    events.reduce(planSyncReducer, state);

  it("marks edits dirty, then in flight, then saved", () => {
    let s = run([{ type: "edited", keys: [a, b] }]);
    expect(docsToPush(s)).toEqual([a, b]);
    expect(hasUnsaved(s)).toBe(true);
    s = run([{ type: "push-started", keys: [a, b] }], s);
    expect(docsToPush(s)).toEqual([]);
    expect(docsInFlight(s)).toEqual([a, b]);
    s = run(
      [
        { type: "push-accepted", key: a, rev: 8 },
        { type: "push-accepted", key: b, rev: 9 },
      ],
      s,
    );
    expect(s.docs[a]).toEqual({ rev: 8, dirty: false, inFlight: false });
    expect(baseRev(s, a)).toBe(8);
    expect(baseRev(s, planDocKey("plan_new_0001"))).toBe(0);
    expect(hasUnsaved(s)).toBe(false);
  });

  it("keeps an edit made while a push is out", () => {
    const s = run([
      { type: "edited", keys: [a] },
      { type: "push-started", keys: [a] },
      { type: "edited", keys: [a] },
      { type: "push-accepted", key: a, rev: 3 },
    ]);
    expect(s.docs[a]).toEqual({ rev: 3, dirty: true, inFlight: false });
    expect(docsToPush(s)).toEqual([a]);
  });

  it("only starts pushes for dirty docs that aren't already out", () => {
    const s = run([
      { type: "edited", keys: [a] },
      { type: "push-started", keys: [a] },
    ]);
    expect(run([{ type: "push-started", keys: [a, b] }], s)).toBe(s);
  });

  it("makes a failed push dirty again", () => {
    const s = run([
      { type: "edited", keys: [a] },
      { type: "push-started", keys: [a] },
      { type: "push-failed", keys: [a, b] },
    ]);
    expect(s.docs[a]).toEqual({ rev: 0, dirty: true, inFlight: false });
    expect(s.docs[b]).toBeUndefined();
  });

  it("moves a conflicted doc onto the server's rev, and queues the copy", () => {
    const s = run([
      { type: "edited", keys: [a] },
      { type: "push-started", keys: [a] },
      { type: "push-conflict", key: a, rev: 12, pushAgain: false, copy: b },
    ]);
    expect(s.docs[a]).toEqual({ rev: 12, dirty: false, inFlight: false });
    expect(s.docs[b]).toEqual({ rev: 0, dirty: true, inFlight: false });
    const again = run(
      [{ type: "push-conflict", key: a, rev: 13, pushAgain: true }],
      s,
    );
    expect(again.docs[a]).toEqual({ rev: 13, dirty: true, inFlight: false });
  });

  it("applies pulled docs only where nothing is unsaved, and moves the cursor", () => {
    let s: PlanSyncState = run([
      { type: "pulled", docs: [{ key: a, rev: 4 }], cursor: 4 },
      { type: "edited", keys: [b] },
    ]);
    expect(shouldApplyPulled(s, a, 4)).toBe(false);
    expect(shouldApplyPulled(s, a, 5)).toBe(true);
    expect(shouldApplyPulled(s, b, 9)).toBe(false);
    expect(shouldApplyPulled(s, SETTINGS_DOC_KEY, 1)).toBe(true);
    s = run(
      [
        {
          type: "pulled",
          docs: [
            { key: a, rev: 6 },
            { key: b, rev: 9 },
          ],
          cursor: 9,
        },
      ],
      s,
    );
    expect(s.cursor).toBe(9);
    expect(s.docs[a]).toEqual({ rev: 6, dirty: false, inFlight: false });
    expect(s.docs[b]).toEqual({ rev: 0, dirty: true, inFlight: false });
    expect(run([{ type: "pulled", docs: [], cursor: 3 }], s)).toBe(s);
  });

  it("returns the same state for events that change nothing", () => {
    const s = run([{ type: "edited", keys: [a] }]);
    expect(run([{ type: "edited", keys: [a] }], s)).toBe(s);
    expect(run([{ type: "push-failed", keys: [a] }], s)).toBe(s);
  });
});
