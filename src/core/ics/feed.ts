import type { SectionRef } from "../catalog/catalog-index";
import { seasonTermOf } from "../catalog/terms";
import type {
  AcademicCalendar,
  IsoDate,
  IsoDateTime,
  Plan,
  TermId,
  TimedMeeting,
  TodoItem,
} from "../schema";
import { addDays } from "./dates";
import {
  classEvents,
  escapeText,
  icsDocument,
  type MeetingSummary,
  stableId,
  utcStamp,
} from "./ics";

// The calendar feed (docs/V2.md §6.7): one private link a calendar app
// subscribes to, holding this term's and next term's class meetings and the
// Todo deadlines still to do, each with a one-day-before alert. The Worker
// (src/server/calendar) gathers the inputs and serves what this builds; the
// events reuse the downloaded file's (./ics.ts), so a class looks the same in
// both. UIDs never change for the same meeting or deadline, so a calendar
// updates in place when the plan or the list does.

/** What a feed holds for one term: its first synced plan's placed sections. */
export type FeedTerm = {
  readonly termId: TermId;
  /** Null (or not published) leaves the term's classes out: no dates to repeat on. */
  readonly calendar: AcademicCalendar | null;
  readonly sections: readonly SectionRef[];
};

export type CalendarFeedInput = {
  readonly terms: readonly FeedTerm[];
  /** Todo deadlines to show: already without done ones and hidden courses. */
  readonly deadlines: readonly TodoItem[];
  /** DTSTAMP. */
  readonly now: IsoDateTime;
};

/** The calendar's name in the person's app. */
export const CALENDAR_FEED_NAME = "Terpsicle";

/**
 * How often a calendar app should check again. Apple and Outlook read these
 * hints; Google keeps its own schedule. An hour is fresh enough for rooms and
 * deadlines, and keeps the Worker's load small.
 */
const REFRESH = [
  "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  "X-PUBLISHED-TTL:PT1H",
];

/**
 * RFC 7986 colors in the products' hues (the design: classes wear Schedule's
 * red, deadlines Todo's yellow). CSS3 names, as the RFC asks; apps that
 * don't read COLOR use the calendar's own.
 */
const CLASS_COLOR = "COLOR:firebrick";
const DEADLINE_COLOR = "COLOR:goldenrod";

// ---------- which terms, which plan ----------

const NEXT_SEASON: Record<string, (year: number) => TermId> = {
  "01": (y) => `${y}05`,
  "05": (y) => `${y}08`,
  "08": (y) => `${y}12`,
  "12": (y) => `${y + 1}01`,
};

/** The term after `termId`: fall → winter (`YYYY12`) → spring of the next year. */
export function nextTermId(termId: TermId): TermId {
  const year = Number(termId.slice(0, 4));
  const next = NEXT_SEASON[termId.slice(4)];
  return next ? next(year) : `${year + 1}01`;
}

const isMainSeason = (termId: TermId) =>
  termId.endsWith("01") || termId.endsWith("08");

/**
 * "This term and next" on `today` (a New York date): the term whose months
 * hold today, then each term after it through the next fall or spring. From
 * October that's Fall, Winter and Spring; from June, Summer and Fall. A
 * winter or summer term in between comes along, since someone may take a
 * class in it.
 */
export function feedTermIds(today: IsoDate): TermId[] {
  const first = seasonTermOf(today);
  const out = [first];
  let term = first;
  do {
    term = nextTermId(term);
    out.push(term);
  } while (!isMainSeason(term));
  return out;
}

