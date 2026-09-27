import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  aBlock,
  aFourYear,
  aFourYearEntry,
  aFourYearSyncDoc,
  aPlan,
  aPlanCourse,
  aPlanSyncDoc,
  aSavedCourse,
  aSectionSnapshot,
  aSettingsDoc,
  aSettingsSyncDoc,
} from "~/fixtures";
import { type FourYearAction, fourYearReducer } from "../four-year/reducer";
import { type PlanAction, plansReducer } from "../plans";
import {
  type Block,
  DEFAULT_TRAVEL_SETTINGS,
  type Plan,
  type PlanCourse,
  PlanSchema,
  type SettingsDoc,
} from "../schema";
import { type FourYearDoc, FourYearDocSchema } from "../schema/four-year";
import {
  fourYearAfterConflict,
  mergeSettings,
  plansAfterConflict,
  resolveFourYearConflict,
  resolvePlanConflict,
  sameFourYearContent,
  samePlanContent,
} from "./conflict";
import {
  applyDoc,
  changedDocKeys,
  type DeviceSyncDoc,
  type DocKey,
  docBody,
  docKeyOf,
  fourYearDocKey,
  parseDocKey,
  planDocKey,
  type SyncedTables,
  settingsDocOf,
  withSettingsDoc,
} from "./docs";
import { sameJson } from "./equal";
import {
  firstSignInUnion,
  isUntouchedFourYear,
  isUntouchedPlan,
} from "./first-sign-in";
import {
  baseRev,
  docsToPush,
  hasUnsaved,
  INITIAL_PLAN_SYNC_STATE,
  type PlanSyncEvent,
  type PlanSyncState,
  planSyncReducer,
  shouldApplyPulled,
} from "./state";

// Properties of plan sync: the first sign-in and a conflict never drop a
// plan or a four-year plan, running either twice changes nothing, and two
// devices syncing through a model server end up with the same plans and
// four-year plans without losing unsaved work.

const SPRING = "202701";
const FALL = "202608";
const NOW = "2026-09-26T09:00:00.000Z";
const COURSES = ["CMSC351", "MATH240", "ENGL101", "STAT400"];
const NAMES = ["Plan A", "Plan B", "Fall", "Plan A (copy)", "Ideas"];

const course: fc.Arbitrary<PlanCourse> = fc
  .tuple(
    fc.constantFrom(...COURSES),
    fc.constantFrom<"0101" | "0201" | null>("0101", "0201", null),
  )
  .map(([code, section]) =>
    section === null
      ? aSavedCourse(code)
      : aPlanCourse({ courseCode: code, sectionCode: section }),
  );

const courses = fc.uniqueArray(course, {
  selector: (c) => c.courseCode,
  maxLength: 3,
});

function planArb(idPool: readonly string[]): fc.Arbitrary<Plan> {
  return fc
    .record({
      id: fc.constantFrom(...idPool),
      termId: fc.constantFrom(SPRING, FALL),
      name: fc.constantFrom(...NAMES),
      order: fc.integer({ min: 0, max: 3 }),
      courses,
    })
    .map((p) => aPlan(p));
}

const plans = (idPool: readonly string[]) =>
  fc.uniqueArray(planArb(idPool), { selector: (p) => p.id, maxLength: 5 });

const LOCAL_IDS = [
  "plan_mine_01",
  "plan_mine_02",
  "plan_both_01",
  "plan_both_02",
];
const SERVER_IDS = [
  "plan_acct_01",
  "plan_acct_02",
  "plan_both_01",
  "plan_both_02",
];

const FOUR_YEAR_NAMES = ["My plan", "My plan 2", "CS major", "My plan (copy)"];
const FOUR_YEAR_CODES = ["CMSC131", "CMSC132", "MATH140"];

/** A block per code, so a doc never holds the same entry id twice. */
const fourYearEntry = (code: string) =>
  aFourYearEntry({ id: `entry_${code}`, code });

function fourYearArb(idPool: readonly string[]): fc.Arbitrary<FourYearDoc> {
  return fc
    .record({
      id: fc.constantFrom(...idPool),
      name: fc.constantFrom(...FOUR_YEAR_NAMES),
      firstTermId: fc.constantFrom("202508", "202608"),
      codes: fc.subarray(FOUR_YEAR_CODES, { maxLength: 2 }),
      graded: fc.boolean(),
      template: fc.option(
        fc.constant({ id: "cmsc-2026", department: "CMSC", year: "2026" }),
        { nil: null },
      ),
    })
    .map(({ codes, graded, ...d }) => {
      const entries = codes.map(fourYearEntry);
      const first = entries[0];
      return aFourYear({
        ...d,
        entries,
        // Grades sync like the rest of the doc (V3 §2.5).
        grades: graded && first ? { [first.id]: "A" } : {},
      });
    });
}

