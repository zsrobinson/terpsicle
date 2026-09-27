import { describe, expect, it } from "vitest";
import { aTodoFeedState, aTodoItem } from "~/fixtures";
import {
  agoWords,
  compareItems,
  courseChatTerm,
  dayLabel,
  dueTimeLabel,
  feedWords,
  groupByCourse,
  groupByDay,
  isStale,
  itemCourse,
  listRange,
  newYorkClock,
  openCount,
  TODO_OPEN_REFRESH_MS,
  weekDates,
  weekStart,
} from "./list";

// 2026-09-29 is a Tuesday.
const TODAY = "2026-09-29";
const NOW = Date.parse("2026-09-29T16:00:00.000Z");

const item = (uid: string, dueDate: string, extra = {}) =>
  aTodoItem({ uid, dueDate, dueAt: null, title: uid, ...extra });

describe("listRange", () => {
  it("reaches two weeks back and fits inside todo/list's 120 days", () => {
    expect(listRange(TODAY)).toEqual({ from: "2026-09-15", to: "2027-01-12" });
  });
});

describe("newYorkClock and dueTimeLabel", () => {
  it("reads the New York wall clock in daylight and standard time", () => {
    expect(newYorkClock(Date.parse("2026-09-30T03:59:00.000Z"))).toEqual({
      date: "2026-09-29",
      minutes: 23 * 60 + 59,
    });
    expect(newYorkClock(Date.parse("2026-12-01T18:00:00.000Z"))).toEqual({
      date: "2026-12-01",
      minutes: 13 * 60,
    });
  });

  it("reads the repeated hour after daylight time ends as standard time", () => {
    // 1:30am happens twice on 2026-11-01; 06:30Z is the second one.
    expect(newYorkClock(Date.parse("2026-11-01T06:30:00.000Z"))).toEqual({
      date: "2026-11-01",
      minutes: 90,
    });
  });

  it("says the time, or All day", () => {
    expect(dueTimeLabel(aTodoItem())).toBe("11:59pm");
    expect(dueTimeLabel(aTodoItem({ dueAt: "2026-10-02T17:00:00.000Z" }))).toBe(
      "1pm",
    );
    expect(dueTimeLabel(aTodoItem({ dueAt: null }))).toBe("All day");
  });
});

describe("days and weeks", () => {
  it("names days near today, and the rest by weekday and date", () => {
    expect(dayLabel(TODAY, TODAY)).toBe("Today");
    expect(dayLabel("2026-09-30", TODAY)).toBe("Tomorrow");
    expect(dayLabel("2026-09-28", TODAY)).toBe("Yesterday");
    expect(dayLabel("2026-10-02", TODAY)).toBe("Friday, Oct 2");
  });

  it("runs weeks Monday to Sunday", () => {
    expect(weekStart(TODAY)).toBe("2026-09-28");
    expect(weekStart("2026-10-04")).toBe("2026-09-28");
    expect(weekStart("2026-09-28")).toBe("2026-09-28");
    expect(weekDates("2026-09-28")).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
  });

  it("sorts by date, all-day first, then time, then title", () => {
    const late = aTodoItem({ uid: "a", title: "B", dueDate: TODAY });
    const allDay = aTodoItem({ uid: "b", dueAt: null, dueDate: TODAY });
    const early = aTodoItem({
      uid: "c",
      dueDate: TODAY,
      dueAt: "2026-09-29T14:00:00.000Z",
    });
    const sameTime = aTodoItem({ uid: "d", title: "A", dueDate: TODAY });
    const before = aTodoItem({ uid: "e", dueDate: "2026-09-28" });
    expect(
      [late, allDay, early, sameTime, before]
        .sort(compareItems)
        .map((i) => i.uid),
    ).toEqual(["e", "b", "c", "d", "a"]);
  });
});

describe("groupByDay", () => {
  it("files items under Earlier, Today, Tomorrow, this week, next week and later", () => {
    const items = [
      item("past-open", "2026-09-27"),
      item("past-done", "2026-09-27"),
      item("today", TODAY),
      item("thursday", "2026-10-01"),
      item("sunday", "2026-10-04"),
      item("next-monday", "2026-10-05"),
      item("far", "2026-11-20"),
    ];
    const sections = groupByDay(items, new Set(["past-done"]), TODAY);
    expect(
      sections.map((s) => [s.id, s.days.map((d) => d.open.map((i) => i.uid))]),
    ).toEqual([
      ["earlier", [["past-open"]]],
      ["today", [["today"]]],
      ["tomorrow", [[]]],
      ["this-week", [["thursday"], ["sunday"]]],
      ["next-week", [["next-monday"]]],
      ["later", [["far"]]],
    ]);
    expect(sections[2]?.days[0]?.label).toBe("Tomorrow");
  });

  it("folds done items apart from open ones, per day", () => {
    const items = [item("a", TODAY), item("b", TODAY), item("c", TODAY)];
    const [today] = groupByDay(items, new Set(["a", "c"]), TODAY).filter(
      (s) => s.id === "today",
    );
    expect(today?.days[0]?.open.map((i) => i.uid)).toEqual(["b"]);
    expect(today?.days[0]?.done.map((i) => i.uid)).toEqual(["a", "c"]);
  });

  it("says when a week is empty, and skips empty sections that say nothing", () => {
    const sections = groupByDay([], new Set(), TODAY);
    expect(sections.map((s) => [s.id, s.empty])).toEqual([
      ["today", null],
      ["tomorrow", null],
      ["this-week", "Nothing due this week."],
      ["next-week", "Nothing due next week."],
    ]);
  });

  it("drops this week once tomorrow is its last day", () => {
    const saturday = "2026-10-03";
    expect(groupByDay([], new Set(), saturday).map((s) => s.id)).toEqual([
      "today",
      "tomorrow",
      "next-week",
    ]);
  });
});

