import { termLabel } from "../catalog/terms";
import type { CourseCode, Credits, TermId } from "../schema";
import type { HistoryOffered, HistoryOfferedCourse } from "../schema/history";
import {
  nextOffering,
  OFFERING_YEARS,
  type OfferingSummary,
  offeringPhrase,
  offeringSummary,
} from "./offering-pattern";

// The offered file (`offered/courses.<hash>.json`, DATA.md §3.5): every
// course on record over the offering window and the terms it ran in, so
// Schedule's search can say when a course the term doesn't have is offered
// without reading every department's history. The history job patches it
// a term at a time (`patchHistoryOffered`); the client reads it back
// (`readHistoryOffered`) and matches a search against it
// (`notOfferedMatches`).

/** One course as a term's record names it. */
export type OfferedSighting = {
  readonly code: CourseCode;
  readonly title: string | null;
  readonly credits: Credits | null;
};

/** Term indices → hex, little end first: digit `i` holds indices `4i` to `4i + 3`. */
export function encodeTermBits(indices: Iterable<number>): string {
  const digits: number[] = [];
  for (const i of indices) {
    const at = i >> 2;
    while (digits.length <= at) digits.push(0);
    digits[at] = (digits[at] ?? 0) | (1 << (i & 3));
  }
  return digits.map((d) => d.toString(16)).join("");
}

/** The terms a hex mask sets, in `terms` order. */
export function decodeTermBits(
  hex: string,
  terms: readonly TermId[],
): TermId[] {
  const out: TermId[] = [];
  for (let at = 0; at < hex.length; at++) {
    const digit = Number.parseInt(hex.charAt(at), 16);
    for (let bit = 0; bit < 4; bit++) {
      const term = terms[at * 4 + bit];
      if (digit & (1 << bit) && term) out.push(term);
    }
  }
  return out;
}

const isFall = (t: TermId) => t.endsWith("08");
const schoolYear = (t: TermId) =>
  isFall(t) || t.endsWith("12")
    ? Number(t.slice(0, 4))
    : Number(t.slice(0, 4)) - 1;

/** The terms on record over the last `years` school years up to the newest, oldest first. */
export function offeredWindow(
  recorded: Iterable<TermId>,
  years: number = OFFERING_YEARS,
): TermId[] {
  const sorted = [...new Set(recorded)].sort();
  const newest = sorted.at(-1);
  if (!newest) return [];
  const start = `${schoolYear(newest) - years}08`;
  return sorted.filter((t) => t >= start);
}

type Entry = {
  title: string | null;
  credits: Credits | null;
  ran: Set<TermId>;
};

/** The file's courses as entries, by code. */
function entries(file: HistoryOffered | null): Map<CourseCode, Entry> {
  const out = new Map<CourseCode, Entry>();
  for (const [code, title, min, max, ran] of file?.courses ?? [])
    out.set(code, {
      title,
      credits: min === null || max === null ? null : { min, max },
      ran: new Set(decodeTermBits(ran, file?.terms ?? [])),
    });
  return out;
}

/**
 * The offered file with `reread`'s terms (each a whole term's record)
 * replacing their columns, over the window of `recorded` (every term the
 * history has). Terms that left the window go, and courses left with no
 * term. A course's title and credits follow the newest term that names
 * them.
 */
