import { Pencil, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { termLabel } from "~/core/catalog/terms";
import { reviewStanding } from "~/core/reviews";
import type { MyReview, PublicReview } from "~/core/schema";
import { formatMonthYear } from "~/core/time/format";
import { Button } from "~/ui/button";
import { ListRow } from "~/ui/list-row";
import { WithTooltip } from "~/ui/tooltip";
import { deleteWithUndo } from "./delete-review";
import type { ReviewsLevel } from "./level";
import { Stars } from "./rating";
import { ReportForm, ReportToggle } from "./report-button";
import { useReviews } from "./reviews-store";

// One review, as a row of a list: callers put them in a `ul`, and the kit's
// ListRow draws the hairlines between. Anonymous (V2 §7.5): what a reader
// gets has no author, so there's nothing to show; the author alone sees
// "Yours" on their own. The words are plain text, never HTML: React escapes
// them, and line breaks stay as typed. Set for reading: the words at 16px,
// what the reviewer said about the class on the line over them.

/** A review's row: roomy, since each is a short read of its own. */
export const REVIEW_ROW = "px-0 py-4";
/** The line over the words: the stars, the course, the term and the month. */
const META = "flex flex-wrap items-center gap-x-3 gap-y-1 text-base";
/** The words themselves. */
export const REVIEW_BODY =
  "whitespace-pre-line break-words text-prose text-pretty";

/** "Took it Fall 2025 · Got an A-": what the author chose to say. */
function contextWords(review: {
  termId: string | null;
  grade: string | null;
}): string | null {
  const parts = [
    review.termId ? `Took it ${termLabel(review.termId)}` : null,
    review.grade ? gradeWords(review.grade) : null,
  ].filter((p) => p !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** "Expected an A-", PlanetTerp's question, for its reviews. */
export function expectedWords(grade: string): string {
  if (grade === "W") return "Expected to withdraw";
  if (grade === "P") return "Expected to pass";
  return `Expected ${/^[AF]/.test(grade) ? "an" : "a"} ${grade}`;
}

function gradeWords(grade: string): string {
  if (grade === "W") return "Withdrew";
  if (grade === "P") return "Passed";
  return `Got ${/^[AF]/.test(grade) ? "an" : "a"} ${grade}`;
}

export function ReviewCard({
  review,
  own,
  level,
  showCourse,
  onEdit,
  about,
}: {
  review: PublicReview;
  /** Yours, from reviews/mine, when you wrote it. */
  own: MyReview | null;
  level: ReviewsLevel;
  showCourse: boolean;
  /** Left out where the page can't hold the form: Edit is on the instructor's page. */
  onEdit?: (review: MyReview) => void;
  /** Who it's about, where a list mixes instructors ("About Ada Brandt"). */
  about?: ReactNode;
}) {
  const reported = useReviews((s) => s.reported[review.id] === true);
  const [reporting, setReporting] = useState(false);
  if (reported)
    return (
      <ListRow as="li" className={REVIEW_ROW}>
        <article className="text-base text-muted">
          You reported this review. Thanks: a moderator will look at it.
        </article>
      </ListRow>
    );
  const context = contextWords(review);
  const standing = own ? reviewStanding(own) : null;
  return (
    // The date stays inside the article (not the row's trail): the article
    // is the whole review.
    <ListRow as="li" align="start" className={REVIEW_ROW}>
      <article className="flex flex-col gap-2" data-review={review.id}>
        {about ? <p className="text-base text-muted">{about}</p> : null}
        <div className={META}>
          <Stars rating={review.rating} size={14} />
          {showCourse ? (
            <span className="ident font-medium">{review.course}</span>
          ) : null}
          {context ? <span className="text-muted">{context}</span> : null}
          <span className="tnum ml-auto text-faint">
            {/* A month, never the day (§7.5): the day would help tell who wrote it. */}
            <time dateTime={review.createdMonth}>
              {formatMonthYear(review.createdMonth)}
            </time>
            {review.edited ? " · Edited" : ""}
          </span>
        </div>
        <p className={REVIEW_BODY} data-private>
          {review.body}
        </p>
        <div className="flex flex-wrap items-center gap-1">
          {own ? (
            <OwnActions own={own} level={level} onEdit={onEdit} label="Yours" />
          ) : level !== "off" ? (
            <ReportToggle
              open={reporting}
              onToggle={() => setReporting((open) => !open)}
            />
          ) : null}
        </div>
        {reporting && !own ? (
          <ReportForm reviewId={review.id} onDone={() => setReporting(false)} />
        ) : null}
        {standing?.detail ? (
          <p className="text-muted text-sm">{standing.detail}</p>
        ) : null}
      </article>
    </ListRow>
  );
}

/**
 * Your review, with where it stands. One readers can't see (waiting, not
 * posted, or hidden after reports) says so: only you get this row.
 */
export function OwnReviewCard({
  review,
  level,
  showCourse,
  onEdit,
  about,
}: {
  review: MyReview;
  level: ReviewsLevel;
  showCourse: boolean;
  onEdit: (review: MyReview) => void;
  /** Who and what it's about, on the list of all of yours. */
  about?: ReactNode;
}) {
  const standing = reviewStanding(review);
  const context = contextWords(review);
  const onlyYou = review.status !== "published";
  return (
    <ListRow as="li" align="start" className={REVIEW_ROW}>
      <article className="flex flex-col gap-2" data-review={review.id}>
        {about ? <p className="text-base">{about}</p> : null}
        <div className={META}>
          <span className="bg-hover px-1.5 font-medium">{standing.label}</span>
          <Stars rating={review.rating} size={14} />
          {showCourse ? (
            <span className="ident font-medium">{review.course}</span>
          ) : null}
          {context ? <span className="text-muted">{context}</span> : null}
          {onlyYou ? (
            <span className="ml-auto text-faint">Only you can see this</span>
          ) : null}
        </div>
        {review.body ? (
          <p className={REVIEW_BODY} data-private>
            {review.body}
          </p>
        ) : null}
        {standing.detail ? (
          <p className="text-muted text-sm">{standing.detail}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-1">
          <OwnActions own={review} level={level} onEdit={onEdit} label={null} />
        </div>
      </article>
    </ListRow>
  );
}

function OwnActions({
  own,
  level,
  onEdit,
  label,
}: {
  own: MyReview;
  level: ReviewsLevel;
  onEdit?: (review: MyReview) => void;
  label: string | null;
}) {
  const { editable } = reviewStanding(own);
  return (
    <>
      {label ? <span className="mr-1 text-faint text-sm">{label}</span> : null}
      {level === "on" && editable && onEdit ? (
        <WithTooltip label="Change your rating or words">
          <Button variant="ghost" size="row" onClick={() => onEdit(own)}>
            <Pencil size={12} aria-hidden="true" />
            Edit
          </Button>
        </WithTooltip>
      ) : null}
      {level === "on" || level === "read" ? (
        <WithTooltip label="Take it down (you can undo for a few seconds)">
          <Button
            variant="ghost"
            size="row"
            onClick={() => deleteWithUndo(own.id)}
          >
            <Trash2 size={12} aria-hidden="true" />
            Delete
          </Button>
        </WithTooltip>
      ) : null}
    </>
  );
}