const fourYearDocs = (idPool: readonly string[]) =>
  fc.uniqueArray(fourYearArb(idPool), { selector: (d) => d.id, maxLength: 3 });

const LOCAL_FOUR_YEAR_IDS = [
  "fouryear_mine_01",
  "fouryear_mine_02",
  "fouryear_both_01",
];
const SERVER_FOUR_YEAR_IDS = [
  "fouryear_acct_01",
  "fouryear_acct_02",
  "fouryear_both_01",
];

/**
 * Two four-year docs hold the same work: semesters, entries, grades and
 * template, whatever they're called (a copy or a rename changes the name).
 */
function sameFourYearWork(a: FourYearDoc, b: FourYearDoc): boolean {
  return (
    a.firstTermId === b.firstTermId &&
    sameJson(a.entries, b.entries) &&
    sameJson(a.grades, b.grades) &&
    sameJson(a.template, b.template)
  );
}

const blockArb: fc.Arbitrary<Block> = fc
  .record({
    id: fc.constantFrom("block_lunch_1", "block_work_01", "block_gym_001"),
    label: fc.constantFrom("Lunch", "Work", "Gym"),
    start: fc.constantFrom(480, 720),
  })
  .map(({ start, ...b }) => aBlock({ ...b, start, end: start + 60 }));

const settingsArb: fc.Arbitrary<SettingsDoc> = fc
  .record({
    blocks: fc.uniqueArray(blockArb, { selector: (b) => b.id, maxLength: 3 }),
    colors: fc.dictionary(
      fc.constantFrom(...COURSES),
      fc.constantFrom("blue" as const, "pink" as const, "teal" as const),
      { maxKeys: 3 },
    ),
    accessible: fc.boolean(),
    chat: fc.option(fc.constantFrom(...LOCAL_IDS, ...SERVER_IDS), {
      nil: undefined,
    }),
    ai: fc.option(fc.boolean(), { nil: undefined }),
    // Another product's pref, one this build doesn't know.
    later: fc.option(fc.constantFrom("week", "day"), { nil: undefined }),
  })
  .map(({ accessible, chat, ai, later, ...s }) =>
    aSettingsDoc({
      ...s,
      travel: { ...DEFAULT_TRAVEL_SETTINGS, accessible },
      chatPlans: chat ? { [SPRING]: chat } : {},
      prefs: {
        ...(ai === undefined ? {} : { ai: { features: ai } }),
        ...(later === undefined ? {} : { later: { view: later } }),
      },
    }),
  );

const serverDocs: fc.Arbitrary<DeviceSyncDoc[]> = fc
  .tuple(
    plans(SERVER_IDS),
    fc.subarray(SERVER_IDS),
    fc.option(settingsArb, { nil: undefined }),
    fourYearDocs(SERVER_FOUR_YEAR_IDS),
    fc.subarray(SERVER_FOUR_YEAR_IDS),
  )
  .map(([live, dead, settings, liveFourYear, deadFourYear]) => {
    let rev = 0;
    const docs: DeviceSyncDoc[] = live.map((body) =>
      aPlanSyncDoc({ body, rev: ++rev }),
    );
    for (const id of dead)
      if (!live.some((p) => p.id === id))
        docs.push(aPlanSyncDoc({ id, body: null, rev: ++rev }));
    if (settings) docs.push(aSettingsSyncDoc({ body: settings, rev: ++rev }));
    for (const body of liveFourYear)
      docs.push(aFourYearSyncDoc({ body, rev: ++rev }));
    for (const id of deadFourYear)
      if (!liveFourYear.some((d) => d.id === id))
        docs.push(aFourYearSyncDoc({ id, body: null, rev: ++rev }));
    return docs;
  });

function localTables(
  p: Plan[],
  s: SettingsDoc,
  fourYear: FourYearDoc[] = [],
): SyncedTables {
  return {
    plans: p,
    blocks: s.blocks,
    colors: s.colors,
    travel: s.travel,
    chatPlans: s.chatPlans,
    fourYear,
    prefs: s.prefs,
  };
}

const localArb = fc
  .tuple(plans(LOCAL_IDS), settingsArb, fourYearDocs(LOCAL_FOUR_YEAR_IDS))
  .map(([p, s, f]) => localTables(p, s, f));

const accountFourYear = (server: readonly DeviceSyncDoc[]) =>
  server.flatMap((d) => (d.kind === "four-year" && d.body ? [d.body] : []));

