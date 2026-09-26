import { addDays, easternToUtc } from "../ics/dates";
import type { IsoDate } from "../schema";

// Test mode's stand-in for ELMS (previews, `pnpm dev:mock`, e2e; docs/V3.md
// §3.3): feed links with these tokens are answered by the Worker itself,
// never fetched, and any other link is a 404. The items are dated from
// "today", so the list and "due tomorrow" always have something to show.

export const TEST_FEED_TOKENS = {
  /** A calendar with a week of invented deadlines. */
  calendar: "TerpsicleTestFeedCalendar0001",
  /** ELMS stopped sharing it: 404 every time. */
  gone: "TerpsicleTestFeedGone0001",
  /** Answers 200 with a page that isn't a calendar. */
  notCalendar: "TerpsicleTestFeedNotACalendar0001",
} as const;

export function testFeedLink(token: string): string {
  return `https://elms.umd.edu/feeds/calendars/user_${token}.ics`;
}

const stamp = (ms: number) =>
  new Date(ms)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

interface TestEvent {
  uid: string;
  summary: string;
  /** Days from today. */
  day: number;
  /** Minutes after midnight in New York; null for all day. */
  minutes: number | null;
  description?: string;
}

// Fixed UIDs, so done marks survive the dates moving each day.
const EVENTS: readonly TestEvent[] = [
  {
    uid: "event-assignment-9900001",
    summary: "Lab 6 [CMSC216-0103: Introduction to Computer Systems]",
    day: -2,
    minutes: 23 * 60 + 59,
  },
  {
    uid: "event-assignment-9900002",
    summary: "Project 2 [CMSC216-0103: Introduction to Computer Systems]",
    day: 1,
    minutes: 23 * 60 + 59,
  },
  {
    uid: "event-assignment-9900003",
    summary: "WebAssign 5 [MATH240-0201: Introduction to Linear Algebra]",
    day: 1,
    minutes: 23 * 60 + 59,
  },
  {
    uid: "event-assignment-9900004",
    summary: "Reading response 3 [ENGL101-0501: Academic Writing]",
    day: 3,
    minutes: null,
  },
  {
    uid: "event-calendar-event-9900005",
    summary: "Midterm 1 [CMSC216-0103: Introduction to Computer Systems]",
    day: 5,
    minutes: 13 * 60,
  },
  {
    uid: "event-assignment-9900006",
    summary: "Homework 4 [MATH240-0201: Introduction to Linear Algebra]",
    day: 6,
    minutes: 23 * 60 + 59,
    description: "Submit on Gradescope: https://www.gradescope.com/courses/1",
  },
];

/** The calendar token's feed, dated from `today` (America/New_York). */
export function testFeedIcs(today: IsoDate): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:icalendar-ruby",
    "VERSION:2.0",
    "X-WR-CALNAME:Test Student Calendar (test mode)",
  ];
  for (const event of EVENTS) {
    const date = addDays(today, event.day);
    const start =
      event.minutes === null
        ? `DTSTART;VALUE=DATE:${date.replace(/-/g, "")}`
        : `DTSTART:${stamp(easternToUtc(date, event.minutes))}`;
    const course = /(\d+)$/.exec(event.uid)?.[1] ?? "0";
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      start,
      `SUMMARY:${event.summary}`,
      `URL;VALUE=URI:https://elms.umd.edu/courses/990000/assignments/${course}`,
      ...(event.description ? [`DESCRIPTION:${event.description}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
