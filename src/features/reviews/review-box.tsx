import { cn } from "cn";
import { PenLine } from "lucide-react";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useState,
} from "react";
import { IntegrationLabel } from "~/components/brand/integration-label";
import { termLabel } from "~/core/catalog/terms";
import {
  type ClassTaken,
  classesTaken,
  reviewStanding,
  type TookFrom,
  type TookHere,
} from "~/core/reviews";
import type { MyReview, TermId } from "~/core/schema";
import { formatMonthYear } from "~/core/time/format";
import { newYorkClock } from "~/core/todo/list";
import { GoogleButton } from "~/features/auth/sign-in-panel";
import { readHomeLocal } from "~/features/home/local";
import { Button } from "~/ui/button";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { browserReader, loadTerms } from "./data";
import { useAccountView, useReviewsLevel, useSignedIn } from "./level";
import { useReviews } from "./reviews-store";

// "Review them yourself" (owner, 2026-09-29): the box between a page's
// rating and its reviews. It says what we know from your plans: that you
// took this class and haven't reviewed it, with a short, warm nudge that
// names the term; that you have, with Edit; or, knowing neither, a plain
// question. Signed out, the same question and the sign-in. Never a banner:
// one quiet box, one action, and it's gone where reviews can't be written.

/**
 * The terms the Schedule of Classes still lists, the only ones whose
 * schedules say what you took; none when the terms file won't load.
 */
async function listedTerms(): Promise<ReadonlySet<TermId>> {
  try {
    const terms = await loadTerms(await browserReader());
    return new Set(terms.map((t) => t.id));
  } catch {
    return new Set();
  }
}

/** Your classes from this device's plans; null until they're read. */
export function useClassesTaken(): ClassTaken[] | null {
  const [taken, setTaken] = useState<ClassTaken[] | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.all([readHomeLocal(), listedTerms()]).then(
      ([local, listed]) => {
        if (live)
          setTaken(classesTaken(local, newYorkClock(Date.now()).date, listed));
      },
    );
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

/**
 * Where Reviews learned you took a class, with that product's mark
 * (docs/DESIGN.md §7.9): "From your schedule", "From your four-year plan".
 */
export function TookSource({
  from,
  className,
}: {
  from: TookFrom;
  className?: string;
}) {
  return (
    <IntegrationLabel product={from} className={className}>
      {from === "schedule" ? "From your schedule" : "From your four-year plan"}
    </IntegrationLabel>
  );
}

export type ReviewBoxState =
  | { kind: "reviewed"; review: MyReview }
  | { kind: "took"; took: TookHere }
  | { kind: "ask" };

/**
 * What the box says about a class of yours. Your plans may know the course
 * but not who taught it (a transcript's term): then it asks, never claims.
 */
function tookWords(
  took: TookHere,
  who: string | undefined,
): { title: ReactNode; line: string } {
  const course = <span className="ident">{took.course}</span>;
  const term = termLabel(took.termId);
  if (took.instructor !== null)
    return {
      title: (
        <>
          You took {course} with {took.instructor} in {term}
        </>
      ),
      line: "How did it go? A few honest sentences help whoever takes it next. Readers won't see who wrote it.",
    };
  // An instructor's page: was it them?
  if (who)
    return {
      title: (
        <>
          Did you take {course} with {who}?
        </>
      ),
      line: `You took it in ${term}. If they taught you, a few honest sentences help whoever takes it next.`,
    };
  return {
    title: (
      <>
        You took {course} in {term}
      </>
    ),
    line: "Who taught you? Pick them and say how it went. Readers won't see who wrote it.",
  };
}

export function ReviewBox({
  state,
  who,
  question,
  write,
  onEdit,
  ready = true,
}: {
  state: ReviewBoxState;
  /** False until the page has read your plans (what you took). */
  ready?: boolean;
  /** An instructor's page: their name, to ask whether a class was theirs. */
  who?: string;
  /** Knowing nothing: "Took a class with Keiko Ashdown?" */
  question: ReactNode;
  /** The write action: a button, or a menu asking who or which course. */
  write: ReactNode;
  /** Opens the form on your review. */
  onEdit: (review: MyReview) => void;
}) {
  const level = useReviewsLevel();
  const view = useAccountView();
  const signedIn = useSignedIn();
  const settled = useMineSettled();
  const id = useId();
  if (level === "off" || level === "read") return null;
  // Until the page knows what to say, a placeholder of the box's size: the
  // signed-out words never show first (owner, 2026-09-30). Signed out, as
  // this browser last was, it says so at once while /api/me confirms.
  if (
    level === "loading" ||
    view === "unknown" ||
    (view === "signed-in" && (signedIn !== true || !settled || !ready))
  )
    return <ReviewBoxPlaceholder />;
  const signedOut = view === "signed-out";
  const shown: ReviewBoxState = signedOut ? { kind: "ask" } : state;

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
    ({ title, line } = tookWords(shown.took, who));
    action = write;
  } else {
    title = question;
    line = signedOut
      ? "Sign in with your UMD account to review it. Readers won't see who wrote it."
      : "Your review helps the next student decide. Readers won't see who wrote it.";
    action = signedOut ? (
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
        BOX,
        // Your class: the box wears the product's color. A question about
        // one (was it with them?) doesn't claim it.
        shown.kind === "took" &&
          (shown.took.instructor !== null || !who) &&
          "border-product-reviews",
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        {shown.kind === "took" ? (
          <TookSource
            from={shown.took.from}
            className="mb-1 text-muted text-sm"
          />
        ) : null}
        <h2 id={id} className="emph-heading text-balance text-xl">
          {title}
        </h2>
        <p className="text-base text-muted">{line}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </section>
  );
}

/** The box: title and words on the left, the one action on the right (a phone stacks them). */
const BOX =
  "flex flex-col gap-4 border border-hairline-strong p-6 sm:flex-row sm:items-center sm:justify-between sm:gap-6";

/** The box's size while the page finds out what to say in it. */
function ReviewBoxPlaceholder() {
  return (
    <div aria-hidden="true" data-review-box="waiting" className={BOX}>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-5 w-full max-w-md" />
      </div>
      <Skeleton className="h-9 w-40 shrink-0 max-md:h-11" />
    </div>
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
