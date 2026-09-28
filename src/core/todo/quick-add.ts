import { addDays, weekdayOf } from "../ics/dates";
import type { CourseCode, Day, IsoDate } from "../schema";
import { newYorkClock } from "./list";
import { type TaskFields, taskDateInWindow } from "./tasks";
import { type WeekStart, weekStartOf } from "./weeks";

// Todo's composer reads a task the way people type one (docs/V3.md §3.10):
// "read ch 4 for hist200 fri 5pm", "PS3 due tomorrow 11:59pm cmsc351",
// "exam 2 oct 14". It finds at most one date, one time and one course, says
// where each was in the text (the composer highlights them), and leaves the
// rest as the title. Pure: "now" is an argument, and dates are New York's.
// A small grammar of our own rather than a library: it's the few forms
// students type, every match has its place in the text, and it's tested
// here against New York's clock.

export type QuickAddKind = "date" | "time" | "course";

/** One recognized part of the text: what it is, and where. */
export interface QuickAddPart {
  kind: QuickAddKind;
  /** Where it starts and ends in the text (end exclusive). */
  start: number;
  end: number;
}

export interface QuickAddParse {
  /** The text without the recognized parts. */
  title: string;
  date: IsoDate | null;
  /** Minutes after midnight in New York. */
  time: number | null;
  course: CourseCode | null;
  /** In the order they appear in the text. */
  parts: QuickAddPart[];
}

export interface QuickAddOptions {
  /** The instant it's read at: "tomorrow" is New York's. */
  now: number;
  /** The courses a code can name: the person's plans' and ELMS's. */
  courses: readonly CourseCode[];
  /** "next week" starts on this day. */
  weekStart?: WeekStart;
  /** Kinds the person took off (a chip's ×): their words stay in the title. */
  ignore?: ReadonlySet<QuickAddKind>;
}

const WEEKDAYS: Record<string, Day> = {
  mon: "M",
  monday: "M",
  tue: "Tu",
  tues: "Tu",
  tuesday: "Tu",
  wed: "W",
  weds: "W",
  wednesday: "W",
  thu: "Th",
  thur: "Th",
  thurs: "Th",
  thursday: "Th",
  fri: "F",
  friday: "F",
  sat: "Sa",
  saturday: "Sa",
  sun: "Su",
  sunday: "Su",
};

const DAY_ORDER: readonly Day[] = ["M", "Tu", "W", "Th", "F", "Sa", "Su"];

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const WEEKDAY_WORDS = Object.keys(WEEKDAYS)
  .sort((a, b) => b.length - a.length)
  .join("|");
const MONTH_WORDS = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .join("|");

/** Words that lead into a date or time and go with it: "due fri", "by 5pm". */
const LEAD = String.raw`(?:(?:due|by|on|at|before)\s+)?`;
/** Not inside a word: "fri" in "friend" isn't Friday. */
const START = String.raw`(?<![\p{L}\p{N}])`;
const END = String.raw`(?![\p{L}\p{N}])`;
const ORDINAL = String.raw`(?:st|nd|rd|th)?`;

interface Candidate {
  kind: QuickAddKind;
  start: number;
  end: number;
  value: IsoDate | number | CourseCode;
}

type Rule = {
  kind: QuickAddKind;
  pattern: RegExp;
  read: (match: RegExpExecArray, ctx: Context) => Candidate["value"] | null;
};

interface Context {
  today: IsoDate;
  weekStart: WeekStart;
  courses: ReadonlyMap<string, CourseCode>;
}

const rx = (source: string) => new RegExp(source, "giu");

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isoOf(year: number, month: number, day: number): IsoDate | null {
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month))
    return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * A month and day without a year: this year's, unless that's more than a
 * month gone (Todo keeps 30 days back), then next year's. "jan 20" typed in
 * November is the coming January.
 */
function nextMonthDay(
  month: number,
  day: number,
  today: IsoDate,
): IsoDate | null {
  const year = Number(today.slice(0, 4));
  const date = isoOf(year, month, day);
  if (date === null) return isoOf(year + 1, month, day);
  return date < addDays(today, -30) ? isoOf(year + 1, month, day) : date;
}

function fullYear(text: string | undefined, today: IsoDate): number | null {
  if (text === undefined) return null;
  const n = Number(text);
  if (text.length === 2) return 2000 + n;
  return text.length === 4 ? n : Number(today.slice(0, 4));
}

/** The next `day` on or after `today`: "fri" on a Friday is today. */
function comingWeekday(day: Day, today: IsoDate): IsoDate {
  const from = DAY_ORDER.indexOf(weekdayOf(today));
  const to = DAY_ORDER.indexOf(day);
  return addDays(today, (to - from + 7) % 7);
}