describe("itemCourse and groupByCourse", () => {
  const crossListed = aTodoItem({
    uid: "x",
    courseLabel: "CMSC216/ENEE222-0101: Computer Systems",
    courseCode: "CMSC216",
  });

  it("picks the code that's in the person's plans, else the first", () => {
    expect(itemCourse(crossListed, new Set(["ENEE222"]))).toBe("ENEE222");
    expect(itemCourse(crossListed, new Set())).toBe("CMSC216");
    expect(
      itemCourse({ courseLabel: "Advising", courseCode: null }, new Set()),
    ).toBeNull();
  });

  it("groups by course, open work first, with no-course items last", () => {
    const items = [
      item("math", TODAY, {
        courseLabel: "MATH240-0201: Linear Algebra",
        courseCode: "MATH240",
      }),
      item("cmsc", "2026-10-01"),
      item("cmsc-done", TODAY),
      item("advising", TODAY, { courseLabel: "Advising", courseCode: null }),
      item("personal", TODAY, { courseLabel: null, courseCode: null }),
      item("engl-done", TODAY, {
        courseLabel: "ENGL101-0501: Academic Writing",
        courseCode: "ENGL101",
      }),
      item("old-done", "2026-09-20"),
    ];
    const groups = groupByCourse(
      items,
      new Set(["cmsc-done", "engl-done", "old-done"]),
      TODAY,
    );
    expect(
      groups.map((g) => [
        g.key,
        g.open.map((i) => i.uid),
        g.done.map((i) => i.uid),
      ]),
    ).toEqual([
      ["CMSC216", ["cmsc"], ["cmsc-done"]],
      ["MATH240", ["math"], []],
      ["Advising", ["advising"], []],
      ["Other", ["personal"], []],
      ["ENGL101", [], ["engl-done"]],
    ]);
  });
});

describe("the header's words", () => {
  it("counts open items", () => {
    expect(
      openCount([item("a", TODAY), item("b", TODAY)], new Set(["a"])),
    ).toBe(1);
  });

  it("says how long ago", () => {
    const at = (minutes: number) =>
      new Date(NOW - minutes * 60_000).toISOString();
    expect(agoWords(at(0), NOW)).toBe("just now");
    expect(agoWords(at(-5), NOW)).toBe("just now");
    expect(agoWords(at(14), NOW)).toBe("14 min ago");
    expect(agoWords(at(60), NOW)).toBe("1 hour ago");
    expect(agoWords(at(185), NOW)).toBe("3 hours ago");
    expect(agoWords(at(24 * 60), NOW)).toBe("1 day ago");
    expect(agoWords(at(3 * 24 * 60), NOW)).toBe("3 days ago");
  });

  it("says when the feed was read, and whether the last try failed", () => {
    const ago14 = new Date(NOW - 14 * 60_000).toISOString();
    expect(feedWords(null, NOW)).toEqual({ checked: null, problem: null });
    expect(
      feedWords(
        aTodoFeedState({ lastSuccessAt: ago14, lastFetchAt: ago14 }),
        NOW,
      ),
    ).toEqual({ checked: "ELMS feed checked 14 min ago", problem: null });
    expect(
      feedWords(
        aTodoFeedState({
          lastSuccessAt: ago14,
          lastFetchAt: new Date(NOW).toISOString(),
          lastError: "timeout",
        }),
        NOW,
      ),
    ).toEqual({
      checked: "ELMS feed checked 14 min ago",
      problem: "ELMS didn't answer. We'll try again in 20 minutes.",
    });
    expect(
      feedWords(
        aTodoFeedState({ lastSuccessAt: null, lastError: "network" }),
        NOW,
      ),
    ).toEqual({
      checked: null,
      problem: "ELMS didn't answer. We'll try again in 20 minutes.",
    });
    expect(feedWords(aTodoFeedState({ status: "broken" }), NOW)).toEqual({
      checked: null,
      problem: "ELMS stopped sharing your calendar. Paste a new link.",
    });
  });

  it("asks ELMS again on open when the last read is over 10 minutes old", () => {
    const at = (ms: number) => new Date(NOW - ms).toISOString();
    expect(isStale(null, NOW)).toBe(false);
    expect(isStale(aTodoFeedState({ status: "broken" }), NOW)).toBe(false);
    expect(isStale(aTodoFeedState({ lastSuccessAt: null }), NOW)).toBe(true);
    expect(
      isStale(aTodoFeedState({ lastSuccessAt: at(TODO_OPEN_REFRESH_MS) }), NOW),
    ).toBe(false);
    expect(
      isStale(
        aTodoFeedState({ lastSuccessAt: at(TODO_OPEN_REFRESH_MS + 1) }),
        NOW,
      ),
    ).toBe(true);
  });
});

describe("courseChatTerm", () => {
  const due = (dueDate: string) => aTodoItem({ dueDate });
  it("is the term the next item is due in", () => {
    expect(
      courseChatTerm(
        { open: [due("2026-09-20"), due("2026-10-02")], done: [] },
        "2026-09-27",
      ),
    ).toBe("202608");
    // Only overdue work: the latest of it.
    expect(
      courseChatTerm({ open: [due("2026-12-15")], done: [] }, "2027-02-10"),
    ).toBe("202608");
    expect(courseChatTerm({ open: [], done: [] }, "2026-09-27")).toBeNull();
  });

  it("counts January's first weeks as the spring they lead into", () => {
    expect(
      courseChatTerm({ open: [due("2027-01-20")], done: [] }, "2027-01-10"),
    ).toBe("202701");
  });
});
