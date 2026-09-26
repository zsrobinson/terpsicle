import type { FeedItem, FeedSource, IcsParse, IsoDate } from "../schema";
import {
  feedItemKind,
  looksLikeExam,
  matchFeedCourse,
  mentionsGradescope,
  splitFeedTitle,
} from "./feed";
import { isElmsUrl } from "./link";
import { NEW_YORK, newYorkDateOf, resolveZone, zonedToUtc } from "./zones";

// A small RFC 5545 reader for ELMS (Canvas) calendar feeds and the .ics files
// people drop in (docs/V3.md §3.6, §3.7). No library: we need VEVENT's UID,
// SUMMARY, DTSTART, DTEND, URL and DESCRIPTION, line unfolding and text
// unescaping, and nothing unreadable may stop the rest.

const MAX_UID = 200;
const MAX_TITLE = 300;

/** One content line: `NAME;PARAM=value:value`, with the name and parameter names upper-cased. */
export interface ContentLine {
  name: string;
  params: Readonly<Record<string, string>>;
  value: string;
}

/**
 * Physical lines joined back into content lines (RFC 5545 §3.1): a line that
 * starts with a space or tab continues the one before, minus that one
 * character. CRLF is the standard; LF and CR alone are read too.
 */
export function unfoldLines(text: string): string[] {
  const lines: string[] = [];
  for (const line of text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/)) {
    const last = lines.length - 1;
    if ((line.startsWith(" ") || line.startsWith("\t")) && last >= 0)
      lines[last] += line.slice(1);
    else lines.push(line);
  }
  return lines;
}

/** Parses one content line; null when it isn't one. Quoted parameter values may hold `:`, `;` and `,`. */
export function parseContentLine(line: string): ContentLine | null {
  const name = /^[A-Za-z0-9-]+/.exec(line)?.[0];
  if (!name) return null;
  const params: Record<string, string> = {};
  let at = name.length;
  while (line[at] === ";") {
    const paramName = /^[A-Za-z0-9-]+/.exec(line.slice(at + 1))?.[0];
    if (!paramName || line[at + 1 + paramName.length] !== "=") return null;
    at += 2 + paramName.length;
    const values: string[] = [];
    for (;;) {
      if (line[at] === '"') {
        const close = line.indexOf('"', at + 1);
        if (close < 0) return null;
        values.push(line.slice(at + 1, close));
        at = close + 1;
      } else {
        const value = /^[^";:,]*/.exec(line.slice(at))?.[0] ?? "";
        values.push(value);
        at += value.length;
      }
      if (line[at] !== ",") break;
      at++;
    }
    params[paramName.toUpperCase()] = values.join(",");
  }
  if (line[at] !== ":") return null;
  return { name: name.toUpperCase(), params, value: line.slice(at + 1) };
}

/** A TEXT value's escapes undone: `\\`, `\;`, `\,`, and `\n` or `\N` for a newline. */
export function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, ch: string) =>
    ch === "n" || ch === "N" ? "\n" : ch,
  );
}

type When = { kind: "date"; date: IsoDate } | { kind: "instant"; ms: number };

function validDate(y: number, m: number, d: number): number | null {
  const ms = Date.UTC(y, m - 1, d);
  const back = new Date(ms);
  return back.getUTCFullYear() === y &&
    back.getUTCMonth() === m - 1 &&
    back.getUTCDate() === d
    ? ms
    : null;
}

/**
 * A DTSTART or DTEND: a `DATE` (all day), a UTC `DATE-TIME` (`…Z`), or a
 * local one in its `TZID`. A local time with no TZID ("floating") is read in
 * New York, where every ELMS course is. Null when it's unreadable or its zone
 * is unknown.
 */
export function readWhen(line: ContentLine): When | null {
  const value = line.value.trim();
  const date = /^(\d{4})(\d{2})(\d{2})$/.exec(value);
  if (date) {
    const ms = validDate(Number(date[1]), Number(date[2]), Number(date[3]));
    return ms === null
      ? null
      : { kind: "date", date: new Date(ms).toISOString().slice(0, 10) };
  }
  const time = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value);
  if (!time) return null;
  const day = validDate(Number(time[1]), Number(time[2]), Number(time[3]));
  const [hour, minute, second] = [time[4], time[5], time[6]].map(Number);
  if (
    day === null ||
    hour === undefined ||
    minute === undefined ||
    second === undefined ||
    hour > 23 ||
    minute > 59 ||
    second > 60
  )
    return null;
  // A leap second (:60) reads as :59.
  const local = day + ((hour * 60 + minute) * 60 + Math.min(second, 59)) * 1000;
  if (time[7] === "Z") return { kind: "instant", ms: local };
  const tzid = line.params.TZID;
  const zone = tzid === undefined ? NEW_YORK : resolveZone(tzid);
  const ms = zone === null ? null : zonedToUtc(local, zone);
  return ms === null ? null : { kind: "instant", ms };
}

