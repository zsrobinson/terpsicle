import { describe, expect, it } from "vitest";
import { anOwnTask, aTodoItem } from "~/fixtures";
import {
  combineWeeks,
  findWeekItem,
  inWeek,
  type WeekList,
  weekList,
  withDone,
  withHidden,
  withItem,
  withoutElms,
} from "./week-list";

// Todo's weeks in the browser: an answer per week, read as one list, and
// each change made only where the item is.

const MON = "2026-09-28";
const NEXT = "2026-10-05";

const due = (uid: string, dueDate: string) =>
  aTodoItem({ uid, title: uid, dueDate, dueAt: null });
const undated = (uid: string) => anOwnTask({ uid });

const list = (
  items: WeekList["items"],
  done: string[] = [],
  hidden: string[] = [],
): WeekList => ({ items, done, hidden });

describe("a week's answer", () => {
  it("keeps the week's items and undated tasks, and their marks only", () => {
    const week = weekList(MON, {
      items: [
        due("sun-before", "2026-09-27"),
        due("mon", MON),
        due("sun", "2026-10-04"),
        due("next-mon", NEXT),
        undated("own-undated-00001"),
      ],
      done: ["mon", "next-mon", "own-undated-00001"],
      hidden: ["MATH240"],
    });
    expect(week.items.map((i) => i.uid)).toEqual([
      "mon",
      "sun",
      "own-undated-00001",
    ]);
    expect(week.done).toEqual(["mon", "own-undated-00001"]);
    expect(week.hidden).toEqual(["MATH240"]);
    expect(inWeek({ dueDate: null }, MON)).toBe(true);
  });
});

describe("the weeks as one list", () => {
  it("takes each item, and its mark, from the newest answer that has it", () => {
    const older = list([due("a", MON), due("b", "2026-09-30")], ["a"]);
    // The newer answer says "a" isn't done any more.
    const newer = list([due("a", MON)], [], ["CMSC216"]);
    const combined = combineWeeks([
      { list: older, at: 1 },
      { list: newer, at: 2 },
    ]);
    expect(combined.items.map((i) => i.uid)).toEqual(["a", "b"]);
    expect([...combined.done]).toEqual([]);
    expect([...combined.hidden]).toEqual(["CMSC216"]);
  });

  it("lists the newest week's undated tasks, so one deleted elsewhere goes", () => {
    const combined = combineWeeks([
      { list: list([undated("own-gone-000001")]), at: 1 },
      { list: list([undated("own-kept-000001")]), at: 2 },
    ]);
    expect(combined.items.map((i) => i.uid)).toEqual(["own-kept-000001"]);
  });

  it("is empty with no weeks", () => {
    const combined = combineWeeks([]);
    expect(combined.items).toEqual([]);
    expect(combined.hidden.size).toBe(0);
  });
});

describe("changing one item", () => {
  it("moves an item to the week it's due in now, done mark and all", () => {
    const item = due("task", MON);
    const moved = { ...item, dueDate: NEXT };
    const thisWeek = list([due("other", MON), item], ["task"]);
    const nextWeek = list([due("later", NEXT)]);
    const left = withItem(thisWeek, MON, "task", moved, true);
    const arrived = withItem(nextWeek, NEXT, "task", moved, true);
    expect(left.items.map((i) => i.uid)).toEqual(["other"]);
    expect(left.done).toEqual([]);
    expect(arrived.items.map((i) => i.uid)).toEqual(["later", "task"]);
    expect(arrived.done).toEqual(["task"]);
    expect(findWeekItem([left, arrived], "task")).toBe(moved);
  });

  it("changes an item in its place, and leaves other weeks alone", () => {
    const item = due("task", MON);
    const week = list([item, due("after", MON)]);
    const renamed = { ...item, title: "Renamed" };
    expect(
      withItem(week, MON, "task", renamed, false).items.map((i) => i.title),
    ).toEqual(["Renamed", "after"]);
    const elsewhere = list([due("later", NEXT)]);
    expect(withItem(elsewhere, NEXT, "task", renamed, false)).toBe(elsewhere);
    expect(withItem(week, MON, "task", item, false)).toBe(week);
  });

  it("takes a deleted item out with its mark", () => {
    const week = list([due("task", MON)], ["task"]);
    expect(withItem(week, MON, "task", null, false)).toEqual(list([], []));
  });

  it("marks done only in weeks that have the item", () => {
    const week = list([due("task", MON)]);
    expect(withDone(week, "task", true).done).toEqual(["task"]);
    expect(withDone(week, "task", false)).toBe(week);
    const other = list([due("later", NEXT)]);
    expect(withDone(other, "task", true)).toBe(other);
  });

  it("hides and shows a course group", () => {
    const week = list([], [], ["MATH240"]);
    expect(withHidden(week, "CMSC216", true).hidden).toEqual([
      "MATH240",
      "CMSC216",
    ]);
    expect(withHidden(week, "MATH240", false).hidden).toEqual([]);
    expect(withHidden(week, "MATH240", true)).toBe(week);
  });

  it("keeps file items and your own tasks without ELMS", () => {
    const file = aTodoItem({ uid: "file-1", source: "file", dueDate: MON });
    const own = undated("own-undated-00001");
    const week = list([due("elms", MON), file, own], ["elms", "file-1"]);
    const without = withoutElms(week);
    expect(without.items).toEqual([file, own]);
    expect(without.done).toEqual(["file-1"]);
    expect(withoutElms(without)).toBe(without);
  });
});