/** Tab order, the way the scheduler shows a term's plans. */
function byTab(a: Plan, b: Plan): number {
  return (
    a.order - b.order ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * The synced plan whose classes the feed carries for `termId`: today, the
 * term's first tab. The one place that decides it, so a "main plan" per term
 * can take over here. Null when the person has no plan in the term.
 */
export function feedPlanFor(
  termId: TermId,
  plans: readonly Plan[],
): Plan | null {
  return [...plans.filter((p) => p.termId === termId)].sort(byTab)[0] ?? null;
}

// ---------- classes ----------

/** The feed's titles, in the glossary's words: "CMSC351 Lecture", "MATH240 Discussion". */
export const feedMeetingSummary: MeetingSummary = (
  ref: SectionRef,
  meeting: TimedMeeting,
) => {
  const code = ref.course.code;
  if (meeting.kind === "lecture") return `${code} Lecture`;
  if (meeting.kind === "discussion") return `${code} Discussion`;
  if (meeting.kind === "lab") return `${code} Lab`;
  return code;
};

function termEvents(term: FeedTerm, now: IsoDateTime): string[][] {
  if (term.calendar === null || term.calendar.status !== "published") return [];
  return classEvents(
    {
      termId: term.termId,
      sections: term.sections,
      calendar: term.calendar,
      now,
    },
    { summary: feedMeetingSummary, extra: [CLASS_COLOR] },
  ).events;
}

// ---------- deadlines ----------

/** "Due: Project 2 (CMSC216)"; an ELMS event (not an assignment) without the "Due:". */
export function deadlineSummary(
  item: Pick<TodoItem, "title" | "courseCode" | "kind">,
): string {
  const title = item.title.replace(/\s+/g, " ").trim();
  const course = item.courseCode ? ` (${item.courseCode})` : "";
  return item.kind === "event" ? `${title}${course}` : `Due: ${title}${course}`;
}

const SOURCE_WORDS: Record<TodoItem["source"], string> = {
  elms: "From ELMS, in Terpsicle Todo",
  file: "From a file, in Terpsicle Todo",
  own: "Your task, in Terpsicle Todo",
};

/** A deadline's UID: from its Todo uid, so it's the same on every fetch. */
export function deadlineUid(uid: string): string {
  return `todo-${stableId(`todo|${uid}`)}@terpsicle.com`;
}

/**
 * One event for a deadline, or null for an own task with no date. A timed
 * one is an instant (no DTEND: RFC 5545 makes it end when it starts); an
 * all-day one covers its date. Either way the alarm goes a day before.
 */
export function deadlineEvent(
  item: TodoItem,
  now: IsoDateTime,
): string[] | null {
  if (item.dueDate === null) return null;
  const summary = escapeText(deadlineSummary(item));
  const when =
    item.dueAt !== null
      ? [`DTSTART:${utcStamp(Date.parse(item.dueAt))}`]
      : [
          `DTSTART;VALUE=DATE:${item.dueDate.replace(/-/g, "")}`,
          `DTEND;VALUE=DATE:${addDays(item.dueDate, 1).replace(/-/g, "")}`,
        ];
  return [
    "BEGIN:VEVENT",
    `UID:${deadlineUid(item.uid)}`,
    `DTSTAMP:${utcStamp(Date.parse(now))}`,
    ...when,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${escapeText(SOURCE_WORDS[item.source])}`,
    // Shown as free time: a deadline doesn't make you busy.
    "TRANSP:TRANSPARENT",
    DEADLINE_COLOR,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${summary}`,
    "TRIGGER:-P1D",
    "END:VALARM",
    "END:VEVENT",
  ];
}

/**
 * The deadlines a feed shows, from Todo's items and own tasks: the ones not
 * marked done, and not in a course the person hid (`hidden` says which).
 */
export function feedDeadlines(
  items: readonly TodoItem[],
  done: ReadonlySet<string>,
  hidden: (item: TodoItem) => boolean = () => false,
): TodoItem[] {
  return items.filter((i) => !done.has(i.uid) && !hidden(i));
}

// ---------- subscribing ----------

/** Apple Calendar (and most desktop apps) subscribe to `webcal://` links. */
export function webcalUrl(feedUrl: string): string {
  return feedUrl.replace(/^https?:\/\//, "webcal://");
}

/** Google Calendar's "add by URL", opened on the feed. */
export function googleCalendarUrl(feedUrl: string): string {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl(feedUrl))}`;
}

// ---------- the feed ----------

/** The whole feed. Always a valid calendar, with no events when there's nothing yet. */
export function buildCalendarFeed(input: CalendarFeedInput): string {
  const events = [
    ...input.terms.flatMap((t) => termEvents(t, input.now)),
    ...input.deadlines.flatMap((d) => {
      const event = deadlineEvent(d, input.now);
      return event ? [event] : [];
    }),
  ];
  return icsDocument({
    prodId: "-//Terpsicle//Calendar feed//EN",
    name: CALENDAR_FEED_NAME,
    extra: REFRESH,
    events,
  });
}
