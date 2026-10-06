import { describe, expect, it } from "vitest";
import {
  DATA_EXPORT_MAX_BYTES,
  DATA_EXPORT_MAX_PLANS,
  type DataExport,
  DataExportSchema,
} from "~/core/schema/data-export";
import {
  aBlock,
  aFourYear,
  anAccountData,
  aPlan,
  aSyncedTables,
} from "~/fixtures";
import { settingsDocOf } from "../sync";
import {
  buildDataExport,
  dataFileName,
  importSummary,
  planImport,
  readDataFile,
  undoImport,
} from ".";

const NOW = "2026-10-05T14:00:00.000Z";

function ids() {
  let n = 0;
  return () => `plan_import_${String(++n).padStart(4, "0")}`;
}

const planA = aPlan({ id: "plan_mine_a", name: "Plan A" });
const planB = aPlan({ id: "plan_mine_b", name: "Plan B", order: 1 });
const fourYear = aFourYear({ id: "fouryear_mine", name: "CS major" });

const browserFile = (tables = aSyncedTables()): DataExport =>
  buildDataExport({ from: "browser", tables, account: null, now: NOW });

describe("the data file", () => {
  it("holds the browser's plans, four-year plans and settings, and nothing of an account", () => {
    const tables = aSyncedTables({
      plans: [planA, planB],
      fourYear: [fourYear],
    });
    const file = browserFile(tables);
    expect(file).toMatchObject({
      format: "terpsicle-data",
      version: 1,
      exportedAt: NOW,
      from: "browser",
      plans: [planA, planB],
      fourYear: [fourYear],
      settings: settingsDocOf(tables),
      account: null,
    });
  });

  it("comes back the same from its JSON", () => {
    const file = buildDataExport({
      from: "account",
      tables: aSyncedTables({
        plans: [planA, planB],
        fourYear: [fourYear],
        colors: { CMSC351: "blue" },
      }),
      account: anAccountData(),
      now: NOW,
    });
    const text = JSON.stringify(file);
    expect(readDataFile(text, text.length)).toEqual({ status: "ok", file });
    expect(DataExportSchema.parse(JSON.parse(text))).toEqual(file);
  });

  it("is named for the day it was made", () => {
    expect(dataFileName("2026-10-05")).toBe("terpsicle-data-2026-10-05.json");
  });
});

