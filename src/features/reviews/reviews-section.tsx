import { useRouter } from "@tanstack/react-router";
import { PenLine } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { PanelNote } from "~/components/panel";
import { mergeReviews } from "~/core/reviews";
import type {
  CourseCode,
  InstructorId,
  MyReview,
  PageReviews,
  PlanetTerpCursor,
  PlanetTerpReview,
} from "~/core/schema";
import { Button } from "~/ui/button";
import { InlineError } from "~/ui/inline-error";
import { PageSection } from "~/ui/page-section";
import { WithTooltip } from "~/ui/tooltip";
import { Composer, type ComposerTarget } from "./composer";
import { forgetPageReviews } from "./data";
import { PAGE_NOTE } from "./frame";
import { type ReviewsLevel, useReviewsLevel, useSignedIn } from "./level";
import { PlanetTerpReviewCard } from "./planetterp-review";
import { OwnReviewCard, ReviewCard } from "./review-card";
import { reviewsClient, useReviews } from "./reviews-store";
import { SignInPrompt } from "./sign-in-prompt";

// A page's reviews: ours and PlanetTerp's as one list, newest first, each of
// PlanetTerp's marked as theirs (V2 §7.6). The route's loader read the first
// of them, so they're in the server's HTML; "Show more" reads on through
// PlanetTerp's. On an instructor's page your own come first, with where
// each stands, and "Write a review" (the page header's action) opens the
// form here.

/** What the composer is open on: a new review, one of yours, or nothing. */
export type Composing = MyReview | "new" | null;

/** Your reviews (reviews/mine), loaded once when you're signed in. */
export function useMine(): MyReview[] {
  const signedIn = useSignedIn();
  const level = useReviewsLevel();
  const mine = useReviews((s) => s.mine);
  const loadMine = useReviews((s) => s.loadMine);
  useEffect(() => {
    if (
      signedIn === true &&
      level !== "off" &&
      level !== "loading" &&
      mine.status === "idle"
    )
      void loadMine();
  }, [signedIn, level, mine.status, loadMine]);
  return signedIn === true && mine.status === "ready" ? mine.reviews : [];
}

/** Items not waiting out a delete's Undo. */
export function useVisible<T extends { id: string }>(items: readonly T[]): T[] {
  const deleting = useReviews((s) => s.deleting);
  return useMemo(() => items.filter((r) => !deleting[r.id]), [items, deleting]);
}

/**
 * After you write, edit or delete a review here, the page reads its
 * reviews again (its loader, through `reviews/page`).
 */
export function useReloadOnChange(): void {
  const router = useRouter();
  const changes = useReviews((s) => s.changes);
  const seen = useRef(changes);
  useEffect(() => {
    if (changes === seen.current) return;
    seen.current = changes;
    forgetPageReviews();
    void router.invalidate();
  }, [changes, router]);
}

/** Yours of this instructor (and course), not waiting out a delete's Undo. */
export function useOwnHere(
  instructorId: InstructorId,
  course: CourseCode | null,
): MyReview[] {
  const mine = useMine();
  const deleting = useReviews((s) => s.deleting);
  return mine.filter(
    (r) =>
      r.instructorId === instructorId &&
      (course === null || r.course === course) &&
      !deleting[r.id],
  );
}

/** Your live review of the target's class, which "Write a review" edits. */
export function existingReview(
  ownHere: readonly MyReview[],
  target: ComposerTarget | null,
): MyReview | null {
  return target
    ? (ownHere.find(
        (r) => r.course === target.course && r.status !== "rejected",
      ) ?? null)
    : null;
}

/** More of PlanetTerp's, a page at a time, after the loader's first. */
function useMorePlanetTerp(
  reviews: PageReviews,
  query: { instructorId: InstructorId | null; course: CourseCode | null },
) {
  const [more, setMore] = useState<PlanetTerpReview[]>([]);
  const [next, setNext] = useState<PlanetTerpCursor | null>(reviews.next);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  // New loader data (another course, or after a write) starts over.
  useEffect(() => {
    setMore([]);
    setNext(reviews.next);
    setState("idle");
  }, [reviews]);
  const loadMore = async () => {
    if (!next || state === "loading") return;
    setState("loading");
    try {
      const page = await reviewsClient().reviews.planetTerp({
        ...query,
        cursor: next,
      });
      setMore((m) => [...m, ...page.reviews]);
      setNext(page.next);
      setState("idle");
    } catch {
      setState("error");
    }
  };
  return {
    planetTerp: useMemo(
      () => [...reviews.planetTerp, ...more],
      [reviews.planetTerp, more],
    ),
    next,
    state,
    loadMore,
  };
}