function counter(prefix: string) {
  let n = 0;
  return () => `${prefix}_${String(++n).padStart(4, "0")}`;
}

function sameWork(a: Plan, b: Plan): boolean {
  return a.termId === b.termId && sameJson(a.courses, b.courses);
}

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let s = seed;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

describe("the first sign-in", () => {
  const union = (local: SyncedTables, server: readonly DeviceSyncDoc[]) =>
    firstSignInUnion({
      local,
      server,
      cursor: server.length,
      newId: counter("plan_new"),
      now: NOW,
    });

  it("never drops a plan, a course, a block or a color", () => {
    fc.assert(
      fc.property(localArb, serverDocs, (local, server) => {
        const result = union(local, server);
        const out = result.tables.plans;
        for (const doc of server)
          if (doc.kind === "plan" && doc.body)
            expect(out).toContainEqual(doc.body);
        const accountTerms = new Set(
          server.flatMap((d) =>
            d.kind === "plan" && d.body ? [d.body.termId] : [],
          ),
        );
        for (const plan of local.plans) {
          const kept = out.some(
            (p) =>
              (p.id === plan.id || result.copies.some((c) => c.id === p.id)) &&
              sameWork(p, plan),
          );
          const leftOut =
            result.skipped.includes(plan.id) &&
            isUntouchedPlan(plan) &&
            accountTerms.has(plan.termId);
          expect(kept || leftOut).toBe(true);
        }
        for (const block of local.blocks)
          expect(result.tables.blocks.some((b) => b.id === block.id)).toBe(
            true,
          );
        for (const code of Object.keys(local.colors))
          expect(result.tables.colors[code]).toBeDefined();
        for (const plan of out)
          expect(PlanSchema.safeParse(plan).success).toBe(true);

        const account = accountFourYear(server);
        const fourYear = result.tables.fourYear;
        for (const doc of account) expect(fourYear).toContainEqual(doc);
        for (const doc of local.fourYear) {
          const kept = fourYear.some(
            (d) =>
              (d.id === doc.id ||
                result.fourYear.copies.some((c) => c.id === d.id)) &&
              sameFourYearWork(d, doc),
          );
          const leftOut =
            result.fourYear.skipped.includes(doc.id) &&
            isUntouchedFourYear(doc) &&
            account.length > 0;
          expect(kept || leftOut).toBe(true);
        }
        for (const doc of fourYear)
          expect(FourYearDocSchema.safeParse(doc).success).toBe(true);
      }),
    );
  });

  it("never gives an uploaded plan the name of one of the account's in its term", () => {
    fc.assert(
      fc.property(localArb, serverDocs, (local, server) => {
        const result = union(local, server);
        const account = server.flatMap((d) =>
          d.kind === "plan" && d.body ? [d.body] : [],
        );
        const added = new Set([
          ...result.uploaded,
          ...result.copies.map((c) => c.id),
        ]);
        for (const plan of result.tables.plans) {
          if (!added.has(plan.id)) continue;
          const clash = account.some(
            (a) =>
              a.id !== plan.id &&
              a.termId === plan.termId &&
              a.name === plan.name,
          );
          expect(clash).toBe(false);
        }
        const accountDocs = accountFourYear(server);
        const addedFourYear = new Set([
          ...result.fourYear.uploaded,
          ...result.fourYear.copies.map((c) => c.id),
        ]);
        for (const doc of result.tables.fourYear) {
          if (!addedFourYear.has(doc.id)) continue;
          expect(
            accountDocs.some((a) => a.id !== doc.id && a.name === doc.name),
          ).toBe(false);
        }
      }),
    );
  });

  it("changes nothing when run again once its uploads have landed", () => {
    fc.assert(
      fc.property(localArb, serverDocs, (local, server) => {
        const first = union(local, server);
        let rev = server.length;
        const landed = new Map(server.map((d) => [docKeyOf(d), d]));
        for (const [key, doc] of Object.entries(first.sync.docs)) {
          if (!doc?.dirty) continue;
          const k = key as DocKey;
          const body = docBody(first.tables, k);
          const parsed = parseDocKey(k);
          landed.set(
            k,
            parsed.kind === "settings"
              ? aSettingsSyncDoc({
                  body: settingsDocOf(first.tables),
                  rev: ++rev,
                })
              : parsed.kind === "four-year"
                ? aFourYearSyncDoc({
                    id: parsed.id,
                    body: body as FourYearDoc | null,
                    rev: ++rev,
                  })
                : aPlanSyncDoc({
                    id: parsed.id,
                    body: body as Plan | null,
                    rev: ++rev,
                  }),
          );
        }
        const second = union(first.tables, [...landed.values()]);
        expect(second.tables.plans).toEqual(first.tables.plans);
        expect(second.tables.fourYear).toEqual(first.tables.fourYear);
        expect(second.fourYear.uploaded).toEqual([]);
        expect(second.fourYear.copies).toEqual([]);
        expect(
          sameJson(settingsDocOf(second.tables), settingsDocOf(first.tables)),
        ).toBe(true);
        expect(hasUnsaved(second.sync)).toBe(false);
        expect(second.uploaded).toEqual([]);
        expect(second.copies).toEqual([]);
      }),
    );
  });

  it("doesn't depend on the order plans and docs arrive in", () => {
    fc.assert(
      fc.property(localArb, serverDocs, fc.nat(), (local, server, seed) => {
        const a = union(local, server);
        const b = union(
          {
            ...local,
            plans: shuffled(local.plans, seed),
            fourYear: shuffled(local.fourYear, seed + 2),
          },
          shuffled(server, seed + 1),
        );
        expect(b.tables.plans).toEqual(a.tables.plans);
        expect(b.tables.fourYear).toEqual(a.tables.fourYear);
        expect(b.fourYear).toEqual(a.fourYear);
        expect(b.sync).toEqual(a.sync);
        expect(b.uploaded).toEqual(a.uploaded);
        expect(b.renamed).toEqual(a.renamed);
      }),
    );
  });
});

