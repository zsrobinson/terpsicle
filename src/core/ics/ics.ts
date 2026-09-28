import type { SectionRef } from "../catalog/catalog-index";
import type {
  AcademicCalendar,
  Day,
  IsoDate,
  IsoDateTime,
  PublishedCalendar,
  SectionKey,
  TermId,
  TimedMeeting,
} from "../schema";
import { eachDate, easternToUtc, weekdayOf } from "./dates";

// "Add to your calendar" (SPEC §3.10, RESEARCH §2): one weekly event per timed
// meeting, starting on the first real meeting day, in America/New_York, with
// breaks and holidays excluded and UIDs that stay the same on re-export. The
// calendar feed (./feed.ts) builds its classes from the same events.

export const ICS_TIMEZONE = "America/New_York";

export type IcsInput = {
  readonly termId: TermId;
  /** "Spring 2027". */
  readonly termName: string;
  readonly sections: readonly SectionRef[];
  /** The term's academic calendar; null when the file doesn't exist yet. */
  readonly calendar: AcademicCalendar | null;
  /** DTSTAMP. */
  readonly now: IsoDateTime;
};

export type IcsSkip = {
  readonly sectionKey: SectionKey;
  /** no-set-times: nothing to put on a calendar. no-meetings-in-term: its dates miss the term. */
  readonly reason: "no-set-times" | "no-meetings-in-term";
};

export type IcsResult =
  | {
      readonly kind: "ok";
      readonly ics: string;
      readonly eventCount: number;
      readonly skipped: readonly IcsSkip[];
    }
  /** The provost hasn't published this term's dates: say so (SPEC §3.0). */
  | { readonly kind: "not-published" }
  /** Nothing in the plan meets at set times. */
  | { readonly kind: "nothing-to-add"; readonly skipped: readonly IcsSkip[] };

const BYDAY: Record<Day, string> = {
  M: "MO",
  Tu: "TU",
  W: "WE",
  Th: "TH",
  F: "FR",
  Sa: "SA",
  Su: "SU",
};

const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${ICS_TIMEZONE}`,
  `X-LIC-LOCATION:${ICS_TIMEZONE}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0500",
  "TZOFFSETTO:-0400",
  "TZNAME:EDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0400",
  "TZOFFSETTO:-0500",
  "TZNAME:EST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

// ---------- text ----------

/** RFC 5545 TEXT escaping. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

const encoder = new TextEncoder();

/** Folds a content line to 75 octets per line, never splitting a UTF-8 character. */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    // Continuation lines start with a space, which counts toward their 75.
    const limit = out.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

