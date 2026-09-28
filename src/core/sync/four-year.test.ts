import { describe, expect, it } from "vitest";
import {
  aBlock,
  aFourYear,
  aFourYearEntry,
  aFourYearSyncDoc,
  aPlan,
  aPlanSyncDoc,
} from "~/fixtures";
import { DEFAULT_TRAVEL_SETTINGS, DocKeySchema } from "../schema";
import {
  fourYearAfterConflict,
  resolveFourYearConflict,
  sameFourYearContent,
} from "./conflict";
import {
  applyDoc,
  changedDocKeys,
  changedFourYearKeys,
  docBody,
  docKeyOf,
  fourYearDocKey,
  parseDocKey,
  planDocKey,
  SETTINGS_DOC_KEY,
  type SyncedTables,
} from "./docs";
import { firstSignInUnion, isUntouchedFourYear } from "./first-sign-in";
import { INITIAL_PLAN_SYNC_STATE, planSyncReducer } from "./state";

// Terpsicle Plan's four-year docs as a third sync kind (docs/V3.md §2.4):
// the plans' rules, with the whole list of four-year docs as one "term".

const LATER = "2026-09-26T09:00:00.000Z";

const mine = aFourYear({
  id: "fouryear_mine_01",
  name: "CS major",
  entries: [aFourYearEntry({ id: "entry_cmsc131", code: "CMSC131" })],
  grades: { entry_cmsc131: "A" },
});
const theirs = aFourYear({
  id: "fouryear_acct_01",
  name: "My plan",
  entries: [aFourYearEntry({ id: "entry_math140", code: "MATH140" })],
});

function tables(overrides: Partial<SyncedTables> = {}): SyncedTables {
  return {
    plans: [],
    blocks: [aBlock()],
    colors: {},
    travel: DEFAULT_TRAVEL_SETTINGS,
    mainPlans: {},
    fourYear: [mine],
    prefs: {},
    ...overrides,
  };
}

function ids(counter = { n: 0 }) {
  return () => `fouryear_new_${String(++counter.n).padStart(4, "0")}`;
}

describe("four-year doc keys", () => {
  it("round-trip, apart from a plan with the same id", () => {
    expect(fourYearDocKey(mine.id)).toBe("four-year:fouryear_mine_01");
    expect(parseDocKey("four-year:fouryear_mine_01")).toEqual({
      kind: "four-year",
      id: mine.id,
    });
    expect(docKeyOf(aFourYearSyncDoc({ body: mine }))).toBe(
      fourYearDocKey(mine.id),
    );
    expect(fourYearDocKey("same_id_0001")).not.toBe(planDocKey("same_id_0001"));
  });

  it("are valid keys for the device's syncDocs rows", () => {
    expect(DocKeySchema.safeParse(fourYearDocKey(mine.id)).success).toBe(true);
    expect(DocKeySchema.safeParse("four-year:x").success).toBe(false);
  });
});

describe("mapping four-year docs", () => {
  it("gives the doc to push, grades and all, or null once deleted", () => {
    expect(docBody(tables(), fourYearDocKey(mine.id))).toEqual(mine);
    expect(docBody(tables(), fourYearDocKey(theirs.id))).toBeNull();
  });

  it("applies server docs as they are, and leaves plans alone", () => {
    const t = tables({ plans: [aPlan({ id: mine.id })] });
    const edited = { ...mine, name: "Econ minor" };
    expect(
      applyDoc(t, aFourYearSyncDoc({ body: edited, rev: 3 })).fourYear,
    ).toEqual([edited]);
    const added = applyDoc(t, aFourYearSyncDoc({ body: theirs }));
    expect(added.fourYear).toEqual([mine, theirs]);
    expect(added.plans).toBe(t.plans);
    const removed = applyDoc(t, aFourYearSyncDoc({ id: mine.id, body: null }));
    expect(removed.fourYear).toEqual([]);
    expect(removed.plans).toBe(t.plans);
    expect(applyDoc(t, aFourYearSyncDoc({ body: mine }))).toBe(t);
  });

  it("lists the four-year docs an edit changed", () => {
    const before = tables();
    const after = tables({
      fourYear: [{ ...mine, grades: {} }, theirs],
    });
    expect(changedDocKeys(before, after)).toEqual([
      fourYearDocKey(mine.id),
      fourYearDocKey(theirs.id),
    ]);
    expect(changedFourYearKeys([mine, theirs], [theirs])).toEqual([
      fourYearDocKey(mine.id),
    ]);
    expect(changedFourYearKeys(before.fourYear, [{ ...mine }])).toEqual([]);
  });
});

