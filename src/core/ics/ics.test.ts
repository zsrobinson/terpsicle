import { describe, expect, it } from "vitest";
import type { AcademicCalendar, PublishedCalendar } from "../schema";
import { sectionRef } from "../catalog/catalog-index";
import { aCourse, aMeeting, anUntimedMeeting, aSection } from "../test-support/builders";
import { addDays, easternOffsetMinutes, easternToUtc, eachDate, weekdayOf } from "./dates";
import { buildIcs, escapeText, eventUid, foldLine, type IcsInput, icsFileName } from "./ics";

const SPRING = "202701";
const NOW = "2026-09-25T12:00:00.000Z";

/** Spring 2027 as the provost publishes it (src/ingest/__fixtures__/provost/calendar.md). */
const spring: PublishedCalendar = {
  status: "published",
  schemaVersion: 1,
  termId: SPRING,
  source: "https://provost.umd.edu/calendar.md",
  fetchedAt: NOW,
  classesStart: "2027-01-27",
  classesEnd: "2027-05-11",
  noClasses: [{ name: "Spring Break", start: "2027-03-14", end: "2027-03-21" }],
};

const cmsc351 = aCourse({
  code: "CMSC351",
  title: "Algorithms",
  sections: [
    aSection({
      code: "0101",
      instructors: ["Clyde Kruskal", "Justin Wyss-Gallifent"],
      meetings: [
        aMeeting({ days: ["M", "W", "F"], start: 600, end: 650, building: "IRB", room: "0318" }),
        aMeeting({ days: ["Tu"], start: 540, end: 590, kind: "discussion", building: "CSI", room: "1115" }),
      ],
    }),
  ],
});
const engl = aCourse({
  code: "ENGL393",
  title: "Technical Writing; Online, Sync",
  sections: [
    aSection({ code: "0312", instructors: [], meetings: [aMeeting({ days: ["Th"], start: 1110, end: 1260, online: true, building: null, room: null })] }),
    aSection({ code: "0401", delivery: "online-async", meetings: [anUntimedMeeting()] }),
  ],
});
const half = aCourse({
  code: "BMGT289",
  title: "Half Term",
  sections: [aSection({ code: "0101", meetings: [aMeeting({ days: ["Sa"], start: 540, end: 690, kind: "lab", room: null })], dates: { start: "2027-03-22", end: "2027-04-30" } } as never)],
});

// biome-ignore lint/style/noNonNullAssertion: every course above has these sections
const ref = (course: typeof cmsc351, i = 0) => sectionRef(course, course.sections[i]!);

const input = (overrides: Partial<IcsInput> = {}): IcsInput => ({
  termId: SPRING,
  termName: "Spring 2027",
  sections: [ref(cmsc351), ref(engl), ref(engl, 1), ref(half)],
  calendar: spring,
  now: NOW,
  ...overrides,
});

function ok(result: ReturnType<typeof buildIcs>) {
  if (result.kind !== "ok") throw new Error(`expected an ics, got ${result.kind}`);
  return result;
}

/** Unfolded content lines. */
const lines = (ics: string) => ics.replace(/\r\n /g, "").split("\r\n");