describe("a plan conflict", () => {
  const pair = fc.tuple(
    fc.option(planArb(["plan_both_01"]), { nil: null }),
    fc.option(planArb(["plan_both_01"]), { nil: null }),
    plans(LOCAL_IDS),
  );

  it("never loses this device's version", () => {
    fc.assert(
      fc.property(pair, ([local, server, others]) => {
        const mine = others.filter((p) => p.id !== "plan_both_01");
        const before = local ? [...mine, local] : mine;
        const result = resolvePlanConflict({
          local,
          server,
          plans: before,
          copyId: "plan_copy_01",
          now: NOW,
        });
        const after = plansAfterConflict(before, "plan_both_01", result);
        if (local) expect(after.some((p) => sameWork(p, local))).toBe(true);
        if (server) expect(after.some((p) => sameWork(p, server))).toBe(true);
        if (result.kind === "keep-both") {
          const clash = after.some(
            (p) =>
              p.id !== result.copy.id &&
              p.termId === result.copy.termId &&
              p.name === result.copy.name,
          );
          expect(clash).toBe(false);
          expect(PlanSchema.safeParse(result.copy).success).toBe(true);
        }
      }),
    );
  });

  it("is a no-op when both sides already agree", () => {
    fc.assert(
      fc.property(planArb(["plan_both_01"]), (plan) => {
        expect(
          resolvePlanConflict({
            local: plan,
            server: plan,
            plans: [plan],
            copyId: "plan_copy_01",
            now: NOW,
          }),
        ).toEqual({ kind: "take-server", plan });
        expect(samePlanContent(plan, { ...plan, order: plan.order + 1 })).toBe(
          true,
        );
      }),
    );
  });
});

describe("a four-year doc conflict", () => {
  const ID = "fouryear_both_01";
  const pair = fc.tuple(
    fc.option(fourYearArb([ID]), { nil: null }),
    fc.option(fourYearArb([ID]), { nil: null }),
    fourYearDocs(LOCAL_FOUR_YEAR_IDS),
  );

  it("never loses this device's version, grades included", () => {
    fc.assert(
      fc.property(pair, ([local, server, others]) => {
        const mine = others.filter((d) => d.id !== ID);
        const before = local ? [...mine, local] : mine;
        const result = resolveFourYearConflict({
          local,
          server,
          docs: before,
          copyId: "fouryear_copy_01",
          now: NOW,
        });
        const after = fourYearAfterConflict(before, ID, result);
        if (local)
          expect(after.some((d) => sameFourYearWork(d, local))).toBe(true);
        if (server)
          expect(after.some((d) => sameFourYearWork(d, server))).toBe(true);
        if (result.kind === "keep-both") {
          expect(
            after.some(
              (d) => d.id !== result.copy.id && d.name === result.copy.name,
            ),
          ).toBe(false);
          expect(FourYearDocSchema.safeParse(result.copy).success).toBe(true);
        }
      }),
    );
  });

  it("is a no-op when both sides already agree", () => {
    fc.assert(
      fc.property(fourYearArb([ID]), (doc) => {
        expect(
          resolveFourYearConflict({
            local: doc,
            server: { ...doc, updatedAt: NOW },
            docs: [doc],
            copyId: "fouryear_copy_01",
            now: NOW,
          }).kind,
        ).toBe("take-server");
        expect(sameFourYearContent(doc, { ...doc, createdAt: NOW })).toBe(true);
      }),
    );
  });
});

