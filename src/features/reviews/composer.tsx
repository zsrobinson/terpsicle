import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { Star } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { track } from "~/app/analytics";
import { termLabel } from "~/core/catalog/terms";
import { LENGTH_LIMITS } from "~/core/moderation";
import {
  reviewProblemWords,
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
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { loadTerms, useLoaded } from "./data";
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

/** Terms offered in "When did you take it?": the newest this many. */
const TERM_CHOICES = 12;
const NOT_SAID = "not-said";

// Native selects: short lists, and the phone's own picker is the best one.
const SELECT_CLASS =
  "h-7 w-40 rounded-md border border-hairline-strong bg-bg px-1.5 text-fg text-sm transition-colors hover:bg-hover focus-visible:border-fg/40";

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
  const terms = useLoaded("terms", loadTerms);
  const ids = { body: useId(), help: useId() };
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
      toast(
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
  const recentTerms =
    terms.status === "ready" ? terms.data.slice(0, TERM_CHOICES) : [];
  const termOptions =
    termId && !recentTerms.some((t) => t.id === termId)
      ? [...recentTerms.map((t) => t.id), termId]
      : recentTerms.map((t) => t.id);

  return (
    <form
      aria-label={existing ? "Edit your review" : "Write a review"}
      className="space-y-4 border border-keyline bg-raised p-4 shadow-offset"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !sending) onClose();
      }}
    >
      <div>
        <h2 className="font-semibold text-lg tracking-tight">
          {existing ? "Edit your review" : "Write a review"}
        </h2>
        <p className="text-muted text-sm">
          {target.reviewedName} · <span className="ident">{target.course}</span>{" "}
          · Readers won't see who wrote it.
        </p>
      </div>

      <RatingPicker value={rating} onChange={setRating} />

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-muted text-sm">
          When you took it
          <WithTooltip label="The term you took it (optional)">
            <select
              value={termId ?? NOT_SAID}
              onChange={(e) =>
                setTermId(e.target.value === NOT_SAID ? null : e.target.value)
              }
              className={SELECT_CLASS}
            >
              <option value={NOT_SAID}>Rather not say</option>
              {termOptions.map((id) => (
                <option key={id} value={id}>
                  {termLabel(id)}
                </option>
              ))}
            </select>
          </WithTooltip>
        </label>
        <label className="flex flex-col gap-1 text-muted text-sm">
          Your grade
          <WithTooltip label="The grade you got (optional; it never changes the grade bars)">
            <select
              value={grade ?? NOT_SAID}
              onChange={(e) => {
                const picked = ReviewGradeSchema.safeParse(e.target.value);
                setGrade(picked.success ? picked.data : null);
              }}
              className={SELECT_CLASS}
            >
              <option value={NOT_SAID}>Rather not say</option>
              {REVIEW_GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </WithTooltip>
        </label>
      </div>

      <div className="space-y-1">
        <label htmlFor={ids.body} className="font-medium text-sm">
          Your review
        </label>
        <WithTooltip label="How lectures, exams, projects and grading went for you">
          <textarea
            id={ids.body}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              // Once a problem is showing, it goes as soon as it's fixed.
              if (failure?.kind === "problems") {
                const left = stageZeroProblems(e.target.value);
                setFailure(
                  left.length > 0 ? { kind: "problems", problems: left } : null,
                );
              }
            }}
            aria-describedby={ids.help}
            rows={6}
            maxLength={max * 2}
            data-private
            className="w-full resize-y rounded-md border border-hairline-strong bg-bg px-2 py-1.5 text-base leading-5 placeholder:text-faint focus:border-fg/40"
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
  );
}

function RatingPicker({
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
}

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
