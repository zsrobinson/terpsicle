import { cn } from "cn";
import { PenLine } from "lucide-react";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useState,
} from "react";
import { termLabel } from "~/core/catalog/terms";
import {
  type ClassTaken,
  classesTaken,
  reviewStanding,
  type TookHere,
} from "~/core/reviews";
import type { MyReview } from "~/core/schema";
import { formatMonthYear } from "~/core/time/format";
import { newYorkClock } from "~/core/todo/list";
import { GoogleButton } from "~/features/auth/sign-in-panel";
import { readHomeLocal } from "~/features/home/local";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { useReviewsLevel, useSignedIn } from "./level";
import { useReviews } from "./reviews-store";

// "Review them yourself" (owner, 2026-09-29): the box between a page's
// rating and its reviews. It says what we know from your plans: that you
// took this class and haven't reviewed it, with a short, warm nudge that
// names the term; that you have, with Edit; or, knowing neither, a plain
// question. Signed out, the same question and the sign-in. Never a banner:
// one quiet box, one action, and it's gone where reviews can't be written.

/** Your classes from this device's plans; null until they're read. */
export function useClassesTaken(): ClassTaken[] | null {
  const [taken, setTaken] = useState<ClassTaken[] | null>(null);
  useEffect(() => {
    let live = true;
    void readHomeLocal().then((local) => {
      if (live) setTaken(classesTaken(local, newYorkClock(Date.now()).date));
    });
    return () => {
      live = false;
    };
  }, []);
  return taken;
}

/** Whether your reviews have loaded (signed out, there are none to load). */
export function useMineSettled(): boolean {
  const signedIn = useSignedIn();
  const status = useReviews((s) => s.mine.status);
  return signedIn === false || status === "ready" || status === "error";
}

export type ReviewBoxState =
  | { kind: "reviewed"; review: MyReview }
  | { kind: "took"; took: TookHere }
  | { kind: "ask" };

/** "Keiko Ashdown in CMSC351", "CMSC351 with Keiko Ashdown": who and what. */
function tookWords(took: TookHere, page: "instructor" | "course"): ReactNode {
  const course = <span className="ident">{took.course}</span>;
  return page === "course" || took.instructor === null ? (
    <>
      You took {course}
      {took.instructor ? ` with ${took.instructor}` : ""} in{" "}
      {termLabel(took.termId)}
    </>
  ) : (
    <>
      You took {course} with {took.instructor} in {termLabel(took.termId)}
    </>
  );
}

export function ReviewBox({
  state,
  page,
  question,
  write,
  onEdit,
}: {
  state: ReviewBoxState;
  page: "instructor" | "course";
  /** Knowing nothing: "Took a class with Keiko Ashdown?" */
  question: ReactNode;
  /** The write action: a button, or a menu asking who or which course. */
  write: ReactNode;
  /** Opens the form on your review. */
  onEdit: (review: MyReview) => void;
}) {
  const level = useReviewsLevel();
  const signedIn = useSignedIn();
  const settled = useMineSettled();
  const id = useId();
  if (level === "off" || level === "read") return null;
  const loading = level === "loading" || signedIn === "loading" || !settled;
  // Signed out, or before we know: the plain question, never a guess.
  const shown: ReviewBoxState =
    signedIn === true && !loading ? state : { kind: "ask" };

  let title: ReactNode;
  let line: ReactNode;
  let action: ReactNode = null;
  if (shown.kind === "reviewed") {
    const { review } = shown;
    const standing = reviewStanding(review);
    title = (
      <>
        You reviewed {review.instructorName} in{" "}
        <span className="ident">{review.course}</span>
      </>
    );
    line = (
      <>
        {formatMonthYear(review.createdAt.slice(0, 7))} · {standing.label}
        {/* What it means is on your review itself, below, and in Your reviews. */}
      </>
    );
    action = standing.editable ? (
      <WithTooltip label="Change what you wrote">
        <Button variant="outline" size="lg" onClick={() => onEdit(review)}>
          <PenLine aria-hidden="true" />
          Edit your review
        </Button>
      </WithTooltip>
    ) : null;
  } else if (shown.kind === "took") {
    title = tookWords(shown.took, page);
    line =
      "How did it go? A few honest sentences help whoever takes it next. Readers won't see who wrote it.";
    action = write;
  } else {
    title = question;
    line =
      signedIn === false
        ? "Sign in with your UMD account to review it. Readers won't see who wrote it."
        : "Your review helps the next student decide. Readers won't see who wrote it.";
    action = loading ? null : signedIn === false ? (
      <GoogleButton
        returnTo={
          typeof window === "undefined"
            ? "/reviews"
            : `${window.location.pathname}${window.location.search}`
        }
        from="reviews"
        className="w-fit"
      />
    ) : (
      write
    );
  }
  return (
    <section
      aria-labelledby={id}
      data-review-box={shown.kind}
      className={cn(
        "flex flex-col gap-3 border border-hairline-strong p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-6",
        // Your class and your review: the box wears the product's color.
        shown.kind === "took" && "border-product-reviews",
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id={id} className="emph-heading text-balance text-xl">
          {title}
        </h2>
        <p className="text-base text-muted">{line}</p>
      </div>
      {/* The action's room is kept while it's still unknown, so nothing moves. */}
      <div className={cn("shrink-0", loading && "min-h-9 max-md:min-h-11")}>
        {action}
      </div>
    </section>
  );
}

/**
 * The form opens in the box's place, which can be a screen away from what
 * opened it (Edit on a review below, a menu's pick): bring it into view and
 * focus its first control (the rating, or Sign in).
 */
export function useBringFormIn(
  ref: RefObject<HTMLElement | null>,
  open: unknown,
): void {
  useEffect(() => {
    if (open === null) return;
    const box = ref.current;
    box?.scrollIntoView?.({ block: "nearest" });
    box
      ?.querySelector<HTMLElement>("input, textarea, select, button, a[href]")
      ?.focus({ preventScroll: true });
  }, [ref, open]);
}

/** The box's filled Write button. */
export function WriteReviewButton({
  tooltip,
  onClick,
}: {
  tooltip: string;
  onClick: () => void;
}) {
  return (
    <WithTooltip label={tooltip}>
      <Button size="lg" onClick={onClick}>
        <PenLine aria-hidden="true" />
        Write a review
      </Button>
    </WithTooltip>
  );
}