describe("the settings doc's merge", () => {
  it("returns either side when the other didn't change, and agrees with itself", () => {
    fc.assert(
      fc.property(settingsArb, settingsArb, settingsArb, (base, a, b) => {
        expect(sameJson(mergeSettings({ base, local: a, server: a }), a)).toBe(
          true,
        );
        expect(
          sameJson(mergeSettings({ base, local: base, server: b }), b),
        ).toBe(true);
        expect(
          sameJson(mergeSettings({ base, local: a, server: base }), a),
        ).toBe(true);
      }),
    );
  });

  it("with no base, keeps every key from both sides", () => {
    fc.assert(
      fc.property(settingsArb, settingsArb, (local, server) => {
        const merged = mergeSettings({ base: null, local, server });
        const ids = new Set(merged.blocks.map((b) => b.id));
        for (const b of [...local.blocks, ...server.blocks])
          expect(ids.has(b.id)).toBe(true);
        for (const code of [
          ...Object.keys(local.colors),
          ...Object.keys(server.colors),
        ])
          expect(merged.colors[code]).toBeDefined();
        expect(merged.travel).toEqual(server.travel);
      }),
    );
  });
});

describe("the sync flags", () => {
  const keys: DocKey[] = [
    planDocKey("plan_mine_01"),
    planDocKey("plan_mine_02"),
    fourYearDocKey("fouryear_mine_01"),
    "settings",
  ];
  const event: fc.Arbitrary<PlanSyncEvent> = fc.oneof(
    fc.record({
      type: fc.constant("edited" as const),
      keys: fc.subarray(keys),
    }),
    fc.record({
      type: fc.constant("push-started" as const),
      keys: fc.subarray(keys),
    }),
    fc.record({
      type: fc.constant("push-failed" as const),
      keys: fc.subarray(keys),
    }),
    fc.record({
      type: fc.constant("push-accepted" as const),
      key: fc.constantFrom(...keys),
      rev: fc.integer({ min: 1, max: 50 }),
    }),
    fc.record({
      type: fc.constant("pulled" as const),
      docs: fc.array(
        fc.record({
          key: fc.constantFrom(...keys),
          rev: fc.integer({ min: 1, max: 50 }),
        }),
        { maxLength: 3 },
      ),
      cursor: fc.integer({ min: 0, max: 50 }),
    }),
  );

  it("never forgets an edit until a push that carried it is accepted", () => {
    fc.assert(
      fc.property(fc.array(event, { maxLength: 30 }), (events) => {
        let state: PlanSyncState = INITIAL_PLAN_SYNC_STATE;
        // Per doc: edits made, and how many of them the push in flight carries.
        const edits = new Map<DocKey, number>();
        const carried = new Map<DocKey, number>();
        const saved = new Map<DocKey, number>();
        for (const e of events) {
          // The engine only reports answers to pushes it made.
          if (e.type === "push-accepted" && !state.docs[e.key]?.inFlight)
            continue;
          if (e.type === "push-started")
            for (const k of e.keys)
              if (state.docs[k]?.dirty && !state.docs[k]?.inFlight)
                carried.set(k, edits.get(k) ?? 0);
          if (e.type === "push-accepted")
            saved.set(e.key, carried.get(e.key) ?? 0);
          if (e.type === "edited")
            for (const k of e.keys) edits.set(k, (edits.get(k) ?? 0) + 1);
          const before = state;
          state = planSyncReducer(state, e);
          expect(state.cursor).toBeGreaterThanOrEqual(before.cursor);
          for (const k of keys) {
            const unsaved = (edits.get(k) ?? 0) > (saved.get(k) ?? 0);
            const d = state.docs[k];
            if (unsaved) expect(Boolean(d?.dirty || d?.inFlight)).toBe(true);
            expect(docsToPush(state).includes(k)).toBe(
              Boolean(d?.dirty && !d.inFlight),
            );
          }
        }
      }),
    );
  });
});

// ---------- two devices and a model server ----------

class ModelServer {
  readonly docs = new Map<DocKey, DeviceSyncDoc>();
  private head = 0;

