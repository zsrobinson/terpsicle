import { Star } from "lucide-react";
import {
  type CombinedRating,
  combinedRatingWords,
  formatStars,
} from "~/core/reviews";
import { WithTooltip } from "~/ui/tooltip";

// Ratings on the Reviews pages. The combined number (V2 §7.6) always carries
// its math: in a tooltip, and read out in full to screen readers.

/** "★ 4.2 (61)", with "4.2 from 61 reviews: …" on hover. */
export function CombinedRatingBadge({
  combined,
}: {
  combined: CombinedRating;
}) {
  const words = combinedRatingWords(combined);
  if (combined.rating === null)
    return <span className="text-faint">No reviews yet</span>;
  return (
    <WithTooltip label={words}>
      <span className="tnum inline-flex items-center gap-1 text-muted">
        <Star size={11} aria-hidden="true" className="fill-current text-warn" />
        <span className="sr-only">{words}</span>
        <span aria-hidden="true">
          <span className="text-fg">{formatStars(combined.rating)}</span> (
          {combined.reviewCount.toLocaleString("en-US")})
        </span>
      </span>
    </WithTooltip>
  );
}

/** Five stars, `rating` of them filled, for one review. */
export function Stars({ rating }: { rating: number }) {
  return (
    <span
      role="img"
      aria-label={`${rating} of 5 stars`}
      className="inline-flex items-center gap-0.5"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={12}
          aria-hidden="true"
          className={
            n <= rating ? "fill-current text-warn" : "text-hairline-strong"
          }
        />
      ))}
    </span>
  );
}
