import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { FourYearDocSchema, type FourYearEntry } from "~/core/schema/four-year";
import {
  aFourYear,
  aFourYearCreditEntry,
  aFourYearEntry,
  aFourYearWildcardEntry,
  FIXTURE_NOW,
} from "~/fixtures";
import { applyWithHistory, createHistory, redo, undo } from "../plans/history";
import {
  addEntry,
  EMPTY_FOUR_YEAR_STATE,
  type FourYearAction,
  type FourYearState,
  fourYearReducer,
  moveEntry,
  sortEntries,
} from "./reducer";

const LATER = "2026-09-26T12:00:00.000Z";
const doc = aFourYear();
const state: FourYearState = { docs: [doc] };

function run(s: FourYearState, ...actions: FourYearAction[]): FourYearState {
  return actions.reduce(fourYearReducer, s);
}

function only(s: FourYearState) {
  const [first] = s.docs;
  if (!first) throw new Error("no doc");
  return first;
}

const ids = (s: FourYearState) => only(s).entries.map((e) => e.id);

describe("docs", () => {
  it('creates "My plan", then "My plan 2"', () => {
    const s = run(
      EMPTY_FOUR_YEAR_STATE,
      {
        type: "create",
        id: "fouryear_one",
        firstTermId: "202608",
        now: FIXTURE_NOW,
      },
      {
        type: "create",
        id: "fouryear_two",
        firstTermId: "202608",
        now: FIXTURE_NOW,
      },
      {
        type: "create",
        id: "fouryear_six",
        firstTermId: "202701",
        now: FIXTURE_NOW,
        name: "  Switch   to math ",
      },
    );
    expect(s.docs.map((d) => d.name)).toEqual([
      "My plan",
      "My plan 2",
      "Switch to math",
    ]);
    for (const d of s.docs)
      expect(FourYearDocSchema.safeParse(d).success).toBe(true);
    expect(
      run(s, {
        type: "create",
        id: "fouryear_one",
        firstTermId: "202608",
        now: LATER,
      }),
    ).toBe(s);
  });

  it("duplicates right after the source, with its entries and grades", () => {
    const withEntry = run(state, {
      type: "add",
      docId: doc.id,
      entry: aFourYearEntry(),
      now: FIXTURE_NOW,
    });
    const s = run(
      {
        docs: [
          ...withEntry.docs,
          aFourYear({ id: "fouryear_other", name: "Other" }),
        ],
      },
      { type: "remove-grades", docId: doc.id, now: LATER },
      { type: "duplicate", docId: doc.id, id: "fouryear_copy", now: LATER },
    );
    expect(s.docs.map((d) => d.name)).toEqual([
      "My plan",
      "Copy of My plan",
      "Other",
    ]);
    expect(s.docs[1]?.entries).toEqual(s.docs[0]?.entries);
    expect(
      run(s, {
        type: "duplicate",
        docId: "fouryear_nope",
        id: "fouryear_x",
        now: LATER,
      }),
    ).toBe(s);
  });

  it("renames, ignoring blank and unchanged names, and deletes", () => {
    const renamed = run(state, {
      type: "rename",
      docId: doc.id,
      name: "CS plan",
      now: LATER,
    });
    expect(only(renamed)).toMatchObject({ name: "CS plan", updatedAt: LATER });
    expect(
      run(renamed, { type: "rename", docId: doc.id, name: "   ", now: LATER }),
    ).toBe(renamed);
    expect(
      run(renamed, {
        type: "rename",
        docId: doc.id,
        name: "CS plan",
        now: LATER,
      }),
    ).toBe(renamed);
    expect(run(state, { type: "delete", docId: doc.id }).docs).toEqual([]);
    expect(run(state, { type: "delete", docId: "fouryear_nope" })).toBe(state);
    expect(
      run(state, {
        type: "rename",
        docId: "fouryear_nope",
        name: "X",
        now: LATER,
      }),
    ).toBe(state);
  });

  it("moves the first semester and leaves entries where they are", () => {
    const withEntry = run(state, {
      type: "add",
      docId: doc.id,
      entry: aFourYearEntry({ term: "202608" }),
      now: LATER,
    });
    const moved = run(withEntry, {
      type: "set-first-term",
      docId: doc.id,
      firstTermId: "202708",
      now: LATER,
    });
    expect(only(moved).firstTermId).toBe("202708");
    expect(only(moved).entries).toEqual(only(withEntry).entries);
    expect(
      run(moved, {
        type: "set-first-term",
        docId: doc.id,
        firstTermId: "202708",
        now: LATER,
      }),
    ).toBe(moved);
  });
});