  push(
    key: DocKey,
    base: number,
    body: Plan | SettingsDoc | FourYearDoc | null,
  ): { ok: true; rev: number } | { ok: false; doc: DeviceSyncDoc } {
    const current = this.docs.get(key);
    if (current && current.rev !== base) return { ok: false, doc: current };
    if (!current && base !== 0) throw new Error(`no doc ${key} at rev ${base}`);
    const rev = ++this.head;
    const parsed = parseDocKey(key);
    this.docs.set(
      key,
      parsed.kind === "settings"
        ? aSettingsSyncDoc({ rev, body: body as SettingsDoc })
        : parsed.kind === "four-year"
          ? aFourYearSyncDoc({
              id: parsed.id,
              rev,
              body: body as FourYearDoc | null,
            })
          : aPlanSyncDoc({ id: parsed.id, rev, body: body as Plan | null }),
    );
    return { ok: true, rev };
  }

  pull(since: number): { docs: DeviceSyncDoc[]; cursor: number } {
    const docs = [...this.docs.values()]
      .filter((d) => d.rev > since)
      .sort((a, b) => a.rev - b.rev);
    return { docs, cursor: this.head };
  }

  livePlans(): Plan[] {
    return [...this.docs.values()]
      .flatMap((d) => (d.kind === "plan" && d.body ? [d.body] : []))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  liveFourYear(): FourYearDoc[] {
    return [...this.docs.values()]
      .flatMap((d) => (d.kind === "four-year" && d.body ? [d.body] : []))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  }
}

class Device {
  tables: SyncedTables;
  sync: PlanSyncState = INITIAL_PLAN_SYNC_STATE;
  /** The settings doc as last saved or pulled: the merge's base. */
  settingsBase: SettingsDoc | null = null;
  readonly newId: () => string;

  constructor(
    readonly name: string,
    readonly server: ModelServer,
  ) {
    this.newId = counter(`${name}_copy`);
    this.tables = {
      plans: [],
      blocks: [],
      colors: {},
      travel: DEFAULT_TRAVEL_SETTINGS,
      chatPlans: {},
      fourYear: [],
      prefs: {},
    };
  }

  edit(action: PlanAction | FourYearAction): void {
    const next =
      "docId" in action || action.type === "create"
        ? {
            ...this.tables,
            fourYear: fourYearReducer(
              { docs: this.tables.fourYear },
              action as FourYearAction,
            ).docs,
          }
        : {
            ...this.tables,
            ...plansReducer(
              {
                plans: this.tables.plans,
                blocks: this.tables.blocks,
                colors: this.tables.colors,
              },
              action as PlanAction,
            ),
          };
    const keys = changedDocKeys(this.tables, next);
    this.tables = next;
    if (keys.length)
      this.sync = planSyncReducer(this.sync, { type: "edited", keys });
  }

  push(): void {
    const keys = docsToPush(this.sync);
    this.sync = planSyncReducer(this.sync, { type: "push-started", keys });
    for (const key of keys) {
      const body = docBody(this.tables, key);
      const answer = this.server.push(key, baseRev(this.sync, key), body);
      if (answer.ok) {
        if (key === "settings") this.settingsBase = body as SettingsDoc;
        this.sync = planSyncReducer(this.sync, {
          type: "push-accepted",
          key,
          rev: answer.rev,
        });
        continue;
      }
      const doc = answer.doc;
      if (doc.kind === "four-year") {
        const result = resolveFourYearConflict({
          local: body as FourYearDoc | null,
          server: doc.body,
          docs: this.tables.fourYear,
          copyId: this.newId(),
          now: NOW,
        });
        this.tables = {
          ...this.tables,
          fourYear: fourYearAfterConflict(this.tables.fourYear, doc.id, result),
        };
        this.sync = planSyncReducer(this.sync, {
          type: "push-conflict",
          key,
          rev: doc.rev,
          pushAgain: result.kind === "keep-local",
          ...(result.kind === "keep-both"
            ? { copy: fourYearDocKey(result.copy.id) }
            : {}),
        });
        continue;
      }
      if (doc.kind === "settings") {
        const merged = mergeSettings({
          base: this.settingsBase,
          local: body as SettingsDoc,
          server: doc.body,
        });
        this.tables = withSettingsDoc(this.tables, merged);
        this.settingsBase = doc.body;
        this.sync = planSyncReducer(this.sync, {
          type: "push-conflict",
          key,
          rev: doc.rev,
          pushAgain: !sameJson(merged, doc.body),
        });
        continue;
      }
      const result = resolvePlanConflict({
        local: body as Plan | null,
        server: doc.body,
        plans: this.tables.plans,
        copyId: this.newId(),
        now: NOW,
      });
      this.tables = {
        ...this.tables,
        plans: plansAfterConflict(this.tables.plans, doc.id, result),
      };
      this.sync = planSyncReducer(this.sync, {
        type: "push-conflict",
        key,
        rev: doc.rev,
        pushAgain: result.kind === "keep-local",
        ...(result.kind === "keep-both"
          ? { copy: planDocKey(result.copy.id) }
          : {}),
      });
    }
  }

