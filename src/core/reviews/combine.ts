// One rating from PlanetTerp's reviews and ours (V2 §7.6): the mean over
// every review, so each source counts by how many reviews it has. Grade
// distributions stay PlanetTerp's; self-reported grades never mix in.

export type RatingSource = "planetterp" | "terpsicle";

export interface RatingPart {
  source: RatingSource;
  /** The source's mean rating; null (or a zero count) when it has none. */
  rating: number | null;
  reviewCount: number;
}

export interface CombinedRating {
  /** Null when no source has a rated review. */
  rating: number | null;
  reviewCount: number;
  /** The sources that have reviews, in the order given. */
  parts: RatingPart[];
}

/** rating = Σ(rating_s × count_s) / Σ count_s; reviewCount = Σ count_s. */
export function combineRatings(parts: readonly RatingPart[]): CombinedRating {
  const counted = parts.filter(
    (p): p is RatingPart & { rating: number } =>
      p.rating !== null && p.reviewCount > 0,
  );
  const reviewCount = counted.reduce((n, p) => n + p.reviewCount, 0);
  const weighted = counted.reduce((n, p) => n + p.rating * p.reviewCount, 0);
  return {
    rating: reviewCount === 0 ? null : weighted / reviewCount,
    reviewCount,
    parts: counted,
  };
}

const SOURCE_NAMES: Readonly<Record<RatingSource, string>> = {
  planetterp: "PlanetTerp",
  terpsicle: "Terpsicle",
};

const reviewsWord = (n: number) => `${n} review${n === 1 ? "" : "s"}`;

/**
 * The tooltip that gives the parts: "4.2 from 61 reviews: 4.1 from 48 on
 * PlanetTerp, 4.6 from 13 on Terpsicle". One source says only where from.
 */
export function combinedRatingWords(combined: CombinedRating): string | null {
  if (combined.rating === null) return null;
  const total = `${combined.rating.toFixed(1)} from ${reviewsWord(combined.reviewCount)}`;
  const [only] = combined.parts;
  if (combined.parts.length === 1 && only)
    return `${total} on ${SOURCE_NAMES[only.source]}`;
  const parts = combined.parts.map(
    (p) =>
      `${(p.rating ?? 0).toFixed(1)} from ${p.reviewCount} on ${SOURCE_NAMES[p.source]}`,
  );
  return `${total}: ${parts.join(", ")}`;
}
