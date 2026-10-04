import type { PageReview, PlanetTerpReview, ReviewSort } from "../schema";

// A Reviews page lists ours and PlanetTerp's as one list (owner, 2026-09-28:
// "let's actually display reviews from planetterp"), each of PlanetTerp's
// marked as theirs, in the page's order (owner, 2026-09-29: "sortable, both
// by rating highest/lowest and latest/oldest"). Both carry a month, so
// that's the time order; a rating order breaks its ties newest first, as
// the server does for PlanetTerp's pages. Within a tie ours come first, as
// the ones written here.

export type ShownReview =
  | { source: "terpsicle"; review: PageReview }
  | { source: "planetterp"; review: PlanetTerpReview };

type Sortable = { createdMonth: string; rating: number };

const newest = (x: Sortable, y: Sortable) =>
  y.createdMonth.localeCompare(x.createdMonth);

/** Negative when `x` comes first in `sort`. */
export function compareReviews(
  sort: ReviewSort,
): (x: Sortable, y: Sortable) => number {
  switch (sort) {
    case "latest":
      return newest;
    case "oldest":
      return (x, y) => x.createdMonth.localeCompare(y.createdMonth);
    case "highest":
      return (x, y) => y.rating - x.rating || newest(x, y);
    case "lowest":
      return (x, y) => x.rating - y.rating || newest(x, y);
  }
}

/**
 * Ours (all of them) and the pages of PlanetTerp's loaded so far, as one
 * list in `sort`'s order. Until PlanetTerp's are all loaded, ours that sort
 * after the last of theirs wait: they'd otherwise sit above PlanetTerp
 * reviews that belong before them once "Show more" brings those in.
 */
export function mergeReviews(
  ours: readonly PageReview[],
  theirs: readonly PlanetTerpReview[],
  theirsComplete: boolean,
  sort: ReviewSort = "latest",
): ShownReview[] {
  const cmp = compareReviews(sort);
  const last = theirs.at(-1);
  const shownOurs =
    theirsComplete || last === undefined
      ? ours
      : ours.filter((r) => cmp(r, last) <= 0);
  const out: ShownReview[] = [];
  let i = 0;
  let j = 0;
  // A stable sort keeps each source's own order within a tie.
  const a = [...shownOurs].sort(cmp);
  const b = [...theirs].sort(cmp);
  while (i < a.length || j < b.length) {
    const mine = a[i];
    const pt = b[j];
    if (mine && (!pt || cmp(mine, pt) <= 0)) {
      out.push({ source: "terpsicle", review: mine });
      i++;
    } else if (pt) {
      out.push({ source: "planetterp", review: pt });
      j++;
    }
  }
  return out;
}