  pull(): void {
    const { docs, cursor } = this.server.pull(this.sync.cursor);
    for (const doc of docs) {
      if (!shouldApplyPulled(this.sync, docKeyOf(doc), doc.rev)) continue;
      this.tables = applyDoc(this.tables, doc);
      if (doc.kind === "settings") this.settingsBase = doc.body;
    }
    this.sync = planSyncReducer(this.sync, {
      type: "pulled",
      docs: docs.map((d) => ({ key: docKeyOf(d), rev: d.rev })),
      cursor,
    });
  }

  sortedPlans(): Plan[] {
    return [...this.tables.plans].sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  sortedFourYear(): FourYearDoc[] {
    return [...this.tables.fourYear].sort((a, b) => (a.id < b.id ? -1 : 1));
  }
}

type Step =
  | { device: 0 | 1; kind: "push" | "pull" }
  | {
      device: 0 | 1;
      kind: "edit";
      action: (d: Device) => PlanAction | FourYearAction | null;
    };

const pickPlan = (d: Device, i: number) =>
  d.tables.plans.length ? d.tables.plans[i % d.tables.plans.length] : undefined;

const pickFourYear = (d: Device, i: number) =>
  d.tables.fourYear.length
    ? d.tables.fourYear[i % d.tables.fourYear.length]
    : undefined;

/** Edits to four-year docs: the same shapes of change as the plans get. */
const fourYearStepArb: fc.Arbitrary<Step> = fc
  .tuple(
    fc.constantFrom<0 | 1>(0, 1),
    fc.nat(9),
    fc.constantFrom(...FOUR_YEAR_CODES),
    fc.constantFrom("create", "rename", "delete", "add", "remove", "import"),
    fc.constantFrom(...FOUR_YEAR_NAMES),
  )
  .map(
    ([device, i, code, what, name]): Step => ({
      device,
      kind: "edit",
      action: (d) => {
        const doc = pickFourYear(d, i);
        switch (what) {
          case "create":
            return {
              type: "create",
              id: `${d.name}_fouryear_${String(i).padStart(3, "0")}`,
              firstTermId: i % 2 ? "202508" : "202608",
              now: NOW,
            };
          case "rename":
            return doc
              ? { type: "rename", docId: doc.id, name, now: NOW }
              : null;
          case "delete":
            return doc ? { type: "delete", docId: doc.id } : null;
          case "add":
            return doc
              ? {
                  type: "add",
                  docId: doc.id,
                  entry: fourYearEntry(code),
                  now: NOW,
                }
              : null;
          case "remove":
            return doc
              ? {
                  type: "remove",
                  docId: doc.id,
                  entryId: fourYearEntry(code).id,
                  now: NOW,
                }
              : null;
          default:
            // A transcript import: the only way grades come in (V3 §2.5).
            return doc
              ? {
                  type: "import",
                  docId: doc.id,
                  replace: [],
                  entries: [fourYearEntry(code)],
                  grades: { [fourYearEntry(code).id]: "B+" },
                  now: NOW,
                }
              : null;
        }
      },
    }),
  );

const stepArb: fc.Arbitrary<Step> = fc.oneof(
  fourYearStepArb,
  fc.record({
    device: fc.constantFrom<0 | 1>(0, 1),
    kind: fc.constantFrom<"push" | "pull">("push", "pull"),
  }),
  fc
    .tuple(
      fc.constantFrom<0 | 1>(0, 1),
      fc.nat(9),
      fc.constantFrom(...COURSES),
      fc.constantFrom("create", "rename", "delete", "add", "remove", "block"),
      fc.constantFrom(...NAMES),
    )
    .map(
      ([device, i, code, what, name]): Step => ({
        device,
        kind: "edit",
        action: (d) => {
          const plan = pickPlan(d, i);
          switch (what) {
            case "create":
              return {
                type: "plan/create",
                id: `${d.name}_plan_${String(i).padStart(3, "0")}`,
                termId: i % 2 ? FALL : SPRING,
                now: NOW,
              };
            case "block":
              return {
                type: "block/add",
                block: aBlock({
                  id: `${d.name}_block_${String(i).padStart(3, "0")}`,
                }),
              };
            case "rename":
              return plan
                ? { type: "plan/rename", planId: plan.id, name, now: NOW }
                : null;
            case "delete":
              return plan ? { type: "plan/delete", planId: plan.id } : null;
            case "add":
              return plan
                ? {
                    type: "course/add",
                    planId: plan.id,
                    courseCode: code,
                    section:
                      i % 2
                        ? null
                        : { code: "0101", snapshot: aSectionSnapshot() },
                    now: NOW,
                  }
                : null;
            default:
              return plan
                ? {
                    type: "course/remove",
                    planId: plan.id,
                    courseCode: code,
                    now: NOW,
                  }
                : null;
          }
        },
      }),
    ),
);

/**
 * Plans with work that hadn't reached the server when the devices went
 * quiet. A dirty plan the account already holds as it is here (another
 * device made the same edit and saved it) isn't unsaved: the server's
 * version is simply taken (`resolvePlanConflict`), so a delete made after
 * that save may remove it, as it removes the saved one.
 */
function unsavedWork(d: Device): Plan[] {
  return d.tables.plans.filter((p) => {
    if (!d.sync.docs[planDocKey(p.id)]?.dirty) return false;
    const held = d.server.docs.get(planDocKey(p.id));
    return !(
      held?.kind === "plan" &&
      held.body !== null &&
      samePlanContent(held.body, p)
    );
  });
}

/** The same for four-year docs: dirty, and not held as they are here. */
function unsavedFourYear(d: Device): FourYearDoc[] {
  return d.tables.fourYear.filter((doc) => {
    if (!d.sync.docs[fourYearDocKey(doc.id)]?.dirty) return false;
    const held = d.server.docs.get(fourYearDocKey(doc.id));
    return !(
      held?.kind === "four-year" &&
      held.body !== null &&
      sameFourYearContent(held.body, doc)
    );
  });
}

describe("two devices syncing through the server", () => {
  it("lets a delete remove a plan whose unsaved edit the account already holds", () => {
    const server = new ModelServer();
    const [a, b] = [new Device("dev0", server), new Device("dev1", server)];
    const id = "dev1_plan_000";
    b.edit({ type: "plan/create", id, termId: SPRING, now: NOW });
    b.edit({
      type: "course/add",
      planId: id,
      courseCode: "STAT400",
      section: null,
      now: NOW,
    });
    b.push();
    a.pull();
    // Both devices remove the course; only the second has saved it when it
    // deletes the plan, knowing that version.
    const remove: PlanAction = {
      type: "course/remove",
      planId: id,
      courseCode: "STAT400",
      now: NOW,
    };
    b.edit(remove);
    b.push();
    a.edit(remove);
    b.edit({ type: "plan/delete", planId: id });
    expect(a.sync.docs[planDocKey(id)]?.dirty).toBe(true);
    expect(unsavedWork(a)).toEqual([]);

    a.push();
    b.push();
    a.pull();
    expect(server.livePlans()).toEqual([]);
    expect(a.tables.plans).toEqual([]);
    expect(hasUnsaved(a.sync) || hasUnsaved(b.sync)).toBe(false);
  });

  it("end up with the same plans and never drop unsaved work", () => {
    fc.assert(
      fc.property(
        fc.array(stepArb, { minLength: 20, maxLength: 60 }),
        (steps) => {
          const server = new ModelServer();
          const devices = [
            new Device("dev0", server),
            new Device("dev1", server),
          ] as const;
          for (const step of steps) {
            const d = devices[step.device];
            if (step.kind === "edit") {
              const action = step.action(d);
              if (action) d.edit(action);
            } else if (step.kind === "push") d.push();
            else d.pull();
          }

          const unsavedPlans = devices.flatMap(unsavedWork);
          const unsavedDocs = devices.flatMap(unsavedFourYear);
          const unsavedBlocks = devices.flatMap((d) =>
            d.sync.docs.settings?.dirty ? d.tables.blocks.map((b) => b.id) : [],
          );

          for (let round = 0; round < 6; round++)
            for (const d of devices) {
              d.push();
              d.pull();
            }
          for (const d of devices) {
            expect(hasUnsaved(d.sync)).toBe(false);
            expect(d.sortedPlans()).toEqual(server.livePlans());
            expect(d.sortedFourYear()).toEqual(server.liveFourYear());
            expect(
              sameJson(
                settingsDocOf(d.tables),
                settingsDocOf(devices[0].tables),
              ),
            ).toBe(true);
          }
          const final = server.livePlans();
          for (const plan of unsavedPlans)
            expect(final.some((p) => sameWork(p, plan))).toBe(true);
          const finalDocs = server.liveFourYear();
          for (const doc of unsavedDocs)
            expect(finalDocs.some((f) => sameFourYearWork(f, doc))).toBe(true);
          const blocks = new Set(devices[0].tables.blocks.map((b) => b.id));
          for (const id of unsavedBlocks) expect(blocks.has(id)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });
});