describe("entries", () => {
  const a = aFourYearEntry({ id: "entry_a", term: "202608", code: "CMSC131" });
  const b = aFourYearEntry({ id: "entry_b", term: "202608", code: "CMSC132" });
  const c = aFourYearEntry({ id: "entry_c", term: "202701", code: "CMSC216" });
  const filled = run(
    state,
    { type: "add", docId: doc.id, entry: c, now: FIXTURE_NOW },
    { type: "add", docId: doc.id, entry: b, now: FIXTURE_NOW },
    { type: "add", docId: doc.id, entry: a, index: 0, now: FIXTURE_NOW },
  );

  it("adds into its column at an index or the end, keeping column order", () => {
    expect(ids(filled)).toEqual(["entry_a", "entry_b", "entry_c"]);
    const withAp = run(filled, {
      type: "add",
      docId: doc.id,
      entry: aFourYearCreditEntry(),
      now: LATER,
    });
    expect(ids(withAp)[0]).toBe("entry_fixture_c");
    expect(only(withAp).updatedAt).toBe(LATER);
  });

  it("ignores a taken id and a full doc", () => {
    expect(
      run(filled, { type: "add", docId: doc.id, entry: a, now: LATER }),
    ).toBe(filled);
    const full = aFourYear({
      entries: Array.from({ length: 150 }, (_, i) =>
        aFourYearEntry({ id: `entry_${String(i).padStart(3, "0")}` }),
      ),
    });
    expect(addEntry(full, aFourYearEntry({ id: "entry_extra" }))).toBe(full);
  });

  it("moves between and within columns", () => {
    const moved = run(filled, {
      type: "move",
      docId: doc.id,
      entryId: "entry_a",
      term: "202701",
      now: LATER,
    });
    expect(only(moved).entries.map((e) => [e.id, e.term])).toEqual([
      ["entry_b", "202608"],
      ["entry_c", "202701"],
      ["entry_a", "202701"],
    ]);
    const reordered = run(filled, {
      type: "move",
      docId: doc.id,
      entryId: "entry_b",
      term: "202608",
      index: 0,
      now: LATER,
    });
    expect(ids(reordered)).toEqual(["entry_b", "entry_a", "entry_c"]);
    const toSummer = run(filled, {
      type: "move",
      docId: doc.id,
      entryId: "entry_c",
      term: "202705",
      now: LATER,
    });
    expect(only(toSummer).entries.at(-1)).toMatchObject({
      id: "entry_c",
      term: "202705",
    });
  });

  it("returns the same state for a move that goes nowhere", () => {
    expect(
      run(filled, {
        type: "move",
        docId: doc.id,
        entryId: "entry_b",
        term: "202608",
        now: LATER,
      }),
    ).toBe(filled);
    expect(
      run(filled, {
        type: "move",
        docId: doc.id,
        entryId: "entry_nope",
        term: "202608",
        now: LATER,
      }),
    ).toBe(filled);
  });

  it("keeps credit entries in Before UMD", () => {
    const d = aFourYear({ entries: [aFourYearCreditEntry()] });
    expect(moveEntry(d, "entry_fixture_c", "202608")).toBe(d);
  });

  it("removes an entry with its grade", () => {
    const graded = {
      docs: [{ ...only(filled), grades: { entry_a: "A" as const } }],
    };
    const removed = run(graded, {
      type: "remove",
      docId: doc.id,
      entryId: "entry_a",
      now: LATER,
    });
    expect(ids(removed)).toEqual(["entry_b", "entry_c"]);
    expect(only(removed).grades).toEqual({});
    expect(
      run(removed, {
        type: "remove",
        docId: doc.id,
        entryId: "entry_a",
        now: LATER,
      }),
    ).toBe(removed);
  });

  it("never loses or duplicates an entry, whatever moves", () => {
    const terms = ["before", "202608", "202701", "202705", "202708"] as const;
    const entries: FourYearEntry[] = [
      aFourYearCreditEntry({ id: "entry_cr" }),
      ...Array.from({ length: 6 }, (_, i) =>
        aFourYearEntry({ id: `entry_${i}xxxx`, term: terms[(i % 4) + 1] }),
      ),
    ];
    const start = { docs: [aFourYear({ entries: sortEntries(entries) })] };
    const move = fc.record({
      entry: fc.constantFrom(...entries.map((e) => e.id)),
      term: fc.constantFrom(...terms),
      index: fc.option(fc.integer({ min: -2, max: 8 }), { nil: undefined }),
    });
    fc.assert(
      fc.property(fc.array(move, { maxLength: 20 }), (moves) => {
        const end = moves.reduce<FourYearState>(
          (s, m) =>
            fourYearReducer(s, {
              type: "move",
              docId: doc.id,
              entryId: m.entry,
              term: m.term,
              index: m.index,
              now: LATER,
            }),
          start,
        );
        const after = only(end).entries;
        expect(after.map((e) => e.id).sort()).toEqual(
          entries.map((e) => e.id).sort(),
        );
        expect(sortEntries(after)).toEqual(after);
        expect(after.find((e) => e.id === "entry_cr")?.term).toBe("before");
        expect(FourYearDocSchema.safeParse(only(end)).success).toBe(true);
      }),
    );
  });
});

