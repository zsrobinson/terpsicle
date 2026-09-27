// Only the schema's types: Plan's bar reads this without the scheduler's
// problem detection.
import type { Severity } from "../schema/problems";

/**
 * "2 problems · 1 note", "No problems", "1 note": the one wording for the
 * count, so the top bar and the Problems tab agree, in Schedule and Plan.
 * Errors and warnings are problems; info items are notes and never count as
 * problems.
 */
export function problemCountWords(counts: Record<Severity, number>): string {
  const n = counts.error + counts.warning;
  const problems =
    n === 0 ? "No problems" : `${n} ${n === 1 ? "problem" : "problems"}`;
  if (counts.info === 0) return problems;
  const notes = `${counts.info} ${counts.info === 1 ? "note" : "notes"}`;
  return n === 0 ? notes : `${problems} · ${notes}`;
}