/** 1–12 with am/pm, or a 24-hour clock, as minutes after midnight. */
function clock(
  hourText: string,
  minuteText: string | undefined,
  meridiem: string | undefined,
): number | null {
  const hour = Number(hourText);
  const minute = minuteText === undefined ? 0 : Number(minuteText);
  if (minute > 59) return null;
  if (meridiem !== undefined) {
    if (hour < 1 || hour > 12) return null;
    const pm = meridiem.toLowerCase().startsWith("p");
    return ((hour % 12) + (pm ? 12 : 0)) * 60 + minute;
  }
  if (hour > 23) return null;
  return hour * 60 + minute;
}

// In order of preference: where two overlap, the earlier rule wins
// ("exam 2 oct 14" is October 14th, not "2 oct").
const RULES: readonly Rule[] = [
  {
    // "oct 14", "October 14th", "oct. 14, 2026"
    kind: "date",
    pattern: rx(
      `${START}${LEAD}(${MONTH_WORDS})\\.?\\s+(\\d{1,2})${ORDINAL}(?:,?\\s+(\\d{4}))?${END}`,
    ),
    read: (m, { today }) => {
      const month = MONTHS[(m[1] ?? "").toLowerCase()] ?? 0;
      const day = Number(m[2]);
      const year = fullYear(m[3], today);
      return year === null
        ? nextMonthDay(month, day, today)
        : isoOf(year, month, day);
    },
  },
  {
    // "10/14", "10/14/26", "10/14/2026"
    kind: "date",
    pattern: rx(
      `${START}${LEAD}(\\d{1,2})/(\\d{1,2})(?:/(\\d{4}|\\d{2}))?${END}`,
    ),
    read: (m, { today }) => {
      const month = Number(m[1]);
      const day = Number(m[2]);
      const year = fullYear(m[3], today);
      return year === null
        ? nextMonthDay(month, day, today)
        : isoOf(year, month, day);
    },
  },
  {
    // "14 oct", "14th October"
    kind: "date",
    pattern: rx(
      `${START}${LEAD}(\\d{1,2})${ORDINAL}\\s+(${MONTH_WORDS})\\.?(?:,?\\s+(\\d{4}))?${END}`,
    ),
    read: (m, { today }) => {
      const month = MONTHS[(m[2] ?? "").toLowerCase()] ?? 0;
      const day = Number(m[1]);
      const year = fullYear(m[3], today);
      return year === null
        ? nextMonthDay(month, day, today)
        : isoOf(year, month, day);
    },
  },
  {
    kind: "date",
    pattern: rx(`${START}${LEAD}(today|tonight|tod)${END}`),
    read: (_, { today }) => today,
  },
  {
    kind: "date",
    pattern: rx(`${START}${LEAD}(tomorrow|tmrw|tmr|tmw)${END}`),
    read: (_, { today }) => addDays(today, 1),
  },
  {
    // "in 3 days", "in a week", "in 2 weeks"
    kind: "date",
    pattern: rx(`${START}${LEAD}in\\s+(a|an|\\d{1,3})\\s+(days?|weeks?)${END}`),
    read: (m, { today }) => {
      const n = /^an?$/i.test(m[1] ?? "") ? 1 : Number(m[1]);
      return addDays(today, (m[2] ?? "").startsWith("w") ? n * 7 : n);
    },
  },
  {
    // "next week": the day it starts on (Monday, or Sunday by the setting).
    kind: "date",
    pattern: rx(`${START}${LEAD}next\\s+week${END}`),
    read: (_, { today, weekStart }) =>
      addDays(weekStartOf(today, weekStart), 7),
  },
  {
    // "next fri": that day of next week.
    kind: "date",
    pattern: rx(`${START}${LEAD}next\\s+(${WEEKDAY_WORDS})\\.?${END}`),
    read: (m, { today, weekStart }) => {
      const day = WEEKDAYS[(m[1] ?? "").toLowerCase()];
      if (!day) return null;
      const next = addDays(weekStartOf(today, weekStart), 7);
      return comingWeekday(day, next);
    },
  },
  {
    // "fri", "this friday": the coming one, today included.
    kind: "date",
    pattern: rx(`${START}${LEAD}(?:this\\s+)?(${WEEKDAY_WORDS})\\.?${END}`),
    read: (m, { today }) => {
      const day = WEEKDAYS[(m[1] ?? "").toLowerCase()];
      return day ? comingWeekday(day, today) : null;
    },
  },
  {
    // "5pm", "11:59 p.m.", "at 5:30pm", "by 9am"
    kind: "time",
    // A lone "a" or "p" only right after the number: "3 a day" isn't 3am.
    pattern: rx(
      `${START}${LEAD}(\\d{1,2})(?::(\\d{2}))?(?:\\s?([ap])\\.?m\\.?|([ap]))${END}`,
    ),
    read: (m) => clock(m[1] ?? "", m[2], m[3] ?? m[4]),
  },
  {
    // "noon", "midnight" (the end of that day, as ELMS means it), "eod"
    kind: "time",
    pattern: rx(`${START}${LEAD}(noon|midnight|eod|end of day)${END}`),
    read: (m) =>
      (m[1] ?? "").toLowerCase() === "noon" ? 12 * 60 : 23 * 60 + 59,
  },
  {
    // "at 17:00", "17:00", "at 5" (1–7 read as afternoon, 8–11 as morning)
    kind: "time",
    pattern: rx(`${START}(at\\s+)?(\\d{1,2})(?::(\\d{2}))?${END}`),
    read: (m) => {
      const at = m[1] !== undefined;
      const hour = Number(m[2]);
      if (m[3] !== undefined) return clock(m[2] ?? "", m[3], undefined);
      // A bare number is a count ("ch 4"), unless "at" says it's a time.
      if (!at || hour < 1 || hour > 12) return null;
      return clock(
        String(hour),
        undefined,
        hour < 8 || hour === 12 ? "pm" : "am",
      );
    },
  },
  {
    // "cmsc351", "HIST 200", "for hist200": a course the person has.
    kind: "course",
    pattern: rx(
      `${START}(?:(?:for|in)\\s+)?(\\p{L}{4})\\s?(\\d{3}\\p{L}?)${END}`,
    ),
    read: (m, { courses }) =>
      courses.get(`${m[1] ?? ""}${m[2] ?? ""}`.toUpperCase()) ?? null,
  },
];

