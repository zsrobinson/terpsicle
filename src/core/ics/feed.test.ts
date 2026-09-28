import { describe, expect, it } from "vitest";
import {
  aCourse,
  aMeeting,
  anOwnTask,
  anUnpublishedCalendar,
  aPlan,
  aPublishedCalendar,
  aSection,
  aTodoItem,
  FIXTURE_NOW,
} from "~/fixtures";
import { sectionRef } from "../catalog/catalog-index";
import {
  buildCalendarFeed,
  CALENDAR_FEED_NAME,
  deadlineEvent,
  deadlineSummary,
  deadlineUid,
  type FeedTerm,
  feedDeadlines,
  feedPlanFor,
  feedTermIds,
  googleCalendarUrl,
  nextTermId,
  webcalUrl,
} from "./feed";
import { eventUid } from "./ics";

const SPRING = "202701";
const NOW = FIXTURE_NOW;

const cmsc351 = aCourse({
  code: "CMSC351",
  title: "Algorithms",
  sections: [
    aSection({
      code: "0101",
      instructors: ["Clyde Kruskal"],
      meetings: [
        aMeeting({
          days: ["M", "W", "F"],
          start: 600,
          end: 650,
          building: "IRB",
          room: "0324",
        }),
        aMeeting({
          days: ["Tu"],
          start: 840,
          end: 890,
          kind: "discussion",
          building: "MTH",
          room: "0303",
        }),
      ],
    }),
  ],
});
const section = cmsc351.sections[0];
const ref = section ? sectionRef(cmsc351, section) : undefined;

/** Spring 2027: classes Jan 27–May 11, spring break Mar 14–21. */
const springTerm = (overrides: Partial<FeedTerm> = {}): FeedTerm => ({
  termId: SPRING,
  calendar: aPublishedCalendar(),
  sections: ref ? [ref] : [],
  ...overrides,
});

/** Unfolded content lines, so a test can match a whole property. */
function lines(ics: string): string[] {
  return ics.replace(/\r\n /g, "").split("\r\n");
}

/** Each VEVENT's lines. */
function events(ics: string): string[][] {
  const out: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines(ics)) {
    if (line === "BEGIN:VEVENT") current = [];
    else if (line === "END:VEVENT" && current) {
      out.push(current);
      current = null;
    } else current?.push(line);
  }
  return out;
}

const prop = (event: readonly string[], name: string) =>
  event.find((l) => l.startsWith(`${name}:`) || l.startsWith(`${name};`));

describe("feedTermIds: this term and next", () => {
  it("from fall, runs through winter to spring", () => {
    expect(feedTermIds("2026-10-01")).toEqual(["202608", "202612", "202701"]);
  });
  it("from spring, runs through summer to fall", () => {
    expect(feedTermIds("2027-02-15")).toEqual(["202701", "202705", "202708"]);
  });
  it("from summer, it's summer and fall", () => {
    expect(feedTermIds("2027-06-15")).toEqual(["202705", "202708"]);
  });
  it("from winter, it's winter and spring", () => {
    expect(feedTermIds("2027-01-10")).toEqual(["202612", "202701"]);
  });
  it("wraps the year after winter", () => {
    expect(nextTermId("202612")).toBe("202701");
    expect(nextTermId("202608")).toBe("202612");
  });
});

