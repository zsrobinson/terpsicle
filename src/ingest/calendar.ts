import {
  type AcademicCalendar,
  AcademicCalendarSchema,
  calendarKey,
  type NoClasses,
  SCHEMA_VERSIONS,
  SEASON_BY_MONTH_CODE,
  type Season,
  TERMS_KEY,
  TermsFileSchema,
} from "~/core/schema";
import type { BlobStore } from "./blob-store";
import { JSON_TYPE, toJsonBytes } from "./hash";
import { squash } from "./html";
import type { HttpClient } from "./http";
import { type Logger, readJson } from "./publish";
import { isoDate, MONTHS } from "./time";

// The provost's academic calendar → calendar/<term>.json (DATA.md §4.5).
// calendar.md covers the current and next two academic years; older years are
// only on the HTML archive page, whose text has the same shape once tags are
// stripped (RESEARCH.md §5.6).

export const CALENDAR_URL = "https://provost.umd.edu/calendar.md";
export const ARCHIVED_CALENDAR_URL =
  "https://provost.umd.edu/calendar/archived";

export interface CalendarEvent {
  name: string;
  start: string;
  end: string;
}

/** Events per academic year (keyed by its fall year) and season. */
export type CalendarBlocks = Map<string, CalendarEvent[]>;

const blockKey = (fallYear: number, season: Season) => `${fallYear}:${season}`;

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
const DATE = String.raw`([A-Z][a-z]+) (\d{1,2})(?:st|nd|rd|th) \(([A-Z][a-z]+)\)`;
const SEASON_HEADER =
  /Fall (\d{4}) - (?:Summer|Spring) (\d{4}) Events for the (Fall|Winter|Spring|Summer) Season/g;
const EVENT = new RegExp(`Event (.+?) Date ${DATE}(?: To to ${DATE})?`, "g");

export class CalendarFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarFormatError";
  }
}

/**
 * The provost's dates carry no year. Fall events are in the block's fall
 * year; winter events in December are too (Winter Break); everything else is
 * in the next year. The weekday in parentheses must agree.
 */
function resolveDate(
  fallYear: number,
  season: Season,
  month: string,
  day: string,
  weekday: string,
): string {
  const m = MONTHS.indexOf(month.toLowerCase() as (typeof MONTHS)[number]);
  if (m < 0) throw new CalendarFormatError(`Unknown month "${month}"`);
  const sameYear = season === "fall" || (season === "winter" && m + 1 >= 8);
  const year = sameYear ? fallYear : fallYear + 1;
  const d = Number(day);
  const actual = WEEKDAYS[new Date(Date.UTC(year, m, d)).getUTCDay()];
  if (actual !== weekday.toLowerCase()) {
    throw new CalendarFormatError(
      `${month} ${day} ${year} is a ${actual}, but the calendar says ${weekday}; the year inference is wrong`,
    );
  }
  return isoDate(year, m + 1, d);
}

/** Flattened calendar text (Markdown or HTML) → events per academic year and season. */
export function parseCalendar(source: string): CalendarBlocks {
  const text = squash(
    source
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&"),
  );
  const blocks: CalendarBlocks = new Map();
  const headers = [...text.matchAll(SEASON_HEADER)];
  headers.forEach((header, i) => {
    const fallYear = Number(header[1]);
    const season = (header[3] ?? "").toLowerCase() as Season;
    const from = (header.index ?? 0) + header[0].length;
    const to = headers[i + 1]?.index ?? text.length;
    const events: CalendarEvent[] = [];
    for (const m of text.slice(from, to).matchAll(EVENT)) {
      const [, name = "", mo = "", d = "", wd = "", mo2, d2, wd2] = m;
      const start = resolveDate(fallYear, season, mo, d, wd);
      const end =
        mo2 && d2 && wd2 ? resolveDate(fallYear, season, mo2, d2, wd2) : start;
      events.push({ name: squash(name), start, end });
    }
    const key = blockKey(fallYear, season);
    if (events.length > 0 && !blocks.has(key)) blocks.set(key, events);
  });
  return blocks;
}