describe("placeholders, choices and credits", () => {
  const wildcard = aFourYearWildcardEntry({
    id: "entry_w",
    wildcard: { kind: "gen-ed", code: "DSHS" },
    source: "template",
  });
  const s = run(state, {
    type: "add",
    docId: doc.id,
    entry: wildcard,
    now: FIXTURE_NOW,
  });

  it("resolves a placeholder in place, keeping its id, term and source", () => {
    const resolved = run(s, {
      type: "resolve-wildcard",
      docId: doc.id,
      entryId: "entry_w",
      code: "HIST200",
      credits: null,
      genEdChoices: { "0": "DSHS" },
      now: LATER,
    });
    expect(only(resolved).entries).toEqual([
      aFourYearEntry({
        id: "entry_w",
        code: "HIST200",
        genEdChoices: { "0": "DSHS" },
        source: "template",
      }),
    ]);
    // A course isn't a placeholder anymore.
    expect(
      run(resolved, {
        type: "resolve-wildcard",
        docId: doc.id,
        entryId: "entry_w",
        code: "HIST201",
        credits: 3,
        now: LATER,
      }),
    ).toBe(resolved);
  });

  it("sets and clears a GenEd choice", () => {
    const course = run(state, {
      type: "add",
      docId: doc.id,
      entry: aFourYearEntry({ code: "HIST200" }),
      now: FIXTURE_NOW,
    });
    const id = "entry_fixture_1";
    const chosen = run(course, {
      type: "set-choice",
      docId: doc.id,
      entryId: id,
      group: 0,
      code: "DSHU",
      now: LATER,
    });
    expect(only(chosen).entries[0]).toMatchObject({
      genEdChoices: { "0": "DSHU" },
    });
    expect(
      run(chosen, {
        type: "set-choice",
        docId: doc.id,
        entryId: id,
        group: 0,
        code: "DSHU",
        now: LATER,
      }),
    ).toBe(chosen);
    const cleared = run(chosen, {
      type: "set-choice",
      docId: doc.id,
      entryId: id,
      group: 0,
      code: null,
      now: LATER,
    });
    expect(only(cleared).entries[0]).toMatchObject({ genEdChoices: {} });
    expect(
      run(s, {
        type: "set-choice",
        docId: doc.id,
        entryId: "entry_w",
        group: 0,
        code: "DSHU",
        now: LATER,
      }),
    ).toBe(s);
  });

  it("sets credits: a course's (or back to the index's), a placeholder's within 1–6", () => {
    const course = run(state, {
      type: "add",
      docId: doc.id,
      entry: aFourYearEntry(),
      now: FIXTURE_NOW,
    });
    const three = run(course, {
      type: "set-credits",
      docId: doc.id,
      entryId: "entry_fixture_1",
      credits: 3,
      now: LATER,
    });
    expect(only(three).entries[0]).toMatchObject({ credits: 3 });
    const back = run(three, {
      type: "set-credits",
      docId: doc.id,
      entryId: "entry_fixture_1",
      credits: null,
      now: LATER,
    });
    expect(only(back).entries[0]).toMatchObject({ credits: null });
    const big = run(s, {
      type: "set-credits",
      docId: doc.id,
      entryId: "entry_w",
      credits: 12,
      now: LATER,
    });
    expect(only(big).entries[0]).toMatchObject({ credits: 6 });
    expect(
      run(s, {
        type: "set-credits",
        docId: doc.id,
        entryId: "entry_w",
        credits: null,
        now: LATER,
      }),
    ).toBe(s);
    expect(
      run(s, {
        type: "set-credits",
        docId: doc.id,
        entryId: "entry_w",
        credits: 3,
        now: LATER,
      }),
    ).toBe(s);
    const credit = run(state, {
      type: "add",
      docId: doc.id,
      entry: aFourYearCreditEntry(),
      now: FIXTURE_NOW,
    });
    expect(
      run(credit, {
        type: "set-credits",
        docId: doc.id,
        entryId: "entry_fixture_c",
        credits: 1,
        now: LATER,
      }),
    ).toBe(credit);
  });
});

