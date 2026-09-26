import { cn } from "cn";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { termLabel } from "~/core/catalog/terms";
import { reviewStanding } from "~/core/reviews";
import type { MyReview, PublicReview } from "~/core/schema";
import { formatMonthYear } from "~/core/time/format";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { deleteWithUndo } from "./delete-review";
import type { ReviewsLevel } from "./level";
import { Stars } from "./rating";
import { ReportForm, ReportToggle } from "./report-button";
import { useReviews } from "./reviews-store";

// One review. Anonymous (V2 §7.5): what a reader gets has no author, so
// there's nothing to show; the author alone sees "Yours" on their own. The
// words are plain text, never HTML: React escapes them, and line breaks
// stay as typed.

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
}: {
  review: PublicReview;
  /** Yours, from reviews/mine, when you wrote it. */
  own: MyReview | null;
  level: ReviewsLevel;
  showCourse: boolean;
  /** Left out where the page can't hold the form: Edit is on the instructor's page. */
  onEdit?: (review: MyReview) => void;
}) {
  const reported = useReviews((s) => s.reported[review.id] === true);
  const [reporting, setReporting] = useState(false);
  if (reported)
    return (
      <article className="border-hairline border-b py-3 text-muted text-sm">
        You reported this review. Thanks: a moderator will look at it.
      </article>
    );
  const context = contextWords(review);
  const standing = own ? reviewStanding(own) : null;
  return (
    <article className="border-hairline border-b py-3" data-review={review.id}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <Stars rating={review.rating} />
        {showCourse ? (
          <span className="ident font-medium">{review.course}</span>
        ) : null}
        {context ? <span className="text-muted">{context}</span> : null}
        <span className="ml-auto text-faint">
          {formatMonthYear(review.createdMonth)}
          {review.edited ? " · Edited" : ""}
        </span>
      </div>
      <p
        className="mt-1.5 whitespace-pre-line break-words leading-5"
        data-private
      >
        {review.body}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
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
        <p className="mt-1 text-muted text-sm">{standing.detail}</p>
      ) : null}
    </article>
  );
}

/**
 * Your review that readers can't see (waiting, not posted, or hidden after
 * reports): only you get this card, with where it stands.
 */
export function OwnReviewCard({
  review,
  level,
  showCourse,
  onEdit,
}: {
  review: MyReview;
  level: ReviewsLevel;
  showCourse: boolean;
  onEdit: (review: MyReview) => void;
}) {
  const standing = reviewStanding(review);
  const context = contextWords(review);
  const onlyYou = review.status !== "published";
  return (
    <article
      className={cn(
        "my-3 border p-3",
        onlyYou ? "border-hairline-strong border-dashed" : "border-hairline",
      )}
      data-review={review.id}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="bg-hover px-1.5 font-medium">{standing.label}</span>
        <Stars rating={review.rating} />
        {showCourse ? (
          <span className="ident font-medium">{review.course}</span>
        ) : null}
        {context ? <span className="text-muted">{context}</span> : null}
        {onlyYou ? (
          <span className="ml-auto text-faint">Only you can see this</span>
        ) : null}
      </div>
      {review.body ? (
        <p
          className="mt-1.5 whitespace-pre-line break-words leading-5"
          data-private
        >
          {review.body}
        </p>
      ) : null}
      {standing.detail ? (
        <p className="mt-1.5 text-muted text-sm">{standing.detail}</p>
      ) : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <OwnActions own={review} level={level} onEdit={onEdit} label={null} />
      </div>
    </article>
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
