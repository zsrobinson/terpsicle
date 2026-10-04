import { describe, expect, it } from "vitest";
import { anOwnTask, aTodoFeedState, aTodoItem } from "~/fixtures";
import {
  compareItems,
  courseChatTerm,
  dayLabel,
  dueTimeLabel,
  dueWords,
  feedWords,
  isStale,
  itemCourse,
  listRange,
  newYorkClock,
  TODO_OPEN_REFRESH_MS,
} from "./list";

// 2026-09-29 is a Tuesday.
const TODAY = "2026-09-29";
const NOW = Date.parse("2026-09-29T16:00:00.000Z");

const item = (uid: string, dueDate: string, extra = {}) =>
  aTodoItem({ uid, dueDate, dueAt: null, title: uid, ...extra });

describe("listRange", () => {
  it("reaches four weeks back, for the chart, and fits inside todo/list's 120 days", () => {
    expect(listRange(TODAY)).toEqual({ from: "2026-09-01", to: "2026-12-29" });
    const { from, to } = listRange(TODAY);
    expect((Date.parse(to) - Date.parse(from)) / 86_400_000).toBeLessThan(120);
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

describe("itemCourse", () => {
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
});

describe("the sync's words", () => {
  it("says when the feed was read, and whether the last try failed", () => {
    const ago14 = new Date(NOW - 14 * 60_000).toISOString();
    expect(feedWords(null, NOW)).toEqual({ synced: null, problem: null });
    expect(
      feedWords(
        aTodoFeedState({ lastSuccessAt: ago14, lastFetchAt: ago14 }),
        NOW,
      ),
    ).toEqual({ synced: "ELMS synced 14 minutes ago", problem: null });
    const ago185 = new Date(NOW - 185 * 60_000).toISOString();
    expect(
      feedWords(
        aTodoFeedState({ lastSuccessAt: ago185, lastFetchAt: ago185 }),
        NOW,
      ).synced,
    ).toBe("ELMS synced 3 hours ago");
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
      synced: "ELMS synced 14 minutes ago",
      problem: "ELMS didn't answer. We'll try again in 20 minutes.",
    });
    expect(
      feedWords(
        aTodoFeedState({ lastSuccessAt: null, lastError: "network" }),
        NOW,
      ),
    ).toEqual({
      synced: null,
      problem: "ELMS didn't answer. We'll try again in 20 minutes.",
    });
    expect(feedWords(aTodoFeedState({ status: "broken" }), NOW)).toEqual({
      synced: null,
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
      courseChatTerm([due("2026-10-02"), due("2026-09-20")], "2026-09-27"),
    ).toBe("202608");
    // Only past work: the latest of it.
    expect(
      courseChatTerm([due("2026-12-15"), due("2026-11-01")], "2027-02-10"),
    ).toBe("202608");
    expect(courseChatTerm([], "2026-09-27")).toBeNull();
  });

  it("counts January's first weeks as the spring they lead into", () => {
    expect(courseChatTerm([due("2027-01-20")], "2027-01-10")).toBe("202701");
  });

  it("is today's term for own tasks with no date", () => {
    expect(courseChatTerm([anOwnTask()], "2026-09-27")).toBe("202608");
    // A dated item still decides.
    expect(courseChatTerm([anOwnTask(), due("2027-01-20")], "2026-12-20")).toBe(
      "202701",
    );
  });
});

describe("own tasks with no date", () => {
  const undated = (uid: string, extra = {}) =>
    anOwnTask({ uid: `own-${uid}-0000`, title: uid, ...extra });

  it("sort after every dated item", () => {
    const later = item("later", "2026-12-01");
    expect(
      [undated("a"), later, item("soon", TODAY)]
        .sort(compareItems)
        .map((i) => i.title),
    ).toEqual(["soon", "later", "a"]);
  });

  it("say No date", () => {
    expect(dueWords(undated("x"), TODAY)).toBe("No date");
    expect(dueWords(item("x", "2026-10-02"), TODAY)).toBe(
      "Friday, Oct 2 · All day",
    );
  });
});
