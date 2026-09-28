import {
  type IsoDate,
  SEASON_BY_MONTH_CODE,
  type Term,
  type TermId,
} from "../schema";

/** A term id as Testudo names it ("Spring 2027"); winter `YYYY12` is named for the next year. */
export function termLabel(termId: string): string {
  const year = Number(termId.slice(0, 4));
  const code = termId.slice(4);
  const season =
    SEASON_BY_MONTH_CODE[code as keyof typeof SEASON_BY_MONTH_CODE];
  if (!season || !Number.isFinite(year)) return termId;
  const name = season.charAt(0).toUpperCase() + season.slice(1);
  return `${name} ${season === "winter" ? year + 1 : year}`;
}

/** "Spring 2027" → "Spring ’27": a term's name where a bar is short of room. */
export function shortTermName(name: string): string {
  return name.replace(/ \d{2}(\d{2})$/, " ’$1");
}

/**
 * The months each season usually runs, first day of classes through grades,
 * as [month-day, month-day] of the term's calendar year; winter runs in the
 * January after its id's year. They cover the whole year. For when the
 * provost's calendar isn't there (not published yet, or a page that doesn't
 * load them).
 */
const SEASON_SPAN = {
  "01": ["01-25", "05-31"],
  "05": ["06-01", "08-20"],
  "08": ["08-21", "12-31"],
  "12": ["01-01", "01-24"],
} as const;

/** A term's usual span by its season. */
export function seasonSpan(termId: TermId): { start: IsoDate; end: IsoDate } {
  const code = termId.slice(4) as keyof typeof SEASON_SPAN;
  const year = Number(termId.slice(0, 4)) + (code === "12" ? 1 : 0);
  const [start, end] = SEASON_SPAN[code];
  return { start: `${year}-${start}`, end: `${year}-${end}` };
}

/**
 * The term whose usual months hold a date: Fall 2026 for 2026-10-01, Winter
 * 2027 (the `12` term of 2026) for 2027-01-10.
 */
export function seasonTermOf(date: IsoDate): TermId {
  const year = Number(date.slice(0, 4));
  const candidates: TermId[] = [
    `${year - 1}12`,
    `${year}01`,
    `${year}05`,
    `${year}08`,
  ];
  for (const termId of candidates) {
    const { start, end } = seasonSpan(termId);
    if (date >= start && date <= end) return termId;
  }
  // Unreachable while the spans cover the year; fall is the widest guess.
  return `${year}08`;
}

const MONTH_CODE_BY_SEASON = {
  spring: "01",
  summer: "05",
  fall: "08",
  winter: "12",
} as const;

/**
 * `termLabel` backwards: "Fall 2025" → its term id, "Winter 2027" → the
 * `YYYY12` of the year before. Any letter case; null for anything else.
 */
export function termIdFromLabel(label: string): TermId | null {
  const match = /^(spring|summer|fall|winter)\s+(\d{4})$/i.exec(label.trim());
  if (!match) return null;
  const season = (
    match[1] ?? ""
  ).toLowerCase() as keyof typeof MONTH_CODE_BY_SEASON;
  const year = Number(match[2]) - (season === "winter" ? 1 : 0);
  if (year < 1000) return null;
  return `${year}${MONTH_CODE_BY_SEASON[season]}`;
}

/**
 * The term to open (SPEC §3.0): the last one the person picked, if it still
 * exists; else the newest active fall or spring (the one people register
 * for); else the newest active term; else the newest term at all.
 */
export function pickTerm(
  terms: readonly Term[],
  lastTermId: TermId | null,
): Term | undefined {
  const remembered = lastTermId
    ? terms.find((t) => t.id === lastTermId)
    : undefined;
  if (remembered) return remembered;
  const newestFirst = [...terms].sort((a, b) => b.id.localeCompare(a.id));
  return (
    newestFirst.find(
      (t) =>
        t.status === "active" && (t.season === "fall" || t.season === "spring"),
    ) ??
    newestFirst.find((t) => t.status === "active") ??
    newestFirst[0]
  );
}
