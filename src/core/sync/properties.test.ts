import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  aBlock,
  aPlan,
  aPlanCourse,
  aPlanSyncDoc,
  aSavedCourse,
  aSectionSnapshot,
  aSettingsDoc,
  aSettingsSyncDoc,
} from "~/fixtures";
import { type PlanAction, plansReducer } from "../plans";
import {
  type Block,
  DEFAULT_TRAVEL_SETTINGS,
  type Plan,
  type PlanCourse,
  PlanSchema,
  type SettingsDoc,
  type SyncDoc,
} from "../schema";
import {
  mergeSettings,
  plansAfterConflict,
  resolvePlanConflict,
  samePlanContent,
} from "./conflict";
import {
  applyDoc,
  changedDocKeys,
  type DocKey,
  docBody,
  docKeyOf,
  parseDocKey,
  planDocKey,
  type SyncedTables,
  settingsDocOf,
  withSettingsDoc,
} from "./docs";
import { sameJson } from "./equal";
import { firstSignInUnion, isUntouchedPlan } from "./first-sign-in";
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
// plan, running either twice changes nothing, and two devices syncing through
// a model server end up with the same plans without losing unsaved work.

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
  })
  .map(({ accessible, chat, ...s }) =>
    aSettingsDoc({
      ...s,
      travel: { ...DEFAULT_TRAVEL_SETTINGS, accessible },
      chatPlans: chat ? { [SPRING]: chat } : {},
    }),
  );

const serverDocs: fc.Arbitrary<SyncDoc[]> = fc
  .tuple(
    plans(SERVER_IDS),
    fc.subarray(SERVER_IDS),
    fc.option(settingsArb, { nil: undefined }),
  )
  .map(([live, dead, settings]) => {
    let rev = 0;
    const docs: SyncDoc[] = live.map((body) =>
      aPlanSyncDoc({ body, rev: ++rev }),
    );
    for (const id of dead)
      if (!live.some((p) => p.id === id))
        docs.push(aPlanSyncDoc({ id, body: null, rev: ++rev }));
    if (settings) docs.push(aSettingsSyncDoc({ body: settings, rev: ++rev }));
    return docs;
  });

function localTables(p: Plan[], s: SettingsDoc): SyncedTables {
  return {
    plans: p,
    blocks: s.blocks,
    colors: s.colors,
    travel: s.travel,
    chatPlans: s.chatPlans,
  };
}

const localArb = fc
  .tuple(plans(LOCAL_IDS), settingsArb)
  .map(([p, s]) => localTables(p, s));

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
  const union = (local: SyncedTables, server: readonly SyncDoc[]) =>
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
              : aPlanSyncDoc({
                  id: parsed.id,
                  body: body as Plan | null,
                  rev: ++rev,
                }),
          );
        }
        const second = union(first.tables, [...landed.values()]);
        expect(second.tables.plans).toEqual(first.tables.plans);
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
          { ...local, plans: shuffled(local.plans, seed) },
          shuffled(server, seed + 1),
        );
        expect(b.tables.plans).toEqual(a.tables.plans);
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
  readonly docs = new Map<DocKey, SyncDoc>();
  private head = 0;

  push(
    key: DocKey,
    base: number,
    body: Plan | SettingsDoc | null,
  ): { ok: true; rev: number } | { ok: false; doc: SyncDoc } {
    const current = this.docs.get(key);
    if (current && current.rev !== base) return { ok: false, doc: current };
    if (!current && base !== 0) throw new Error(`no doc ${key} at rev ${base}`);
    const rev = ++this.head;
    const parsed = parseDocKey(key);
    this.docs.set(
      key,
      parsed.kind === "settings"
        ? aSettingsSyncDoc({ rev, body: body as SettingsDoc })
        : aPlanSyncDoc({ id: parsed.id, rev, body: body as Plan | null }),
    );
    return { ok: true, rev };
  }

  pull(since: number): { docs: SyncDoc[]; cursor: number } {
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
    };
  }

  edit(action: PlanAction): void {
    const { plans, blocks, colors } = this.tables;
    const state = plansReducer({ plans, blocks, colors }, action);
    const next = { ...this.tables, ...state };
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
}

type Step =
  | { device: 0 | 1; kind: "push" | "pull" }
  | { device: 0 | 1; kind: "edit"; action: (d: Device) => PlanAction | null };

const pickPlan = (d: Device, i: number) =>
  d.tables.plans.length ? d.tables.plans[i % d.tables.plans.length] : undefined;

const stepArb: fc.Arbitrary<Step> = fc.oneof(
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

describe("two devices syncing through the server", () => {
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

          // Work that hadn't reached the server when the devices went quiet.
          const unsavedPlans = devices.flatMap((d) =>
            d.tables.plans.filter((p) => d.sync.docs[planDocKey(p.id)]?.dirty),
          );
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
          const blocks = new Set(devices[0].tables.blocks.map((b) => b.id));
          for (const id of unsavedBlocks) expect(blocks.has(id)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });
});
