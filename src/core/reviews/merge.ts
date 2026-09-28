import type { PageReview, PlanetTerpReview } from "../schema";

// A Reviews page lists ours and PlanetTerp's as one list, newest first
// (owner, 2026-09-28: "let's actually display reviews from planetterp"),
// each of PlanetTerp's marked as theirs. Both carry a month, so that's the
// order; within a month ours come first, as the ones written here.

export type ShownReview =
  | { source: "terpsicle"; review: PageReview }
  | { source: "planetterp"; review: PlanetTerpReview };

/**
 * Ours (all of them) and the pages of PlanetTerp's loaded so far, as one
 * list. Until PlanetTerp's are all loaded, ours older than the oldest of
 * theirs wait: they'd otherwise sit above PlanetTerp reviews newer than them
 * once "Show more" brings those in.
 */
export function mergeReviews(
  ours: readonly PageReview[],
  theirs: readonly PlanetTerpReview[],
  theirsComplete: boolean,
): ShownReview[] {
  const oldest = theirs.at(-1)?.createdMonth ?? null;
  const shownOurs =
    theirsComplete || oldest === null
      ? ours
      : ours.filter((r) => r.createdMonth >= oldest);
  const out: ShownReview[] = [];
  let i = 0;
  let j = 0;
  const a = [...shownOurs].sort(byMonth);
  const b = [...theirs].sort(byMonth);
  while (i < a.length || j < b.length) {
    const mine = a[i];
    const pt = b[j];
    if (mine && (!pt || mine.createdMonth >= pt.createdMonth)) {
      out.push({ source: "terpsicle", review: mine });
      i++;
    } else if (pt) {
      out.push({ source: "planetterp", review: pt });
      j++;
    }
  }
  return out;
}

/** Newest month first; a stable sort keeps each source's own order within it. */
function byMonth(
  x: { createdMonth: string },
  y: { createdMonth: string },
): number {
  return y.createdMonth.localeCompare(x.createdMonth);
}
