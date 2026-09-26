import type { Suggestion } from "../reviews/pages";
import type { CourseSearchRow, PlanetTerpIndex } from "../schema";

// "Did you mean…" on a Reviews 404: the instructors or courses closest to
// what was typed (`/reviews/instructors/clyde-kruskal` → Clyde Kruskal, whose
// page is `kruskal`).

/** Suggestions shown at most. */
export const SUGGESTIONS_MAX = 3;

/**
 * Edits between two short strings: inserts, deletes, substitutions and
 * swaps of neighbors (CMSC315 is one edit from CMSC351).
 */
export function editDistance(a: string, b: string): number {
  const rows: number[][] = [Array.from({ length: b.length + 1 }, (_, j) => j)];
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    const up = rows[i - 1] ?? [];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        (up[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        (up[j - 1] ?? 0) + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        best = Math.min(best, (rows[i - 2]?.[j - 2] ?? 0) + 1);
      row[j] = best;
    }
    rows.push(row);
  }
  return rows[a.length]?.[b.length] ?? 0;
}

/** Lowercase letters only, split into words: "Clyde-Kruskal_2" → clyde, kruskal. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z]+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w.length > 1);
}

/** Typos allowed in a word this long. */
const slack = (word: string) =>
  word.length >= 7 ? 2 : word.length >= 4 ? 1 : 0;

/** How well a typed word matches one of these: 3 exact, 1 close, 0 not at all. */
function wordScore(typed: string, candidates: readonly string[]): number {
  let best = 0;
  for (const c of candidates) {
    if (c === typed) return 3;
    if (editDistance(typed, c) <= slack(c)) best = 1;
  }
  return best;
}

/** Instructors whose name or slug is near what was typed, best first. */
export function suggestInstructors(
  typed: string,
  index: PlanetTerpIndex["instructors"],
  max = SUGGESTIONS_MAX,
): Suggestion[] {
  const query = words(typed);
  if (query.length === 0) return [];
  // One exact word or two close ones; a lone typed word may be close.
  const needed = query.length === 1 ? 1 : 2;
  const scored: { score: number; name: string; slug: string }[] = [];
  for (const [slug, [name]] of Object.entries(index)) {
    const mine = [...new Set([...words(name), ...words(slug)])];
    const score = query.reduce((n, w) => n + wordScore(w, mine), 0);
    if (score >= needed) scored.push({ score, name, slug });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, max)
    .map((s) => ({ kind: "instructor", id: s.slug, label: s.name }));
}

/** Courses whose code is one typo from what was typed. */
export function suggestCourses(
  typed: string,
  rows: readonly CourseSearchRow[],
  max = SUGGESTIONS_MAX,
): Suggestion[] {
  const code = typed.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length < 4) return [];
  return rows
    .map(([c, title]) => ({ c, title, d: editDistance(code, c) }))
    .filter((r) => r.d <= 1)
    .sort((a, b) => a.d - b.d || (a.c < b.c ? -1 : 1))
    .slice(0, max)
    .map((r) => ({ kind: "course", code: r.c, label: `${r.c} ${r.title}` }));
}