/** A local date and time as `YYYYMMDDTHHMMSS`, for a TZID or floating value. */
export function localStamp(date: IsoDate, minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${date.replace(/-/g, "")}T${h}${m}00`;
}

/** An instant as `YYYYMMDDTHHMMSSZ`. */
export function utcStamp(ms: number): string {
  return new Date(ms)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/** FNV-1a with a seed; two of them make a 64-bit id with no crypto dependency. */
function fnv(text: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** A 64-bit id for `text`, the same every time: a UID's part before the @. */
export function stableId(text: string): string {
  return `${fnv(text, 0x811c9dc5)}${fnv(text, 0x050c5d1f)}`;
}

/** Stable across exports: the same term, section and meeting always get the same UID. */
export function eventUid(
  termId: TermId,
  key: SectionKey,
  meetingIndex: number,
): string {
  return `${stableId(`${termId}|${key}|${meetingIndex}`)}@terpsicle.com`;
}

// ---------- events ----------

function noClassDates(calendar: PublishedCalendar): Set<IsoDate> {
  const dates = new Set<IsoDate>();
  for (const range of calendar.noClasses)
    for (const d of eachDate(range.start, range.end)) dates.add(d);
  return dates;
}

/** An event's title for one meeting of a section. */
export type MeetingSummary = (ref: SectionRef, meeting: TimedMeeting) => string;

/** The downloaded file's titles: "CMSC351 Algorithms", "CMSC351 Discussion". */
function summaryOf(ref: SectionRef, meeting: TimedMeeting): string {
  if (meeting.kind === "discussion") return `${ref.course.code} Discussion`;
  if (meeting.kind === "lab") return `${ref.course.code} Lab`;
  return `${ref.course.code} ${ref.course.title}`;
}

function locationOf(meeting: TimedMeeting): string | null {
  if (meeting.online) return "Online";
  if (!meeting.building) return null;
  return meeting.room
    ? `${meeting.building} ${meeting.room}`
    : meeting.building;
}

/** What every class event needs besides its own section and meeting. */
type EventContext = {
  readonly termId: TermId;
  readonly now: IsoDateTime;
  readonly calendar: PublishedCalendar;
  readonly holidays: ReadonlySet<IsoDate>;
  readonly summary: MeetingSummary;
  /** Lines added to every event, before END:VEVENT (the feed's color). */
  readonly extra: readonly string[];
};

function eventLines(
  context: EventContext,
  ref: SectionRef,
  meeting: TimedMeeting,
  meetingIndex: number,
): string[] | null {
  const { calendar, holidays } = context;
  const own = ref.section.dates;
  const start =
    own && own.start > calendar.classesStart
      ? own.start
      : calendar.classesStart;
  const end =
    own && own.end < calendar.classesEnd ? own.end : calendar.classesEnd;
  const meetingDays = eachDate(start, end).filter((d) =>
    meeting.days.includes(weekdayOf(d)),
  );
  const first = meetingDays.find((d) => !holidays.has(d));
  if (!first) return null;
  const skipped = meetingDays.filter((d) => d > first && holidays.has(d));

  const tz = `TZID=${ICS_TIMEZONE}`;
  const instructors = ref.section.instructors.length
    ? ref.section.instructors.join(", ")
    : "Instructor TBA";
  const location = locationOf(meeting);
  const lines = [
    "BEGIN:VEVENT",
    `UID:${eventUid(context.termId, ref.key, meetingIndex)}`,
    `DTSTAMP:${utcStamp(Date.parse(context.now))}`,
    `DTSTART;${tz}:${localStamp(first, meeting.start)}`,
    `DTEND;${tz}:${localStamp(first, meeting.end)}`,
    // UNTIL is UTC (required with a TZID start): the end of the last day.
    `RRULE:FREQ=WEEKLY;BYDAY=${meeting.days.map((d) => BYDAY[d]).join(",")};UNTIL=${utcStamp(easternToUtc(end, 24 * 60 - 1) + 59_000)}`,
  ];
  if (skipped.length)
    lines.push(
      `EXDATE;${tz}:${skipped.map((d) => localStamp(d, meeting.start)).join(",")}`,
    );
  lines.push(`SUMMARY:${escapeText(context.summary(ref, meeting))}`);
  if (location) lines.push(`LOCATION:${escapeText(location)}`);
  lines.push(
    `DESCRIPTION:${escapeText(`Section ${ref.section.code} · ${instructors}`)}`,
    ...context.extra,
    "END:VEVENT",
  );
  return lines;
}

/**
 * One weekly event per timed meeting of each section, as content lines per
 * section, and the sections left out and why. Shared by the downloaded file
 * and the calendar feed, which titles and colors its events its own way.
 */
export function classEvents(
  input: {
    readonly termId: TermId;
    readonly sections: readonly SectionRef[];
    readonly calendar: PublishedCalendar;
    readonly now: IsoDateTime;
  },
  style: {
    readonly summary?: MeetingSummary;
    readonly extra?: readonly string[];
  } = {},
): { events: string[][]; skipped: IcsSkip[] } {
  const context: EventContext = {
    termId: input.termId,
    now: input.now,
    calendar: input.calendar,
    holidays: noClassDates(input.calendar),
    summary: style.summary ?? summaryOf,
    extra: style.extra ?? [],
  };
  const events: string[][] = [];
  const skipped: IcsSkip[] = [];
  for (const ref of input.sections) {
    const timed = ref.section.meetings
      .map((m, i) => ({ m, i }))
      .filter((x): x is { m: TimedMeeting; i: number } => x.m.timed);
    if (timed.length === 0) {
      skipped.push({ sectionKey: ref.key, reason: "no-set-times" });
      continue;
    }
    const lines = timed.flatMap(
      ({ m, i }) => eventLines(context, ref, m, i) ?? [],
    );
    if (lines.length === 0)
      skipped.push({ sectionKey: ref.key, reason: "no-meetings-in-term" });
    else events.push(lines);
  }
  return { events, skipped };
}

/**
 * A whole calendar: the header, the time zone and the events, folded and
 * CRLF-terminated. `extra` goes after the name (the feed's refresh hints).
 */
export function icsDocument({
  prodId,
  name,
  extra = [],
  events,
}: {
  prodId: string;
  name: string;
  extra?: readonly string[];
  events: readonly (readonly string[])[];
}): string {
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${prodId}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    `X-WR-TIMEZONE:${ICS_TIMEZONE}`,
    ...extra,
    ...VTIMEZONE,
    ...events.flat(),
    "END:VCALENDAR",
  ];
  return `${body.map(foldLine).join("\r\n")}\r\n`;
}

/** The .ics file for a plan's placed sections. */
export function buildIcs(input: IcsInput): IcsResult {
  const { calendar } = input;
  if (calendar === null || calendar.status !== "published")
    return { kind: "not-published" };
  const { events, skipped } = classEvents({ ...input, calendar });
  if (events.length === 0) return { kind: "nothing-to-add", skipped };
  return {
    kind: "ok",
    ics: icsDocument({
      prodId: "-//Terpsicle//Class schedule//EN",
      name: `${input.termName} classes`,
      events,
    }),
    eventCount: events.flat().filter((l) => l === "BEGIN:VEVENT").length,
    skipped,
  };
}

/** "terpsicle-spring-2027.ics" */
export function icsFileName(termName: string): string {
  const slug = termName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `terpsicle-${slug || "schedule"}.ics`;
}