const STARTS = /^(first day of classes|classes begin|sessions? .*begins?)$/i;
const ENDS = /^(last day of classes|classes end|sessions? .*ends?)$/i;
const NO_CLASSES = /\b(break|recess|holiday|labor day)\b/i;

/** A term's published calendar from the parsed blocks, or null when the provost hasn't published it. */
export function termCalendar(
  blocks: CalendarBlocks,
  termId: string,
): { classesStart: string; classesEnd: string; noClasses: NoClasses[] } | null {
  const year = Number(termId.slice(0, 4));
  const season =
    SEASON_BY_MONTH_CODE[termId.slice(4) as keyof typeof SEASON_BY_MONTH_CODE];
  // Fall and winter sit in the block that starts that fall; spring and summer in the previous one.
  const fallYear = season === "fall" || season === "winter" ? year : year - 1;
  const events = blocks.get(blockKey(fallYear, season));
  if (!events) return null;
  const starts = events
    .filter((e) => STARTS.test(e.name))
    .map((e) => e.start)
    .sort();
  const ends = events
    .filter((e) => ENDS.test(e.name))
    .map((e) => e.end)
    .sort();
  const classesStart = starts[0];
  const classesEnd = ends[ends.length - 1];
  if (!classesStart || !classesEnd || classesEnd < classesStart) return null;
  const noClasses = events
    .filter(
      (e) =>
        NO_CLASSES.test(e.name) &&
        e.end >= classesStart &&
        e.start <= classesEnd,
    )
    .map((e) => ({ name: e.name, start: e.start, end: e.end }))
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  return { classesStart, classesEnd, noClasses };
}

export interface CalendarOptions {
  http: HttpClient;
  store: BlobStore;
  now: Date;
  log: Logger;
}

export interface CalendarResult {
  published: number;
  notPublished: number;
  errors: string[];
}

export async function runCalendar(
  options: CalendarOptions,
): Promise<CalendarResult> {
  const { http, store, now, log } = options;
  const terms = await readJson(store, TERMS_KEY, TermsFileSchema);
  if (!terms)
    throw new Error(`${TERMS_KEY} is missing; run the catalog job first`);
  const errors: string[] = [];

  const current = parseCalendar(await http.text(CALENDAR_URL));
  if (current.size === 0) {
    throw new CalendarFormatError(
      `${CALENDAR_URL} had no "Fall YYYY - Summer YYYY Events for the … Season" sections; the format changed`,
    );
  }
  let archived: CalendarBlocks = new Map();
  try {
    archived = parseCalendar(await http.text(ARCHIVED_CALENDAR_URL));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`archived calendar: ${message}`);
    log.warn("Skipped the archived calendar", { error: message });
  }
  const blocks: CalendarBlocks = new Map([...archived, ...current]);

  const result: CalendarResult = { published: 0, notPublished: 0, errors };
  for (const term of terms.terms) {
    const found = termCalendar(blocks, term.id);
    const calendar: AcademicCalendar = found
      ? {
          status: "published",
          schemaVersion: SCHEMA_VERSIONS.calendar,
          termId: term.id,
          source: sourceFor(current, archived, term.id) ?? CALENDAR_URL,
          fetchedAt: now.toISOString(),
          ...found,
        }
      : {
          status: "not-published",
          schemaVersion: SCHEMA_VERSIONS.calendar,
          termId: term.id,
          source: CALENDAR_URL,
          fetchedAt: now.toISOString(),
        };
    const parsed = AcademicCalendarSchema.safeParse(calendar);
    if (!parsed.success) {
      errors.push(
        `${term.id}: ${parsed.error.issues[0]?.message ?? "invalid"}`,
      );
      continue;
    }
    await store.put(calendarKey(term.id), toJsonBytes(parsed.data), {
      contentType: JSON_TYPE,
    });
    if (found) result.published++;
    else result.notPublished++;
  }
  return result;
}

function sourceFor(
  current: CalendarBlocks,
  archived: CalendarBlocks,
  termId: string,
): string | null {
  if (termCalendar(current, termId)) return CALENDAR_URL;
  if (termCalendar(archived, termId)) return ARCHIVED_CALENDAR_URL;
  return null;
}