describe("apply-template", () => {
  const template = {
    id: "cmsc-2026",
    department: "Computer Science",
    year: "2026–27",
  };
  it("fills empty semesters only and records the template", () => {
    const s = run(
      state,
      {
        type: "add",
        docId: doc.id,
        entry: aFourYearEntry({
          id: "entry_mine",
          term: "202608",
          code: "MATH140",
        }),
        now: FIXTURE_NOW,
      },
      {
        type: "apply-template",
        docId: doc.id,
        template,
        semesters: [
          {
            index: 0,
            entries: [
              {
                ...aFourYearEntry({
                  id: "entry_t0",
                  code: "CMSC131",
                  source: "template",
                }),
              },
            ],
          },
          {
            index: 1,
            entries: [
              {
                ...aFourYearWildcardEntry({
                  id: "entry_t1",
                  source: "template",
                }),
              },
            ],
          },
          {
            index: 9,
            entries: [
              { ...aFourYearEntry({ id: "entry_t9", source: "template" }) },
            ],
          },
        ],
        now: LATER,
      },
    );
    expect(only(s).entries.map((e) => [e.id, e.term])).toEqual([
      ["entry_mine", "202608"],
      ["entry_t1", "202701"],
    ]);
    expect(only(s).template).toEqual(template);
  });

  it("starts a new plan from a template in one step, which one undo takes back", () => {
    const semesters = [
      {
        index: 0,
        entries: [
          aFourYearEntry({
            id: "entry_t0",
            code: "CMSC131",
            source: "template",
          }),
        ],
      },
    ];
    const before = createHistory(state);
    const after = applyWithHistory(before, fourYearReducer, {
      type: "create",
      id: "fouryear_new",
      firstTermId: "202701",
      now: LATER,
      template: { ref: template, semesters },
    });
    const created = after.present.docs[1];
    expect(created?.name).toBe("My plan 2");
    expect(created?.template).toEqual(template);
    expect(created?.entries.map((e) => [e.id, e.term])).toEqual([
      ["entry_t0", "202701"],
    ]);
    expect(created?.updatedAt).toBe(LATER);
    expect(FourYearDocSchema.safeParse(created).success).toBe(true);
    expect(undo(after).present).toBe(state);
  });

  it("changes nothing when every semester it names has something", () => {
    const s = run(state, {
      type: "add",
      docId: doc.id,
      entry: aFourYearEntry({ term: "202608" }),
      now: FIXTURE_NOW,
    });
    expect(
      run(s, {
        type: "apply-template",
        docId: doc.id,
        template,
        semesters: [
          { index: 0, entries: [aFourYearEntry({ id: "entry_t0" })] },
        ],
        now: LATER,
      }),
    ).toBe(s);
  });
});

