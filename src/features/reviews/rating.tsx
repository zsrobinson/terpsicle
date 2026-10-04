import {
  type CombinedRating,
  combinedRatingWords,
  formatStars,
} from "~/core/reviews";
import { StarMark } from "~/ui/stars";
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
        <StarMark />
        <span className="sr-only">{words}</span>
        <span aria-hidden="true">
          <span className="text-fg">{formatStars(combined.rating)}</span> (
          {combined.reviewCount.toLocaleString("en-US")})
        </span>
      </span>
    </WithTooltip>
  );
}

/** Five stars, filled to the rating: the kit's, for one review or the big number. */
export { Stars } from "~/ui/stars";
