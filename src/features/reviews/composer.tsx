import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { Star } from "lucide-react";
import { memo, useCallback, useEffect, useId, useMemo, useState } from "react";
import { termLabel } from "~/core/catalog/terms";
import { LENGTH_LIMITS } from "~/core/moderation";
import {
  reviewProblemWords,
  reviewTermChoices,
  stageZeroProblems,
  writeResultWords,
} from "~/core/reviews";
import {
  type CourseCode,
  type DeptCode,
  type InstructorId,
  type MyReview,
  REVIEW_GRADES,
  type ReviewGrade,
  ReviewGradeSchema,
  type ReviewProblem,
  type ReviewWriteResult,
  type TermId,
} from "~/core/schema";
import { newYorkClock } from "~/core/todo/list";
import { track } from "~/lib/analytics";
import { Button } from "~/ui/button";
import { Card } from "~/ui/card";
import { Textarea } from "~/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/ui/select";
import { noteToast } from "~/ui/toast";
import { WithTooltip } from "~/ui/tooltip";
import { useReviews } from "./reviews-store";

// The review form (V2 §7.4): stars, when you took it, your grade (optional)
// and your words. Stage 0 runs here first, so a link or a phone number comes
// back at once with the specific fix; then the server checks it (a few
// seconds: "Checking…"). A second review of the same class edits the first.

/** Who and what the review is about. */
export interface ComposerTarget {
  /** Null for an instructor PlanetTerp doesn't know: the server mints one. */
  instructorId: InstructorId | null;
  /** The name as Testudo (or PlanetTerp) prints it. */
  reviewedName: string;
  dept: DeptCode;
  course: CourseCode;
}

const NOT_SAID = "not-said";

const GRADE_OPTIONS = REVIEW_GRADES.map((g) => ({ value: g, label: g }));

/** The kit's Select, a field's height: 44px on phones, 32px on a desktop. */
const SELECT_TRIGGER = "w-40 md:h-8";

type Failure =
  | { kind: "problems"; problems: ReviewProblem[] }
  | { kind: "words"; words: string };

export function Composer({
  target,
  existing,
  onClose,
}: {
  target: ComposerTarget;
  /** Your live review of this class: the form edits it. */
  existing: MyReview | null;
  onClose: () => void;
}) {
  // A waiting edit is what you last wrote, so the form starts from it.
  const start = existing?.pendingEdit ?? existing;
  const [rating, setRating] = useState<number | null>(start?.rating ?? null);
  const [termId, setTermId] = useState<TermId | null>(start?.termId ?? null);
  const [grade, setGrade] = useState<ReviewGrade | null>(start?.grade ?? null);
  const [body, setBody] = useState(start?.body ?? "");
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const submit = useReviews((s) => s.submit);
  const edit = useReviews((s) => s.edit);
  // The term under way and the ones before it, never one that hasn't
  // started (the catalog leads with the term people register for next).
  const [recentTerms] = useState(() =>
    reviewTermChoices(newYorkClock(Date.now()).date),
  );
  const ids = {
    body: useId(),
    help: useId(),
    term: useId(),
    grade: useId(),
  };
  const editingPublished = existing?.status === "published";
  const verb = existing ? "Save changes" : "Post review";
  const { min, max } = LENGTH_LIMITS.review;
  useEffect(() => track("review_form_opened", {}), []);

  const send = async () => {
    const problems = stageZeroProblems(body);
    if (problems.length > 0) {
      setFailure({ kind: "problems", problems });
      return;
    }
    if (rating === null) return;
    setSending(true);
    setFailure(null);
    let result: ReviewWriteResult;
    try {
      const fields = { rating, termId, grade, body };
      result = existing
        ? await edit({ reviewId: existing.id, ...fields })
        : await submit({ ...target, ...fields });
    } catch {
      setSending(false);
      setFailure({
        kind: "words",
        words: `Couldn't send your review. Check your connection and try again.`,
      });
      return;
    }
    setSending(false);
    if (result.status === "invalid") {
      setFailure({ kind: "problems", problems: result.problems });
      return;
    }
    if (
      result.status === "published" ||
      result.status === "held" ||
      result.status === "rejected"
    ) {
      if (!existing) track("review_submitted", { outcome: result.status });
      noteToast(
        result.status === "published"
          ? existing
            ? "Your edit is up."
            : "Your review is up."
          : writeResultWords(result, { editingPublished }),
      );
      onClose();
      return;
    }
    setFailure({
      kind: "words",
      words: writeResultWords(result, { editingPublished }),
    });
  };

  const missing =
    rating === null
      ? "Pick a rating first"
      : body.trim() === ""
        ? "Write your review first"
        : null;
  const hasTerm = termId !== null && recentTerms.includes(termId);
  const termOptions = useMemo(
    () =>
      (termId && !hasTerm ? [...recentTerms, termId] : recentTerms).map(
        (id) => ({ value: id, label: termLabel(id) }),
      ),
    [recentTerms, termId, hasTerm],
  );
  const pickGrade = useCallback((value: string | null) => {
    const picked = ReviewGradeSchema.safeParse(value);
    setGrade(picked.success ? picked.data : null);
  }, []);

  // A Card: one thing that opens in place, with its own action.
  return (
    <Card className="p-4">
      <form
        aria-label={existing ? "Edit your review" : "Write a review"}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !sending) onClose();
        }}
      >
        <div>
          <h3 className="font-semibold text-base">
            {existing ? "Edit your review" : "Write a review"}
          </h3>
          <p className="text-muted text-sm">
            {target.reviewedName} ·{" "}
            <span className="ident">{target.course}</span> · Readers won't see
            who wrote it.
          </p>
        </div>

        <RatingPicker value={rating} onChange={setRating} />

        <div className="flex flex-wrap gap-3">
          <OptionalPick
            id={ids.term}
            label="When you took it"
            tooltip="The term you took it (optional)"
            value={termId}
            options={termOptions}
            onPick={setTermId}
          />
          <OptionalPick
            id={ids.grade}
            label="Your grade"
            tooltip="The grade you got (optional; it never changes the grade bars)"
            value={grade}
            options={GRADE_OPTIONS}
            onPick={pickGrade}
            contentClassName="max-h-72"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor={ids.body} className="font-medium text-sm">
            Your review
          </label>
          <WithTooltip label="How lectures, exams, projects and grading went for you">
            <Textarea
              id={ids.body}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                // Once a problem is showing, it goes as soon as it's fixed.
                if (failure?.kind === "problems") {
                  const left = stageZeroProblems(e.target.value);
                  setFailure(
                    left.length > 0
                      ? { kind: "problems", problems: left }
                      : null,
                  );
                }
              }}
              aria-describedby={ids.help}
              rows={6}
              maxLength={max * 2}
              data-private
              className="resize-y"
              placeholder="What should someone deciding on this class know?"
            />
          </WithTooltip>
          <p
            id={ids.help}
            className="tnum flex justify-between gap-3 text-faint text-xs"
          >
            <span>
              Write about the teaching and the course as you experienced it, in{" "}
              {min} to {max.toLocaleString("en-US")} characters.{" "}
              <WithTooltip label="What reviews can and can't say">
                <Link
                  to="/reviews/policy"
                  target="_blank"
                  className="underline underline-offset-2 hover:text-fg"
                >
                  What's allowed
                </Link>
              </WithTooltip>
            </span>
            <span className={cn(body.length > max && "text-fg")}>
              {body.length.toLocaleString("en-US")}
            </span>
          </p>
        </div>

        {failure ? <FailureNote failure={failure} body={body} /> : null}

        <div className="flex items-center gap-2">
          <WithTooltip
            label={
              missing ??
              (existing
                ? "Save your changes"
                : "Post it; a quick check runs first")
            }
          >
            <span className="flex" tabIndex={missing ? 0 : -1}>
              <Button type="submit" disabled={missing !== null || sending}>
                {sending ? "Checking…" : verb}
              </Button>
            </span>
          </WithTooltip>
          <WithTooltip
            label={existing ? "Keep it as it was" : "Put this away"}
            shortcut="Esc"
          >
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={sending}
            >
              Cancel
            </Button>
          </WithTooltip>
          {editingPublished ? (
            <span className="text-faint text-sm">
              Your earlier words stay up while your edit is checked.
            </span>
          ) : null}
        </div>
      </form>
    </Card>
  );
}

