import { termLabel } from "../catalog/terms";
import type { PlanetTerpSource, TermId } from "../schema";
import { formatMonthYear } from "../time/format";

// How current PlanetTerp's numbers are, in words (DATA.md §4.1). Honest
// numbers (DESIGN §5): say what the data covers, never "every semester".

/** The Grades header: "through Spring 2025, from PlanetTerp". */
export function gradesSourceWords(gradesThrough: TermId | null): string {
  return gradesThrough
    ? `through ${termLabel(gradesThrough)}, from PlanetTerp`
    : "from PlanetTerp";
}

/**
 * One quiet line when PlanetTerp has stopped updating ("PlanetTerp hasn't
 * updated since Apr 2026"), or null when it's current or we can't tell.
 * Information, not an alarm (DESIGN §5).
 */
export function planetTerpFreshnessWords(
  source: PlanetTerpSource | null | undefined,
): string | null {
  if (!source || source.status === "ok") return null;
  if (source.status === "gone") {
    return source.lastSuccessAt
      ? `PlanetTerp hasn't answered since ${formatMonthYear(source.lastSuccessAt)}, so these are its last numbers`
      : "PlanetTerp isn't answering, so these are its last numbers";
  }
  const since = source.latestReviewAt ?? source.lastSuccessAt;
  return since
    ? `PlanetTerp hasn't updated since ${formatMonthYear(since)}`
    : "PlanetTerp hasn't updated recently";
}