interface EventLines {
  byName: Map<string, ContentLine>;
}

function readEvent(
  event: EventLines,
  source: FeedSource,
): { item: FeedItem; sequence: number } | "cancelled" | null {
  const get = (name: string) => event.byName.get(name);
  if (get("STATUS")?.value.trim().toUpperCase() === "CANCELLED")
    return "cancelled";

  const uid = unescapeText(get("UID")?.value ?? "").trim();
  const summary = unescapeText(get("SUMMARY")?.value ?? "").trim();
  const startLine = get("DTSTART");
  const start = startLine ? readWhen(startLine) : null;
  if (uid === "" || uid.length > MAX_UID || summary === "" || !start)
    return null;
  const endLine = get("DTEND");
  const end = endLine ? readWhen(endLine) : null;

  const { title, courseLabel } = splitFeedTitle(summary);
  const courses = matchFeedCourse(courseLabel);
  const url = get("URL")?.value.trim() || null;
  const description = unescapeText(get("DESCRIPTION")?.value ?? "");
  const gradescope = mentionsGradescope(url, description);
  const kind = feedItemKind(uid, title, gradescope);
  const sequence = Number.parseInt(get("SEQUENCE")?.value ?? "", 10);

  return {
    sequence: Number.isFinite(sequence) ? sequence : 0,
    item: {
      uid,
      source,
      title: title.slice(0, MAX_TITLE),
      courseLabel: courseLabel?.slice(0, MAX_TITLE) ?? null,
      courseCodes: courses.map((c) => c.code),
      sectionCode: courses[0]?.sectionCode ?? null,
      kind: kind.kind,
      kindFrom: kind.from,
      looksLikeExam: looksLikeExam(title),
      gradescope,
      dueAt: start.kind === "instant" ? new Date(start.ms).toISOString() : null,
      dueDate: start.kind === "instant" ? newYorkDateOf(start.ms) : start.date,
      endAt:
        start.kind === "instant" && end?.kind === "instant" && end.ms > start.ms
          ? new Date(end.ms).toISOString()
          : null,
      link: url !== null && isElmsUrl(url) ? new URL(url).href : null,
    },
  };
}

/**
 * Reads an ELMS calendar feed, or a dropped file with `source: "file"`.
 * Never throws: an event we can't read is skipped and counted, a cancelled
 * one is left out, and text without `BEGIN:VCALENDAR` isn't recognized.
 * Events that share a UID become one item: the higher SEQUENCE, else the
 * later one. A recurring event is read as its first occurrence.
 */
export function parseIcs(text: string, source: FeedSource = "elms"): IcsParse {
  const byUid = new Map<string, { item: FeedItem; sequence: number }>();
  let recognized = false;
  let skipped = 0;
  // Components nest (VALARM inside VEVENT); only VEVENT's own lines count.
  const stack: string[] = [];
  let event: EventLines | null = null;

  for (const raw of unfoldLines(text)) {
    const line = parseContentLine(raw);
    if (!line) continue;
    const value = line.value.trim().toUpperCase();
    if (line.name === "BEGIN") {
      stack.push(value);
      if (value === "VCALENDAR") recognized = true;
      if (value === "VEVENT" && stack.length >= 2)
        event = { byName: new Map() };
      continue;
    }
    if (line.name === "END") {
      if (stack.at(-1) !== value) continue;
      stack.pop();
      if (value === "VEVENT" && event) {
        const read = readEvent(event, source);
        event = null;
        if (read === null) skipped++;
        else if (read !== "cancelled") {
          const kept = byUid.get(read.item.uid);
          if (!kept || read.sequence >= kept.sequence)
            byUid.set(read.item.uid, read);
        }
      }
      continue;
    }
    if (event && stack.at(-1) === "VEVENT" && !event.byName.has(line.name))
      event.byName.set(line.name, line);
  }

  return {
    recognized,
    items: [...byUid.values()].map((r) => r.item),
    skipped,
  };
}