/**
 * One optional pick, "Rather not say" first. Memoized: a closed Radix Select
 * still renders its items, and this keeps them out of every keystroke in the
 * review box.
 */
const OptionalPick = memo(function OptionalPick({
  id,
  label,
  tooltip,
  value,
  options,
  onPick,
  contentClassName,
}: {
  id: string;
  label: string;
  tooltip: string;
  value: string | null;
  options: readonly { value: string; label: string }[];
  onPick: (value: string | null) => void;
  contentClassName?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-muted text-sm">
        {label}
      </label>
      <Select
        value={value ?? NOT_SAID}
        onValueChange={(picked) => onPick(picked === NOT_SAID ? null : picked)}
      >
        <WithTooltip label={tooltip}>
          <SelectTrigger id={id} className={SELECT_TRIGGER}>
            <SelectValue />
          </SelectTrigger>
        </WithTooltip>
        <SelectContent className={contentClassName}>
          <SelectItem value={NOT_SAID}>Rather not say</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
});

const RatingPicker = memo(function RatingPicker({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (rating: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <div className="flex items-center gap-3">
      <div
        role="radiogroup"
        aria-label="Rating"
        className="flex"
        onMouseLeave={() => setHover(null)}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <WithTooltip key={n} label={`Rate it ${n} of 5`}>
            {/* biome-ignore lint/a11y/useSemanticElements: star buttons, one per rating */}
            <button
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              onClick={() => onChange(n)}
              onMouseEnter={() => setHover(n)}
              className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-hover"
            >
              <Star
                size={18}
                aria-hidden="true"
                className={n <= shown ? "fill-current text-warn" : "text-faint"}
              />
            </button>
          </WithTooltip>
        ))}
      </div>
      <span className="text-muted text-sm">
        {value === null ? "Your rating" : `${value} of 5`}
      </span>
    </div>
  );
});

function FailureNote({ failure, body }: { failure: Failure; body: string }) {
  if (failure.kind === "words")
    return (
      <p role="status" className="text-fg text-sm">
        {failure.words}
      </p>
    );
  return (
    <ul role="status" className="space-y-1 text-fg text-sm">
      {failure.problems.map((p) => (
        <li key={`${p.code}-${p.span?.[0] ?? ""}`}>
          {reviewProblemWords(p.code)}
          {p.span ? (
            <>
              {" "}
              <q className="ident bg-warn-soft px-1 text-warn" data-private>
                {body.slice(p.span[0], p.span[1])}
              </q>
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