describe("import", () => {
  const typedKept = aFourYearEntry({
    id: "entry_typed",
    term: "202608",
    code: "MATH140",
  });
  const typedDup = aFourYearEntry({
    id: "entry_dup",
    term: "202608",
    code: "CMSC131",
  });
  const templated = aFourYearEntry({
    id: "entry_tmpl",
    term: "202608",
    code: "ENGL101",
    source: "template",
  });
  const planned = aFourYearEntry({
    id: "entry_later",
    term: "202708",
    code: "CMSC351",
  });
  const imported = [
    aFourYearCreditEntry({ id: "entry_ap1" }),
    aFourYearEntry({
      id: "entry_i131",
      term: "202608",
      code: "CMSC131",
      source: "transcript",
    }),
    aFourYearEntry({
      id: "entry_i216",
      term: "202701",
      code: "CMSC216",
      source: "transcript",
    }),
  ];

  it("replaces done and in-progress terms, keeps typed courses it doesn't have, and leaves planned terms", () => {
    const start = {
      docs: [
        aFourYear({
          entries: [typedKept, typedDup, templated, planned],
          grades: { entry_dup: "B" },
        }),
      ],
    };
    const s = run(start, {
      type: "import",
      docId: doc.id,
      replace: ["before", "202608"],
      entries: imported,
      grades: { entry_i131: "A", entry_i216: "B+", entry_nope: "C" },
      now: LATER,
    });
    expect(ids(s)).toEqual([
      "entry_ap1",
      "entry_typed",
      "entry_i131",
      "entry_i216",
      "entry_later",
    ]);
    expect(only(s).grades).toEqual({ entry_i131: "A", entry_i216: "B+" });
    expect(only(s).firstTermId).toBe("202608");
    expect(FourYearDocSchema.safeParse(only(s)).success).toBe(true);
  });

  it("starts an empty plan at the transcript's first fall or spring", () => {
    const s = run(
      { docs: [aFourYear({ firstTermId: "202908" })] },
      {
        type: "import",
        docId: doc.id,
        replace: [],
        entries: imported.slice(2),
        grades: {},
        now: LATER,
      },
    );
    expect(only(s).firstTermId).toBe("202701");
  });

  it("changes nothing when the result wouldn't fit", () => {
    const many = Array.from({ length: 151 }, (_, i) =>
      aFourYearEntry({
        id: `entry_${String(i).padStart(3, "0")}`,
        source: "transcript",
      }),
    );
    expect(
      run(state, {
        type: "import",
        docId: doc.id,
        replace: [],
        entries: many,
        grades: {},
        now: LATER,
      }),
    ).toBe(state);
  });

  it("removes grades in one step, and does nothing when there are none", () => {
    const graded = {
      docs: [
        aFourYear({
          entries: [aFourYearEntry()],
          grades: { entry_fixture_1: "A" },
        }),
      ],
    };
    const s = run(graded, { type: "remove-grades", docId: doc.id, now: LATER });
    expect(only(s).grades).toEqual({});
    expect(run(s, { type: "remove-grades", docId: doc.id, now: LATER })).toBe(
      s,
    );
  });
});

describe("undo", () => {
  it("uses the scheduler's history: no-ops aren't steps, and undo restores the doc", () => {
    let h = createHistory(state);
    h = applyWithHistory(h, fourYearReducer, {
      type: "add",
      docId: doc.id,
      entry: aFourYearEntry(),
      now: LATER,
    });
    h = applyWithHistory(h, fourYearReducer, {
      type: "move",
      docId: doc.id,
      entryId: "entry_fixture_1",
      term: "202701",
      now: LATER,
    });
    h = applyWithHistory(h, fourYearReducer, {
      type: "remove",
      docId: doc.id,
      entryId: "entry_fixture_1",
      now: LATER,
    });
    expect(h.past).toHaveLength(2);
    expect(only(h.present).entries).toEqual([]);
    h = undo(h);
    expect(ids(h.present)).toEqual(["entry_fixture_1"]);
    h = undo(undo(h));
    expect(h.present).toBe(state);
    expect(ids(redo(h).present)).toEqual(["entry_fixture_1"]);
  });
});
