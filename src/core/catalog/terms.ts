import { SEASON_BY_MONTH_CODE, type Term, type TermId } from "../schema";

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