describe("reading a file", () => {
  const read = (value: unknown) => {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return readDataFile(text, text.length);
  };

  it("says what's wrong with one it can't add", () => {
    expect(read("not json")).toEqual({ status: "not-terpsicle" });
    expect(read({ plans: [] })).toEqual({ status: "not-terpsicle" });
    expect(read({ ...browserFile(), version: 2 })).toEqual({
      status: "newer",
    });
    expect(read({ ...browserFile(), plans: [{ id: 3 }] })).toEqual({
      status: "invalid",
    });
    expect(readDataFile("{}", DATA_EXPORT_MAX_BYTES + 1)).toEqual({
      status: "too-big",
    });
  });

  it("refuses more plans than adding can handle", () => {
    const plans = Array.from({ length: DATA_EXPORT_MAX_PLANS + 1 }, (_, i) =>
      aPlan({ id: `plan_many_${String(i).padStart(5, "0")}` }),
    );
    expect(read({ ...browserFile(), plans })).toEqual({ status: "invalid" });
  });

  it("refuses a doc too big to sync, so a file can't stall your settings", () => {
    const file = browserFile();
    const prefs = { ...file.settings.prefs, junk: "x".repeat(70_000) };
    expect(read({ ...file, settings: { ...file.settings, prefs } })).toEqual({
      status: "invalid",
    });
  });

  it("refuses a task todo/save-task wouldn't take", () => {
    const account = anAccountData();
    const [task] = account.todo?.tasks ?? [];
    if (!task || !account.todo) throw new Error("the fixture has a task");
    const withTask = (t: Record<string, unknown>) =>
      read({
        ...browserFile(),
        from: "account",
        account: { ...account, todo: { ...account.todo, tasks: [t] } },
      });
    expect(withTask({ ...task, title: "   " })).toEqual({ status: "invalid" });
    expect(withTask({ ...task, dueDate: null, dueTime: 600 })).toEqual({
      status: "invalid",
    });
  });

  it("drops __proto__ keys and never touches Object.prototype", () => {
    const file = browserFile(aSyncedTables({ plans: [planA] }));
    const text = JSON.stringify({
      ...file,
      PROTO: { polluted: true },
      settings: {
        ...file.settings,
        prefs: { ...file.settings.prefs, PROTO: { polluted: true } },
      },
      plans: file.plans.map((p) => ({ ...p, PROTO: { polluted: true } })),
    }).replaceAll('"PROTO"', '"__proto__"');
    const result = readDataFile(text, text.length);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(Object.getPrototypeOf(result.file)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(result.file.settings.prefs)).toBe(
      Object.prototype,
    );
    expect(Object.getPrototypeOf(result.file.plans[0])).toBe(Object.prototype);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});

describe("adding a file", () => {
  const current = aSyncedTables({ plans: [planA], fourYear: [] });

  it("adds what's new and keeps everything you have", () => {
    const fall = aPlan({
      id: "plan_theirs_c",
      name: "Plan C",
      termId: "202701",
    });
    const file = browserFile(
      aSyncedTables({ plans: [planA, fall], fourYear: [fourYear] }),
    );
    const plan = planImport({
      current,
      file,
      taskUids: null,
      newId: ids(),
      now: NOW,
    });
    expect(plan.tables.plans.map((p) => p.id).sort()).toEqual(
      ["plan_mine_a", "plan_theirs_c"].sort(),
    );
    expect(plan.tables.fourYear).toEqual([fourYear]);
    expect(plan.added).toEqual({
      plans: [{ id: "plan_theirs_c", name: "Plan C", termId: "202701" }],
      fourYear: [{ id: "fouryear_mine", name: "CS major" }],
    });
    // Plan A is the same in both: nothing to add.
    expect(plan.same).toEqual({ plans: 1, fourYear: 0 });
  });

  it("never replaces a plan of yours: a different one with its id is added as a copy", () => {
    const edited = { ...planA, courses: [] };
    const plan = planImport({
      current,
      file: browserFile(aSyncedTables({ plans: [edited] })),
      taskUids: null,
      newId: ids(),
      now: NOW,
    });
    const mine = plan.tables.plans.find((p) => p.id === planA.id);
    expect(mine).toEqual(planA);
    expect(plan.added.plans).toEqual([
      { id: "plan_import_0001", name: "Plan A (copy)", termId: planA.termId },
    ]);
  });

  it("renames one whose name you already use in that term", () => {
    const other = aPlan({ id: "plan_theirs_a", name: "Plan A" });
    const plan = planImport({
      current,
      file: browserFile(aSyncedTables({ plans: [other] })),
      taskUids: null,
      newId: ids(),
      now: NOW,
    });
    expect(plan.added.plans).toEqual([
      { id: "plan_theirs_a", name: "Plan A (copy)", termId: other.termId },
    ]);
  });

  it("keeps your settings and adds only what you don't have", () => {
    const mine = aSyncedTables({
      plans: [planA],
      colors: { CMSC351: "blue" },
      blocks: [aBlock()],
    });
    const file = browserFile(
      aSyncedTables({
        plans: [],
        colors: { CMSC351: "orange", MATH141: "green" },
        blocks: [aBlock(), aBlock({ id: "block_theirs", label: "Work" })],
      }),
    );
    const plan = planImport({
      current: mine,
      file,
      taskUids: null,
      newId: ids(),
      now: NOW,
    });
    expect(plan.tables.colors).toEqual({ CMSC351: "blue", MATH141: "green" });
    expect(plan.tables.blocks.map((b) => b.id)).toEqual([
      "block_fixture_1",
      "block_theirs",
    ]);
    expect(plan.settingsChanged).toBe(true);
  });

  it("adds tasks you don't have, by their uid, and none to a browser", () => {
    const file = buildDataExport({
      from: "account",
      tables: aSyncedTables({ plans: [] }),
      account: anAccountData(),
      now: NOW,
    });
    const tasks = file.account?.todo?.tasks ?? [];
    expect(tasks.length).toBeGreaterThan(1);
    const [first] = tasks;
    const plan = planImport({
      current,
      file,
      taskUids: new Set([first?.uid ?? ""]),
      newId: ids(),
      now: NOW,
    });
    expect(plan.tasks).toEqual(tasks.slice(1));
    expect(
      planImport({ current, file, taskUids: null, newId: ids(), now: NOW })
        .tasks,
    ).toEqual([]);
  });

  it("says what it adds in plain words", () => {
    const file = browserFile(
      aSyncedTables({
        plans: [
          aPlan({ id: "plan_theirs_c", name: "Plan C" }),
          aPlan({ id: "plan_theirs_d", name: "Plan D" }),
        ],
        fourYear: [fourYear],
      }),
    );
    const plan = planImport({
      current,
      file,
      taskUids: null,
      newId: ids(),
      now: NOW,
    });
    expect(importSummary(plan)).toBe("Adds 2 plans and 1 four-year plan.");
    const nothing = planImport({
      current,
      file: browserFile(current),
      taskUids: null,
      newId: ids(),
      now: NOW,
    });
    expect(importSummary(nothing)).toBe(
      "Everything in this file is already here.",
    );
  });

  it("is undone by taking out what it added and putting your settings back", () => {
    const mine = aSyncedTables({ plans: [planA], colors: { CMSC351: "blue" } });
    const plan = planImport({
      current: mine,
      file: browserFile(
        aSyncedTables({
          plans: [aPlan({ id: "plan_theirs_c", name: "Plan C" })],
          fourYear: [fourYear],
          colors: { MATH141: "green" },
        }),
      ),
      taskUids: null,
      newId: ids(),
      now: NOW,
    });
    const undone = undoImport(plan.tables, plan);
    expect(undone.tables.plans).toEqual([planA]);
    expect(undone.tables.fourYear).toEqual([]);
    expect(undone.tables.colors).toEqual({ CMSC351: "blue" });
    expect([...undone.keys].sort()).toEqual(
      ["four-year:fouryear_mine", "plan:plan_theirs_c", "settings"].sort(),
    );
  });

  it("leaves settings changed since alone when undone", () => {
    const plan = planImport({
      current,
      file: browserFile(
        aSyncedTables({ plans: [], colors: { MATH141: "green" } }),
      ),
      taskUids: null,
      newId: ids(),
      now: NOW,
    });
    const later = { ...plan.tables, colors: { ENGL101: "orange" } } as const;
    const undone = undoImport(later, plan);
    expect(undone.tables.colors).toEqual({ ENGL101: "orange" });
    expect(undone.keys).not.toContain("settings");
  });
});