describe("buildIcs", () => {
  it("matches the golden file", async () => {
    const result = ok(buildIcs(input()));
    expect(result.eventCount).toBe(4);
    expect(result.skipped).toEqual([{ sectionKey: "ENGL393-0401", reason: "no-set-times" }]);
    await expect(result.ics).toMatchFileSnapshot("__golden__/spring-2027.ics");
  });

  it("uses CRLF and folds every line to 75 octets", () => {
    const { ics } = ok(buildIcs(input()));
    expect(ics.endsWith("\r\n")).toBe(true);
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });

  it("starts on the first real meeting day, not the first day of classes", () => {
    const all = lines(ok(buildIcs(input())).ics);
    // Classes start Wednesday Jan 27: MWF starts that day, Tuesday's discussion on Feb 2,
    // Thursday's class on Jan 28, and the half-term Saturday lab on its own start.
    expect(all.filter((l) => l.startsWith("DTSTART;"))).toEqual([
      "DTSTART;TZID=America/New_York:20270127T100000",
      "DTSTART;TZID=America/New_York:20270202T090000",
      "DTSTART;TZID=America/New_York:20270128T183000",
      "DTSTART;TZID=America/New_York:20270327T090000",
    ]);
  });

  it("repeats weekly until the last day of classes, in UTC", () => {
    const all = lines(ok(buildIcs(input())).ics);
    expect(all).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20270512T035959Z");
    expect(all).toContain("RRULE:FREQ=WEEKLY;BYDAY=SA;UNTIL=20270501T035959Z");
  });

  it("excludes breaks at the class's local time", () => {
    const all = lines(ok(buildIcs(input())).ics);
    expect(all).toContain(
      "EXDATE;TZID=America/New_York:20270315T100000,20270317T100000,20270319T100000",
    );
    expect(all).toContain("EXDATE;TZID=America/New_York:20270316T090000");
  });

  it("moves the first event past a holiday on the first day", () => {
    const cal: PublishedCalendar = { ...spring, noClasses: [{ name: "Snow day", start: "2027-01-27", end: "2027-01-27" }] };
    const all = lines(ok(buildIcs(input({ calendar: cal, sections: [ref(cmsc351)] }))).ics);
    expect(all).toContain("DTSTART;TZID=America/New_York:20270129T100000");
    expect(all.some((l) => l.startsWith("EXDATE") && l.includes("20270127"))).toBe(false);
  });

  it("escapes text and describes the section", () => {
    const all = lines(ok(buildIcs(input())).ics);
    expect(all).toContain("SUMMARY:ENGL393 Technical Writing\\; Online\\, Sync");
    expect(all).toContain("SUMMARY:CMSC351 Discussion");
    expect(all).toContain("SUMMARY:BMGT289 Lab");
    expect(all).toContain("LOCATION:Online");
    expect(all).toContain("LOCATION:CSI 1115");
    expect(all).toContain("LOCATION:IRB");
    expect(all).toContain("DESCRIPTION:Section 0101 · Clyde Kruskal\\, Justin Wyss-Gallifent");
    expect(all).toContain("DESCRIPTION:Section 0312 · Instructor TBA");
  });

  it("says when the calendar isn't published", () => {
    const notYet: AcademicCalendar = {
      status: "not-published",
      schemaVersion: 1,
      termId: SPRING,
      source: "https://provost.umd.edu/calendar.md",
      fetchedAt: NOW,
    };
    expect(buildIcs(input({ calendar: notYet }))).toEqual({ kind: "not-published" });
    expect(buildIcs(input({ calendar: null }))).toEqual({ kind: "not-published" });
  });

  it("has nothing to add when nothing meets at set times", () => {
    const outside = aCourse({
      code: "MATH240",
      sections: [aSection({ dates: { start: "2027-06-01", end: "2027-07-01" } } as never)],
    });
    expect(buildIcs(input({ sections: [ref(engl, 1), ref(outside)] }))).toEqual({
      kind: "nothing-to-add",
      skipped: [
        { sectionKey: "ENGL393-0401", reason: "no-set-times" },
        { sectionKey: "MATH240-0101", reason: "no-meetings-in-term" },
      ],
    });
  });

  it("keeps UIDs stable and distinct", () => {
    expect(eventUid(SPRING, "CMSC351-0101", 0)).toBe(eventUid(SPRING, "CMSC351-0101", 0));
    expect(eventUid(SPRING, "CMSC351-0101", 0)).toMatch(/^[0-9a-f]{16}@terpsicle\.com$/);
    const uids = new Set([
      eventUid(SPRING, "CMSC351-0101", 0),
      eventUid(SPRING, "CMSC351-0101", 1),
      eventUid(SPRING, "CMSC351-0201", 0),
      eventUid("202608", "CMSC351-0101", 0),
    ]);
    expect(uids.size).toBe(4);
    const first = ok(buildIcs(input())).ics;
    const again = ok(buildIcs(input({ now: "2026-10-01T00:00:00.000Z" }))).ics;
    const uidLines = (ics: string) => lines(ics).filter((l) => l.startsWith("UID:"));
    expect(uidLines(again)).toEqual(uidLines(first));
  });

  it("names the file", () => {
    expect(icsFileName("Spring 2027")).toBe("terpsicle-spring-2027.ics");
    expect(icsFileName("!!")).toBe("terpsicle-schedule.ics");
  });
});

describe("text encoding", () => {
  it("escapes backslashes, semicolons, commas and newlines", () => {
    expect(escapeText("a\\b;c,d\ne\r\nf")).toBe("a\\\\b\\;c\\,d\\ne\\nf");
  });

  it("folds long lines without splitting a character", () => {
    const line = `DESCRIPTION:${"é".repeat(60)}`;
    const folded = foldLine(line);
    const parts = folded.split("\r\n");
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(line);
    expect(foldLine("SHORT:line")).toBe("SHORT:line");
  });
});

describe("dates", () => {
  it("does calendar arithmetic", () => {
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(weekdayOf("2027-01-27")).toBe("W");
    expect(weekdayOf("2027-01-31")).toBe("Su");
    expect(eachDate("2027-03-13", "2027-03-15")).toEqual(["2027-03-13", "2027-03-14", "2027-03-15"]);
  });

  it("follows US daylight saving for America/New_York", () => {
    expect(easternOffsetMinutes("2027-03-14", 119)).toBe(-300);
    expect(easternOffsetMinutes("2027-03-14", 120)).toBe(-240);
    expect(easternOffsetMinutes("2027-07-01", 600)).toBe(-240);
    expect(easternOffsetMinutes("2026-11-01", 119)).toBe(-240);
    expect(easternOffsetMinutes("2026-11-01", 120)).toBe(-300);
    expect(easternOffsetMinutes("2027-01-27", 600)).toBe(-300);
    expect(new Date(easternToUtc("2027-01-27", 600)).toISOString()).toBe("2027-01-27T15:00:00.000Z");
    expect(new Date(easternToUtc("2027-05-11", 600)).toISOString()).toBe("2027-05-11T14:00:00.000Z");
  });
});
