// One rating from PlanetTerp's reviews and ours (V2 §7.6): a count-weighted
// mean, with the parts kept so the tooltip can show the math (DESIGN §5,
// "honest numbers"). Grade distributions never mix: they stay PlanetTerp's.

export type RatingSourceId = "planetterp" | "terpsicle";

export interface RatingSource {
  source: RatingSourceId;
  /** Mean rating, 1–5; null with no reviews. */
  rating: number | null;
  reviewCount: number;
}

export interface CombinedRating {
  /** Σ(rating × count) / Σ count; null with no reviews anywhere. */
  rating: number | null;
  reviewCount: number;
  /** The sources that have reviews, in the order given. */
  parts: RatingSource[];
}

const SOURCE_NAMES: Readonly<Record<RatingSourceId, string>> = {
  planetterp: "PlanetTerp",
  terpsicle: "Terpsicle",
};

/** Combines each source's mean rating, weighted by its review count. */
export function combineRatings(
  sources: readonly RatingSource[],
): CombinedRating {
  const parts = sources.filter((s) => s.rating !== null && s.reviewCount > 0);
  const reviewCount = parts.reduce((n, s) => n + s.reviewCount, 0);
  const sum = parts.reduce((n, s) => n + (s.rating ?? 0) * s.reviewCount, 0);
  return {
    rating: reviewCount > 0 ? sum / reviewCount : null,
    reviewCount,
    parts,
  };
}

/** Our side of the math, from the published reviews a reader can see. */
export function terpsicleRating(
  reviews: readonly { rating: number }[],
): RatingSource {
  return {
    source: "terpsicle",
    rating:
      reviews.length > 0
        ? reviews.reduce((n, r) => n + r.rating, 0) / reviews.length
        : null,
    reviewCount: reviews.length,
  };
}

const plural = (n: number, word: string) =>
  `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`;

/** "4.2": ratings are shown to one decimal, everywhere. */
export const formatStars = (rating: number): string => rating.toFixed(1);

/**
 * The tooltip on a combined rating: "4.2 from 61 reviews: 4.1 from 48 on
 * PlanetTerp, 4.6 from 13 on Terpsicle". One source says where it's from.
 */
export function combinedRatingWords(combined: CombinedRating): string {
  const { rating, reviewCount, parts } = combined;
  if (rating === null || parts.length === 0) return "No reviews yet";
  const [only] = parts;
  if (parts.length === 1 && only)
    return `${formatStars(rating)} from ${plural(reviewCount, "review")} on ${SOURCE_NAMES[only.source]}`;
  const each = parts
    .map(
      (p) =>
        `${formatStars(p.rating ?? 0)} from ${p.reviewCount.toLocaleString("en-US")} on ${SOURCE_NAMES[p.source]}`,
    )
    .join(", ");
  return `${formatStars(rating)} from ${plural(reviewCount, "review")}: ${each}`;
}