/**
 * Reads a task as typed: at most one date, time and course, where each is
 * in the text, and the rest as the title. A time with no date is today's if
 * it's still ahead, else tomorrow's, the way "5pm" reads.
 */
export function parseQuickAdd(
  text: string,
  { now, courses, weekStart = "monday", ignore }: QuickAddOptions,
): QuickAddParse {
  const clockNow = newYorkClock(now);
  const ctx: Context = {
    today: clockNow.date,
    weekStart,
    courses: new Map(courses.map((c) => [c.toUpperCase(), c])),
  };
  const taken: Candidate[] = [];
  for (const rule of RULES) {
    if (ignore?.has(rule.kind)) continue;
    if (taken.some((c) => c.kind === rule.kind)) continue;
    rule.pattern.lastIndex = 0;
    for (const match of text.matchAll(rule.pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      if (taken.some((c) => start < c.end && c.start < end)) continue;
      const value = rule.read(match, ctx);
      if (value === null) continue;
      taken.push({ kind: rule.kind, start, end, value });
      break;
    }
  }
  taken.sort((a, b) => a.start - b.start);

  let title = "";
  let at = 0;
  for (const part of taken) {
    title += `${text.slice(at, part.start)} `;
    at = part.end;
  }
  title += text.slice(at);

  const value = (kind: QuickAddKind) =>
    taken.find((c) => c.kind === kind)?.value ?? null;
  const time = value("time") as number | null;
  let date = value("date") as IsoDate | null;
  if (date === null && time !== null)
    date = time > clockNow.minutes ? clockNow.date : addDays(clockNow.date, 1);

  return {
    title: tidyTitle(title),
    date,
    time,
    course: value("course") as CourseCode | null,
    parts: taken.map(({ kind, start, end }) => ({ kind, start, end })),
  };
}

/** Spaces closed up, and no dangling "for" or comma where a part was. */
function tidyTitle(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim()
    .replace(/(?:[\s,;:-]+|\s+(?:due|by|on|at|for|in))+$/iu, "")
    .replace(/^[\s,;:-]+/u, "")
    .trim();
}

/** What the composer adds: what was typed, with what the pickers set over it. */
export interface QuickAddChoice {
  /** Set by a picker; `undefined` leaves the text's. */
  date?: IsoDate | null;
  time?: number | null;
  course?: CourseCode | null;
}

/**
 * The task the composer would add: the parse, with the pickers' choices
 * over it. A time needs a date, and the title can't be empty (the words
 * typed stand in when everything was recognized: "cmsc351 fri").
 */
export function quickAddFields(
  text: string,
  parse: QuickAddParse,
  choice: QuickAddChoice = {},
): TaskFields | null {
  const dueDate = choice.date !== undefined ? choice.date : parse.date;
  const dueTime = choice.time !== undefined ? choice.time : parse.time;
  const courseCode = choice.course !== undefined ? choice.course : parse.course;
  const title = parse.title || text.replace(/\s+/g, " ").trim();
  if (title === "") return null;
  return {
    title: title.slice(0, 300),
    courseCode,
    dueDate,
    dueTime: dueDate === null ? null : dueTime,
  };
}

/** Whether Todo can keep a task on this date (a month back to a year ahead). */
export function quickAddDateOk(date: IsoDate | null, now: number): boolean {
  return taskDateInWindow(date, newYorkClock(now).date);
}
