import { useNavigate, useRouter } from "@tanstack/react-router";
import {
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { REVIEW_SORTS, type ReviewSort, ReviewSortSchema } from "~/core/schema";
import { Button } from "~/ui/button";
import { InlineError } from "~/ui/inline-error";
import { PageSection } from "~/ui/page-section";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/ui/select";
import { WithTooltip } from "~/ui/tooltip";
import { forgetPageReviews } from "./data";
import { PAGE_NOTE } from "./frame";
import { type ReviewsLevel, useReviewsLevel, useSignedIn } from "./level";
import { PlanetTerpReviewCard } from "./planetterp-review";
import { OwnReviewCard, ReviewCard } from "./review-card";
import { reviewsClient, useReviews } from "./reviews-store";

// A page's reviews: ours and PlanetTerp's as one list, each of PlanetTerp's
// marked as theirs (V2 §7.6), in the order `?sort=` asks (owner, 2026-09-29:
// "sortable, both by rating highest/lowest and latest/oldest"). The route's
// loader read the first of them in that order, so each order is a page the
// server renders; "Show more" reads on through PlanetTerp's. On an
// instructor's page your own come first, with where each stands; the form
// opens in the page's review box.

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

/** More of PlanetTerp's, a page at a time, after the loader's first. */
function useMorePlanetTerp(
  reviews: PageReviews,
  query: {
    instructorId: InstructorId | null;
    course: CourseCode | null;
    sort: ReviewSort;
  },
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
  sort = "latest",
  level,
  showCourse,
  about,
  hideId,
  onEdit,
  empty,
}: {
  reviews: PageReviews;
  query: { instructorId: InstructorId | null; course: CourseCode | null };
  /** The loader's order; "Show more" asks for the same. */
  sort?: ReviewSort;
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
  const more = useMorePlanetTerp(reviews, { ...query, sort });
  const shown = mergeReviews(
    ours,
    more.planetTerp,
    more.next === null,
    sort,
  ).filter((r) => r.review.id !== hideId);
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
        <WithTooltip label="Show the next reviews">
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

/**
 * An instructor's reviews, with your own that aren't up yet first. The form
 * opens in the page's review box, over this, on Edit.
 */
export function ReviewsSection({
  instructorId,
  course,
  reviews,
  count,
  sort,
  composing,
  onEdit,
}: {
  instructorId: InstructorId;
  /** Only this course's reviews; null for all of them. */
  course: CourseCode | null;
  reviews: PageReviews;
  /** How many there are in all, when known. */
  count: number | null;
  sort: ReviewSort;
  /** What the form is open on: the review it edits is left out here. */
  composing: Composing;
  onEdit: (review: MyReview) => void;
}) {
  const level = useReviewsLevel();
  const ownHere = useOwnHere(instructorId, course);
  useReloadOnChange();
  const waiting = ownHere.filter(
    (r) => r.status !== "published" && r !== composing,
  );

  return (
    <PageSection
      size="display"
      title={<ReviewsTitle count={count} />}
      aside={<SortControl sort={sort} />}
    >
      {waiting.length > 0 ? (
        <ul>
          {waiting.map((r) => (
            <OwnReviewCard
              key={r.id}
              review={r}
              level={level}
              showCourse={course === null}
              onEdit={onEdit}
            />
          ))}
        </ul>
      ) : null}
      <ReviewList
        reviews={reviews}
        query={{ instructorId, course }}
        sort={sort}
        level={level}
        showCourse={course === null}
        hideId={
          composing !== null && composing !== "new" ? composing.id : undefined
        }
        onEdit={onEdit}
        empty={
          // Yours may be right above, held: it isn't the first "yet".
          ownHere.length > 0
            ? course
              ? `No one else has reviewed ${course} yet.`
              : "No one else has reviewed them yet."
            : course
              ? `No reviews of ${course} yet.`
              : "No reviews yet."
        }
      />
    </PageSection>
  );
}

/** "Reviews 142": the count beside the word (owner, 2026-09-29). */
export function ReviewsTitle({ count }: { count: number | null }) {
  return (
    <>
      Reviews
      {count ? (
        <span className="tnum ml-2 font-normal text-muted">
          {count.toLocaleString("en-US")}
        </span>
      ) : null}
    </>
  );
}

const SORT_WORDS: Record<ReviewSort, string> = {
  latest: "Latest first",
  oldest: "Oldest first",
  highest: "Highest rated",
  lowest: "Lowest rated",
};

/**
 * The reviews' order, on the Reviews line at the right. Each order is its
 * own address (`?sort=`, absent for latest), which the server renders, so
 * a shared link keeps its order; picking one replaces the address, since
 * it's the same page read another way.
 */
export function SortControl({ sort }: { sort: ReviewSort }) {
  const navigate = useNavigate();
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="sr-only">
        Sort reviews
      </label>
      <Select
        value={sort}
        onValueChange={(value) => {
          const next = ReviewSortSchema.parse(value);
          void navigate({
            to: ".",
            search: (s: Record<string, unknown>) => ({
              ...s,
              sort: next === "latest" ? undefined : next,
            }),
            replace: true,
            resetScroll: false,
          });
        }}
      >
        <WithTooltip label="Sort the reviews by date or by rating">
          <SelectTrigger id={id} className="h-9 w-40 text-sm">
            <SelectValue />
          </SelectTrigger>
        </WithTooltip>
        <SelectContent align="end">
          {REVIEW_SORTS.map((s) => (
            <SelectItem key={s} value={s}>
              {SORT_WORDS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
