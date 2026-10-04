import { Info } from "lucide-react";
import type { ReactNode } from "react";
import { type PlanetTerpReview, planetTerpUrl } from "~/core/schema";
import { formatFullDate } from "~/core/time/format";
import { ListRow } from "~/ui/list-row";
import { WithTooltip } from "~/ui/tooltip";
import { Stars } from "./rating";
import { expectedWords, REVIEW_BODY, REVIEW_ROW } from "./review-card";

// A PlanetTerp review among ours (owner, 2026-09-28: "let's actually
// display reviews from planetterp … an info icon or chip mentioning that
// it's from planetterp"). The same row as one of ours, with a chip saying
// where it's from, which links to the instructor's PlanetTerp page. No
// author: PlanetTerp publishes none. Plain text, never HTML.

/** "PlanetTerp ⓘ": where a review came from, and the way to it. */
export function PlanetTerpChip({ slug }: { slug: string }) {
  return (
    <WithTooltip label="Written on PlanetTerp, a separate UMD review site. Shown here with thanks.">
      <a
        href={planetTerpUrl(slug)}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 border border-hairline-strong px-1.5 text-muted text-sm transition-colors hover:border-fg hover:text-fg"
      >
        PlanetTerp
        <Info size={12} aria-hidden="true" />
      </a>
    </WithTooltip>
  );
}

export function PlanetTerpReviewCard({
  review,
  showCourse,
  about,
}: {
  review: PlanetTerpReview;
  showCourse: boolean;
  /** Who it's about, where a list mixes instructors. */
  about?: ReactNode;
}) {
  return (
    <ListRow as="li" align="start" className={REVIEW_ROW}>
      <article
        className="flex flex-col gap-2"
        data-review={review.id}
        data-source="planetterp"
      >
        {about ? <p className="text-base text-muted">{about}</p> : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base">
          <Stars rating={review.rating} size={14} />
          {showCourse && review.course ? (
            <span className="ident font-medium">{review.course}</span>
          ) : null}
          {review.expectedGrade ? (
            <span className="text-muted">
              {expectedWords(review.expectedGrade)}
            </span>
          ) : null}
          <span className="ml-auto flex items-center gap-3">
            <PlanetTerpChip slug={review.instructorId} />
            <time dateTime={review.createdDate} className="tnum text-faint">
              {formatFullDate(review.createdDate)}
            </time>
          </span>
        </div>
        <p className={REVIEW_BODY} data-private>
          {review.body}
        </p>
      </article>
    </ListRow>
  );
}