describe("resolveFourYearConflict", () => {
  const input = { copyId: "fouryear_copy_01", now: LATER };

  it("counts the work, grades included, but not when it changed", () => {
    expect(sameFourYearContent(mine, { ...mine, updatedAt: LATER })).toBe(true);
    expect(sameFourYearContent(mine, { ...mine, grades: {} })).toBe(false);
    expect(sameFourYearContent(mine, { ...mine, firstTermId: "202508" })).toBe(
      false,
    );
  });

  it("takes the server's version when both hold the same work", () => {
    const server = { ...mine, updatedAt: LATER };
    expect(
      resolveFourYearConflict({ ...input, local: mine, server, docs: [mine] }),
    ).toEqual({ kind: "take-server", doc: server });
  });

  it("keeps both when they differ: the server's stays, this device's becomes a copy", () => {
    const server = { ...mine, entries: [], grades: {} };
    const result = resolveFourYearConflict({
      ...input,
      local: mine,
      server,
      docs: [mine, { ...theirs, name: "CS major (copy)" }],
    });
    expect(result).toEqual({
      kind: "keep-both",
      doc: server,
      copy: {
        ...mine,
        id: "fouryear_copy_01",
        name: "CS major (copy 2)",
        createdAt: LATER,
        updatedAt: LATER,
      },
    });
    const after = fourYearAfterConflict([mine], mine.id, result);
    expect(after.map((d) => d.name)).toEqual(["CS major", "CS major (copy 2)"]);
    // The copy keeps this device's grades.
    expect(after[1]?.grades).toEqual(mine.grades);
  });

  it("lets an edit win over a delete, either way", () => {
    expect(
      resolveFourYearConflict({
        ...input,
        local: mine,
        server: null,
        docs: [],
      }),
    ).toEqual({ kind: "keep-local", doc: mine });
    expect(
      resolveFourYearConflict({
        ...input,
        local: null,
        server: theirs,
        docs: [],
      }),
    ).toEqual({ kind: "take-server", doc: theirs });
    expect(
      fourYearAfterConflict([mine], mine.id, {
        kind: "take-server",
        doc: null,
      }),
    ).toEqual([]);
  });
});

describe("isUntouchedFourYear", () => {
  it("is a default name with nothing in it", () => {
    expect(isUntouchedFourYear(aFourYear())).toBe(true);
    expect(isUntouchedFourYear(aFourYear({ name: "My plan 2" }))).toBe(true);
    expect(isUntouchedFourYear(aFourYear({ name: "CS major" }))).toBe(false);
    expect(isUntouchedFourYear(theirs)).toBe(false);
    expect(
      isUntouchedFourYear(
        aFourYear({
          template: { id: "cmsc", department: "CMSC", year: "2026" },
        }),
      ),
    ).toBe(false);
  });
});

