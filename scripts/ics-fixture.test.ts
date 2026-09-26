import { describe, expect, it } from "vitest";
import { parseIcs } from "../src/core/todo";
import { redactFeed } from "./lib/ics-fixture";

// A small feed in Canvas's shape with the personal bits a real one carries.
const FEED = [
  "BEGIN:VCALENDAR",
  "PRODID:icalendar-ruby",
  "VERSION:2.0",
  "X-WR-CALNAME:Jordan Realname Calendar (ELMS-Canvas)",
  "X-WR-CALDESC:Calendar events for the user\\, Jordan Realname",
  "BEGIN:VEVENT",
  "DTSTART:20261001T035900Z",
  "DTEND:20261001T035900Z",
  "DESCRIPTION:Private instructions. Submit at https://www.gradescope.com/cou",
  " rses/1/assignments/2",
  "LOCATION:Somewhere",
  "SUMMARY:Project 2 [CMSC216-0103: Introduction to Computer Systems]",
  "URL;VALUE=URI:https://elms.umd.edu/courses/1300001/assignments/4410001",
  "UID:event-assignment-4410001",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART:20261002T170000Z",
  "SUMMARY:Midterm 1 [CMSC216-0103: Introduction to Computer Systems]",
  "UID:event-calendar-event-880001",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "DTSTART:20261009T143000Z",
  "SUMMARY:Therapy appointment [Jordan Realname]",
  "URL;VALUE=URI:https://elms.umd.edu/calendar?include_contexts=user_7654321#x",
  "UID:event-calendar-event-880002",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

describe("redactFeed", () => {
  const redacted = redactFeed(FEED, {
    fakeTitles: false,
    recordedOn: "2026-10-01",
  });

  it("drops the person's name, descriptions, locations and user ids", () => {
    for (const secret of [
      "Jordan",
      "Realname",
      "Private instructions",
      "Somewhere",
      "Therapy",
      "7654321",
    ])
      expect(redacted).not.toContain(secret);
    expect(redacted).toContain("X-WR-CALNAME:RECORDED FIXTURE 2026-10-01");
  });

  it("keeps what the parser reads: UIDs, dates, course labels, links and the Gradescope flag", () => {
    const before = parseIcs(FEED);
    const after = parseIcs(redacted);
    const shape = (p: typeof before) =>
      p.items.map(({ title: _, courseLabel: __, link: ___, ...rest }) => rest);
    expect(shape(after)).toEqual(shape(before));
    expect(after.items.map((i) => i.courseLabel)).toEqual([
      "CMSC216-0103: Introduction to Computer Systems",
      "CMSC216-0103: Introduction to Computer Systems",
      "Personal",
    ]);
    expect(after.items.map((i) => i.link)).toEqual([
      "https://elms.umd.edu/courses/1300001/assignments/4410001",
      null,
      "https://elms.umd.edu/calendar?include_contexts=user_0#x",
    ]);
    expect(after.items.map((i) => i.title)).toEqual([
      "Project 2",
      "Midterm 1",
      "Event 1",
    ]);
  });

  it("replaces every title with a fake on request, keeping exams as exams", () => {
    const fake = parseIcs(
      redactFeed(FEED, { fakeTitles: true, recordedOn: "2026-10-01" }),
    );
    expect(fake.items.map((i) => i.title)).toEqual([
      "Assignment 1",
      "Exam 1",
      "Event 1",
    ]);
    expect(fake.items.map((i) => i.looksLikeExam)).toEqual([
      false,
      true,
      false,
    ]);
  });

  it("writes CRLF lines folded at 75 characters", () => {
    for (const line of redacted.split("\r\n"))
      expect(line.length).toBeLessThanOrEqual(75);
    expect(redacted.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});