describe("feedPlanFor: the one place that picks the feed's plan", () => {
  const a = aPlan({ id: "plan_first", name: "Plan A", order: 0 });
  const b = aPlan({ id: "plan_second", name: "Plan B", order: 1 });
  const other = aPlan({ id: "plan_fall_only", termId: "202608", order: -1 });

  it("is the term's first tab", () => {
    expect(feedPlanFor(SPRING, [b, a, other])?.id).toBe("plan_first");
  });
  it("breaks a tie in tab order by age, then id", () => {
    const older = aPlan({
      id: "plan_older",
      order: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(feedPlanFor(SPRING, [a, older])?.id).toBe("plan_older");
  });
  it("is null without a plan in the term", () => {
    expect(feedPlanFor("202705", [a, b, other])).toBeNull();
  });
});

describe("class meetings", () => {
  it("repeat weekly in New York time, titled in the glossary's words", () => {
    const ics = buildCalendarFeed({
      terms: [springTerm()],
      deadlines: [],
      now: NOW,
    });
    const [lecture, discussion] = events(ics);
    expect(lecture).toBeDefined();
    expect(discussion).toBeDefined();
    if (!lecture || !discussion) return;
    expect(prop(lecture, "SUMMARY")).toBe("SUMMARY:CMSC351 Lecture");
    expect(prop(discussion, "SUMMARY")).toBe("SUMMARY:CMSC351 Discussion");
    // Wednesday Jan 27 is the first day of classes.
    expect(prop(lecture, "DTSTART")).toBe(
      "DTSTART;TZID=America/New_York:20270127T100000",
    );
    expect(prop(lecture, "DTEND")).toBe(
      "DTEND;TZID=America/New_York:20270127T105000",
    );
    // Through the last day of classes, as UTC (EDT by then: 23:59:59 - (-4h)).
    expect(prop(lecture, "RRULE")).toBe(
      "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20270512T035959Z",
    );
    // Spring break is left out.
    expect(prop(lecture, "EXDATE")).toContain("20270315T100000");
    expect(prop(lecture, "LOCATION")).toBe("LOCATION:IRB 0324");
    expect(prop(discussion, "LOCATION")).toBe("LOCATION:MTH 0303");
    expect(prop(lecture, "COLOR")).toBe("COLOR:firebrick");
  });

  it("keep the downloaded file's UIDs, so they update in place", () => {
    const ics = buildCalendarFeed({
      terms: [springTerm()],
      deadlines: [],
      now: NOW,
    });
    const [lecture] = events(ics);
    expect(prop(lecture ?? [], "UID")).toBe(
      `UID:${eventUid(SPRING, "CMSC351-0101", 0)}`,
    );
    const later = buildCalendarFeed({
      terms: [springTerm()],
      deadlines: [],
      now: "2026-11-01T00:00:00.000Z",
    });
    expect(events(later).map((e) => prop(e, "UID"))).toEqual(
      events(ics).map((e) => prop(e, "UID")),
    );
  });

  it("are left out for a term whose dates aren't published", () => {
    const ics = buildCalendarFeed({
      terms: [
        springTerm({ calendar: anUnpublishedCalendar({ termId: SPRING }) }),
        springTerm({ calendar: null }),
      ],
      deadlines: [],
      now: NOW,
    });
    expect(events(ics)).toEqual([]);
  });
});

describe("deadlines", () => {
  it("say what's due and in which course", () => {
    expect(deadlineSummary(aTodoItem())).toBe("Due: Project 2 (CMSC216)");
    expect(deadlineSummary(anOwnTask({ title: "Email  Dr. Kim\n" }))).toBe(
      "Due: Email Dr. Kim",
    );
    expect(
      deadlineSummary(aTodoItem({ kind: "event", title: "Midterm review" })),
    ).toBe("Midterm review (CMSC216)");
  });

  it("are an instant at the due time, with an alarm a day before", () => {
    const event = deadlineEvent(aTodoItem(), NOW);
    expect(event).not.toBeNull();
    if (!event) return;
    // 11:59pm on Sep 29 in New York is 03:59 UTC on the 30th.
    expect(prop(event, "DTSTART")).toBe("DTSTART:20260930T035900Z");
    expect(prop(event, "DTEND")).toBeUndefined();
    expect(prop(event, "SUMMARY")).toBe("SUMMARY:Due: Project 2 (CMSC216)");
    const alarm = event.slice(event.indexOf("BEGIN:VALARM"));
    expect(alarm).toEqual([
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Due: Project 2 (CMSC216)",
      "TRIGGER:-P1D",
      "END:VALARM",
      "END:VEVENT",
    ]);
  });

  it("cover the whole day when they have no time", () => {
    const event = deadlineEvent(
      anOwnTask({ title: "Read ch. 4", dueDate: "2026-10-31" }),
      NOW,
    );
    expect(prop(event ?? [], "DTSTART")).toBe("DTSTART;VALUE=DATE:20261031");
    expect(prop(event ?? [], "DTEND")).toBe("DTEND;VALUE=DATE:20261101");
    expect(event).toContain("TRIGGER:-P1D");
  });

  it("leave out own tasks with no date", () => {
    expect(deadlineEvent(anOwnTask(), NOW)).toBeNull();
  });

  it("never carry the item's link", () => {
    const event = deadlineEvent(aTodoItem(), NOW) ?? [];
    expect(event.join("\n")).not.toContain("elms.umd.edu");
  });

  it("have a UID from their Todo uid, the same on every fetch", () => {
    const uid = deadlineUid("event-assignment-4410001");
    expect(uid).toMatch(/^todo-[0-9a-f]{16}@terpsicle\.com$/);
    expect(deadlineUid("event-assignment-4410001")).toBe(uid);
    expect(deadlineUid("event-assignment-4410002")).not.toBe(uid);
    expect(prop(deadlineEvent(aTodoItem(), NOW) ?? [], "UID")).toBe(
      `UID:${uid}`,
    );
  });

  it("leave out what's done and what's in a hidden course", () => {
    const due = aTodoItem({ uid: "a" });
    const done = aTodoItem({ uid: "b" });
    const club = aTodoItem({ uid: "c", courseCode: "CLUB101" });
    expect(
      feedDeadlines(
        [due, done, club],
        new Set(["b"]),
        (i) => i.courseCode === "CLUB101",
      ),
    ).toEqual([due]);
  });
});

describe("subscribing", () => {
  const url = `https://terpsicle.com/cal/${"a".repeat(64)}.ics`;
  it("is a webcal:// link for Apple Calendar", () => {
    expect(webcalUrl(url)).toBe(
      `webcal://terpsicle.com/cal/${"a".repeat(64)}.ics`,
    );
    expect(webcalUrl("http://localhost:3000/cal/x.ics")).toBe(
      "webcal://localhost:3000/cal/x.ics",
    );
  });
  it("is Google Calendar's add-by-URL page for Google", () => {
    expect(googleCalendarUrl(url)).toBe(
      `https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2Fterpsicle.com%2Fcal%2F${"a".repeat(64)}.ics`,
    );
  });
});

describe("buildCalendarFeed", () => {
  it("is a valid calendar with a name, refresh hints and the time zone", () => {
    const ics = buildCalendarFeed({ terms: [], deadlines: [], now: NOW });
    const all = lines(ics);
    expect(all[0]).toBe("BEGIN:VCALENDAR");
    expect(all).toContain(`X-WR-CALNAME:${CALENDAR_FEED_NAME}`);
    expect(all).toContain("X-WR-TIMEZONE:America/New_York");
    expect(all).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT1H");
    expect(all).toContain("BEGIN:VTIMEZONE");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(events(ics)).toEqual([]);
  });

  it("holds classes and deadlines together", () => {
    const ics = buildCalendarFeed({
      terms: [springTerm()],
      deadlines: [aTodoItem(), anOwnTask({ dueDate: "2026-10-02" })],
      now: NOW,
    });
    expect(events(ics).map((e) => prop(e, "SUMMARY"))).toEqual([
      "SUMMARY:CMSC351 Lecture",
      "SUMMARY:CMSC351 Discussion",
      "SUMMARY:Due: Project 2 (CMSC216)",
      "SUMMARY:Due: Email Dr. Kim about the lab",
    ]);
    // Every line is at most 75 octets.
    for (const line of ics.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});