describe("firstSignInUnion with four-year docs", () => {
  const base = { cursor: 9, now: LATER };

  it("uploads this device's four-year docs to an empty account", () => {
    const result = firstSignInUnion({
      ...base,
      local: tables(),
      server: [],
      newId: ids(),
    });
    expect(result.tables.fourYear).toEqual([mine]);
    expect(result.fourYear.uploaded).toEqual([mine.id]);
    expect(result.sync.docs[fourYearDocKey(mine.id)]).toEqual({
      rev: 0,
      dirty: true,
      inFlight: false,
    });
  });

  it("keeps the account's and adds this device's, renaming a clash", () => {
    const local = { ...mine, id: "fouryear_mine_02", name: "My plan" };
    const result = firstSignInUnion({
      ...base,
      local: tables({ fourYear: [local] }),
      server: [aFourYearSyncDoc({ body: theirs, rev: 4 })],
      newId: ids(),
    });
    expect(result.tables.fourYear.map((d) => [d.id, d.name])).toEqual([
      [theirs.id, "My plan"],
      [local.id, "My plan (copy)"],
    ]);
    expect(result.fourYear.renamed).toEqual([
      { id: local.id, from: "My plan", to: "My plan (copy)" },
    ]);
    expect(result.sync.docs[fourYearDocKey(theirs.id)]).toEqual({
      rev: 4,
      dirty: false,
      inFlight: false,
    });
  });

  it("opens the account's four-year plan, the latest changed, not this device's", () => {
    const local = { ...mine, id: "fouryear_mine_02", name: "My plan" };
    const older = {
      ...theirs,
      id: "fouryear_acct_old",
      name: "Econ",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const newer = { ...theirs, updatedAt: "2026-09-01T00:00:00.000Z" };
    const result = firstSignInUnion({
      ...base,
      local: tables({ fourYear: [local] }),
      server: [
        aFourYearSyncDoc({ body: older, rev: 2 }),
        aFourYearSyncDoc({ body: newer, rev: 4 }),
      ],
      newId: ids(),
    });
    expect(result.fourYear.open).toBe(newer.id);
    const alone = firstSignInUnion({
      ...base,
      local: tables({ fourYear: [local] }),
      server: [],
      newId: ids(),
    });
    expect(alone.fourYear.open).toBeNull();
  });

  it("leaves out an untouched My plan only where the account has one", () => {
    const untouched = aFourYear({ id: "fouryear_new_0009" });
    const withAccount = firstSignInUnion({
      ...base,
      local: tables({ fourYear: [untouched] }),
      server: [aFourYearSyncDoc({ body: theirs })],
      newId: ids(),
    });
    expect(withAccount.tables.fourYear).toEqual([theirs]);
    expect(withAccount.fourYear.skipped).toEqual([untouched.id]);
    expect(withAccount.sync.docs[fourYearDocKey(untouched.id)]).toBeUndefined();

    const empty = firstSignInUnion({
      ...base,
      local: tables({ fourYear: [untouched] }),
      server: [],
      newId: ids(),
    });
    expect(empty.tables.fourYear).toEqual([untouched]);
    expect(empty.fourYear.uploaded).toEqual([untouched.id]);
  });

  it("keeps both when the account has this doc but different", () => {
    const onAccount = { ...mine, grades: {} };
    const result = firstSignInUnion({
      ...base,
      local: tables(),
      server: [aFourYearSyncDoc({ body: onAccount, rev: 2 })],
      newId: ids(),
    });
    expect(result.tables.fourYear).toEqual([
      onAccount,
      {
        ...mine,
        id: "fouryear_new_0001",
        name: "CS major (copy)",
        createdAt: LATER,
        updatedAt: LATER,
      },
    ]);
    expect(result.fourYear.copies).toEqual([
      { id: "fouryear_new_0001", of: mine.id },
    ]);
  });

  it("brings back a doc the account deleted, based on the tombstone's rev", () => {
    const result = firstSignInUnion({
      ...base,
      local: tables(),
      server: [aFourYearSyncDoc({ id: mine.id, body: null, rev: 5 })],
      newId: ids(),
    });
    expect(result.tables.fourYear).toEqual([mine]);
    expect(result.sync.docs[fourYearDocKey(mine.id)]).toEqual({
      rev: 5,
      dirty: true,
      inFlight: false,
    });
  });

  it("keeps plans and four-year docs with the same id apart", () => {
    const plan = aPlan({ id: mine.id, name: "Plan A" });
    const result = firstSignInUnion({
      ...base,
      local: tables({ plans: [plan] }),
      server: [aPlanSyncDoc({ body: plan, rev: 1 })],
      newId: ids(),
    });
    expect(result.tables.plans).toEqual([plan]);
    expect(result.tables.fourYear).toEqual([mine]);
    expect(result.uploaded).toEqual([]);
    expect(result.fourYear.uploaded).toEqual([mine.id]);
  });
});

describe("planSyncReducer with four-year keys", () => {
  const key = fourYearDocKey(mine.id);

  it("tracks a four-year doc like any other, and queues a conflict's copy", () => {
    let state = planSyncReducer(INITIAL_PLAN_SYNC_STATE, {
      type: "edited",
      keys: [key],
    });
    state = planSyncReducer(state, { type: "push-started", keys: [key] });
    const copy = fourYearDocKey("fouryear_copy_01");
    state = planSyncReducer(state, {
      type: "push-conflict",
      key,
      rev: 6,
      pushAgain: false,
      copy,
    });
    expect(state.docs).toEqual({
      [key]: { rev: 6, dirty: false, inFlight: false },
      [copy]: { rev: 0, dirty: true, inFlight: false },
    });
    expect(state.docs[SETTINGS_DOC_KEY]).toBeUndefined();
  });
});