export function patchHistoryOffered(
  prev: HistoryOffered | null,
  input: {
    readonly recorded: Iterable<TermId>;
    readonly reread: ReadonlyMap<TermId, readonly OfferedSighting[]>;
    readonly years?: number;
  },
): HistoryOffered {
  const terms = offeredWindow(input.recorded, input.years);
  const keep = new Set(terms);
  const courses = entries(prev);
  const reread = [...input.reread.keys()].filter((t) => keep.has(t)).sort();
  for (const term of reread)
    for (const entry of courses.values()) entry.ran.delete(term);
  for (const term of reread) {
    for (const seen of input.reread.get(term) ?? []) {
      const entry = courses.get(seen.code) ?? {
        title: null,
        credits: null,
        ran: new Set<TermId>(),
      };
      const newest = [...entry.ran].every((t) => t < term);
      if (seen.title && (newest || !entry.title)) entry.title = seen.title;
      if (seen.credits && (newest || !entry.credits))
        entry.credits = seen.credits;
      entry.ran.add(term);
      courses.set(seen.code, entry);
    }
  }
  const index = new Map(terms.map((t, i) => [t, i]));
  const out: HistoryOfferedCourse[] = [];
  for (const [code, entry] of [...courses].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    const at = [...entry.ran].flatMap((t) => {
      const i = index.get(t);
      return i === undefined ? [] : [i];
    });
    if (at.length === 0) continue;
    out.push([
      code,
      entry.title,
      entry.credits?.min ?? null,
      entry.credits?.max ?? null,
      encodeTermBits(at.sort((a, b) => a - b)),
    ]);
  }
  return { schemaVersion: 1, terms, courses: out };
}

/** A course as the client reads the offered file. */
export type OfferedCourse = {
  readonly title: string | null;
  readonly credits: Credits | null;
  readonly ran: ReadonlySet<TermId>;
};

/** The offered file by code, each course's terms decoded. */
export function readHistoryOffered(
  file: HistoryOffered,
): ReadonlyMap<CourseCode, OfferedCourse> {
  return entries(file);
}

/** A search match the term doesn't have, with when it does run. */
export type NotOfferedMatch = {
  readonly code: CourseCode;
  readonly title: string | null;
  readonly credits: Credits | null;
  readonly summary: OfferingSummary;
  readonly next: { termId: TermId; likely: boolean } | null;
  /** "Not offered in Spring 2027": beside the code. */
  readonly status: string;
  /** "Usually fall only · Next likely Fall 2027": the row's third line. */
  readonly when: string;
  /** Both: "Not offered in Spring 2027 · Usually fall only · Next likely Fall 2027". */
  readonly words: string;
};

/** How many not-offered matches a search shows, after the term's own. */
export const NOT_OFFERED_LIMIT = 5;

/**
 * The search's matches (`ranked`, best first, from the offered file's
 * codes and titles) that the term doesn't have, in the same order, each
 * with its offering pattern. The search shows them after the term's own
 * results, greyed. A code the file has no record of is left out.
 */
export function notOfferedMatches(input: {
  readonly ranked: readonly CourseCode[];
  readonly inTerm: (code: CourseCode) => boolean;
  readonly offered: ReadonlyMap<CourseCode, OfferedCourse>;
  /** The offered file's terms: what's on record. */
  readonly recorded: readonly TermId[];
  readonly listed: ReadonlySet<TermId>;
  /** The newest term Testudo lists. */
  readonly now: TermId;
  /** The term being searched. */
  readonly termId: TermId;
  /** As typed: a course that stopped running shows only for its exact code. */
  readonly query: string;
  readonly limit?: number;
}): NotOfferedMatch[] {
  const recorded = new Set(input.recorded);
  const exact = input.query.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const out: NotOfferedMatch[] = [];
  for (const code of input.ranked) {
    if (out.length >= (input.limit ?? NOT_OFFERED_LIMIT)) break;
    if (input.inTerm(code)) continue;
    const course = input.offered.get(code);
    if (!course) continue;
    const summary = offeringSummary({
      offered: course.ran,
      recorded,
      now: input.now,
    });
    if (summary.pattern.kind === "discontinued" && code !== exact) continue;
    const next =
      summary.pattern.kind === "discontinued"
        ? null
        : nextOffering(summary, input.termId, input.listed, course.ran);
    const status = `Not offered in ${termLabel(input.termId)}`;
    const when = [
      offeringPhrase(summary),
      ...(next
        ? [`${next.likely ? "Next likely" : "Next"} ${termLabel(next.termId)}`]
        : []),
    ].join(" · ");
    const words = `${status} · ${when}`;
    out.push({
      code,
      title: course.title,
      credits: course.credits,
      summary,
      next,
      status,
      when,
      words,
    });
  }
  return out;
}
