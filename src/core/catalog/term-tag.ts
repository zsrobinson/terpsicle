import type { AcademicCalendar, IsoDate, TermId } from "../schema";
import { termSpan } from "./terms";

// Term tags (docs/V2.md §5.5): "Now" on the term in session and "Next" on
// the fall or spring you're planning, everywhere a term is named, so
// Schedule (usually Next) and Chat or Todo (Now) never leave you guessing
// which semester you're looking at. Worked out from the academic calendar
// the way Plan's term status is (`termSpan`: first day of classes through
// grades), so every product agrees.

export type TermTag = "now" | "next";

export type TermTags = {
  /** The term in session, if any: between two terms, none is. */
  readonly now: TermId | null;
  /** The first fall or spring still to start: the one you register for. */
  readonly next: TermId | null;
};

/** The terms that can be Now or Next on `today`: their calendars are worth having. */
export function termTagCandidates(today: IsoDate): TermId[] {
  const year = Number(today.slice(0, 4));
  return [
    `${year - 1}08`,
    `${year - 1}12`,
    `${year}01`,
    `${year}05`,
    `${year}08`,
    `${year + 1}01`,
  ];
}

/**
 * Now and Next on `today`. A term without a published calendar uses its
 * season's usual months. When two terms' spans overlap (one's grades
 * window and the next one's first days), the one that started last is Now.
 * Winter and summer are only ever Now, never Next.
 */
export function termTags(
  today: IsoDate,
  calendars: readonly AcademicCalendar[],
): TermTags {
  let now: { termId: TermId; start: IsoDate } | null = null;
  for (const termId of termTagCandidates(today)) {
    const { start, end } = termSpan(termId, calendars);
    if (today >= start && today <= end && (!now || start > now.start))
      now = { termId, start };
  }
  const next =
    termTagCandidates(today).find(
      (termId) =>
        (termId.endsWith("01") || termId.endsWith("08")) &&
        termId !== now?.termId &&
        termSpan(termId, calendars).start > today,
    ) ?? null;
  return { now: now?.termId ?? null, next };
}

/** A term's tag, if it has one. */
export function termTagOf(termId: TermId, tags: TermTags): TermTag | null {
  if (termId === tags.now) return "now";
  if (termId === tags.next) return "next";
  return null;
}