/** The list itself: ours and PlanetTerp's, then "Show more". */
export function ReviewList({
  reviews,
  query,
  level,
  showCourse,
  about,
  hideId,
  onEdit,
  empty,
}: {
  reviews: PageReviews;
  query: { instructorId: InstructorId | null; course: CourseCode | null };
  level: ReviewsLevel;
  showCourse: boolean;
  /** Who each is about, where a list mixes instructors. */
  about?: (instructorId: InstructorId) => ReactNode;
  /** The review the form is editing, left out of the list. */
  hideId?: string;
  onEdit?: (review: MyReview) => void;
  /** What to say when there are none. */
  empty: ReactNode;
}) {
  const mine = useMine();
  const ownById = new Map(mine.map((r) => [r.id, r]));
  const ours = useVisible(reviews.terpsicle ?? []);
  const more = useMorePlanetTerp(reviews, query);
  const shown = mergeReviews(ours, more.planetTerp, more.next === null).filter(
    (r) => r.review.id !== hideId,
  );
  if (shown.length === 0)
    return <PanelNote className={PAGE_NOTE}>{empty}</PanelNote>;
  return (
    <div className="flex flex-col gap-3">
      <ul>
        {shown.map((r) =>
          r.source === "terpsicle" ? (
            <ReviewCard
              key={r.review.id}
              review={r.review}
              own={ownById.get(r.review.id) ?? null}
              level={level}
              showCourse={showCourse}
              onEdit={onEdit}
              about={about?.(r.review.instructorId)}
            />
          ) : (
            <PlanetTerpReviewCard
              key={r.review.id}
              review={r.review}
              showCourse={showCourse}
              about={about?.(r.review.instructorId)}
            />
          ),
        )}
      </ul>
      {more.state === "error" ? (
        <InlineError
          message="Couldn't load more reviews. Check your connection."
          onRetry={() => void more.loadMore()}
        />
      ) : more.next ? (
        <WithTooltip label="Show older reviews">
          <Button
            variant="outline"
            className="w-fit"
            disabled={more.state === "loading"}
            onClick={() => void more.loadMore()}
          >
            {more.state === "loading" ? "Loading…" : "Show more"}
          </Button>
        </WithTooltip>
      ) : null}
    </div>
  );
}

/** An instructor's reviews, with your own and the form. */
export function ReviewsSection({
  instructorId,
  course,
  reviews,
  count,
  target,
  composing,
  onCompose,
}: {
  instructorId: InstructorId;
  /** Only this course's reviews; null for all of them. */
  course: CourseCode | null;
  reviews: PageReviews;
  /** How many there are in all, when known. */
  count: number | null;
  /** What the composer writes about; null until a course is picked. */
  target: ComposerTarget | null;
  /** The page's "Write a review" and each review's Edit open the form here. */
  composing: Composing;
  onCompose: (next: Composing) => void;
}) {
  const level = useReviewsLevel();
  const signedIn = useSignedIn();
  const ownHere = useOwnHere(instructorId, course);
  const formRef = useRef<HTMLDivElement>(null);
  useReloadOnChange();

  // The header's button can be a screen away: bring the form to it.
  useEffect(() => {
    if (composing !== null)
      formRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [composing]);

  const existing = existingReview(ownHere, target);
  const edit = (review: MyReview) => onCompose(review);
  const composer =
    composing === "new" && signedIn !== true ? (
      <SignInPrompt>
        Sign in with your UMD account to write a review. Readers won't see who
        wrote it.
      </SignInPrompt>
    ) : composing !== null && target ? (
      <Composer
        target={target}
        existing={composing === "new" ? existing : composing}
        onClose={() => onCompose(null)}
      />
    ) : null;
  const waiting = ownHere.filter(
    (r) => r.status !== "published" && r !== composing,
  );

  return (
    <PageSection
      size="display"
      title="Reviews"
      aside={count ? count.toLocaleString("en-US") : undefined}
    >
      {composer ? (
        <div ref={formRef} className="scroll-mt-16">
          {composer}
        </div>
      ) : null}
      {waiting.length > 0 ? (
        <ul>
          {waiting.map((r) => (
            <OwnReviewCard
              key={r.id}
              review={r}
              level={level}
              showCourse={course === null}
              onEdit={edit}
            />
          ))}
        </ul>
      ) : null}
      <ReviewList
        reviews={reviews}
        query={{ instructorId, course }}
        level={level}
        showCourse={course === null}
        hideId={
          composing !== null && composing !== "new" ? composing.id : undefined
        }
        onEdit={edit}
        empty={
          <>
            {/* Yours may be right above, held: it isn't the first "yet". */}
            {ownHere.length > 0
              ? course
                ? `No one else has reviewed ${course} yet.`
                : "No one else has reviewed them yet."
              : course
                ? `No reviews of ${course} yet.`
                : "No reviews yet."}
            {level === "on" && target && ownHere.length === 0
              ? " Took it? Yours could be the first."
              : ""}
          </>
        }
      />
    </PageSection>
  );
}

/**
 * "Write a review", or what stands in its way. `page`: the page header's one
 * filled action; `row`: a row's small ghost action.
 */
export function WriteButton({
  level,
  target,
  existing,
  onWrite,
  label,
  size = "page",
}: {
  level: ReviewsLevel;
  target: ComposerTarget | null;
  existing: MyReview | null;
  onWrite: () => void;
  label?: string;
  size?: "page" | "row";
}) {
  const signedIn = useSignedIn();
  if (level !== "on" || signedIn === "loading") return null;
  const words = label ?? (existing ? "Edit your review" : "Write a review");
  if (!target)
    return (
      <span className="text-base text-muted">
        Pick a course below to review it
      </span>
    );
  return (
    <WithTooltip
      label={
        !signedIn
          ? "Sign in with your UMD account to write one"
          : existing
            ? `You've reviewed ${target.course}: change what you wrote`
            : `Review ${target.reviewedName} in ${target.course}`
      }
    >
      {size === "row" ? (
        <Button variant="ghost" size="row" onClick={onWrite}>
          <PenLine size={12} aria-hidden="true" />
          {words}
        </Button>
      ) : (
        <Button size="lg" onClick={onWrite}>
          <PenLine aria-hidden="true" />
          {words}
        </Button>
      )}
    </WithTooltip>
  );
}
