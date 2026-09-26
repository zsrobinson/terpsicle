import { ExternalLink, PenLine } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  CourseCode,
  InstructorId,
  MyReview,
  PublicReview,
} from "~/core/schema";
import { planetTerpUrl } from "~/core/schema";
import { Button } from "~/ui/button";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { Composer, type ComposerTarget } from "./composer";
import { Section } from "./frame";
import { type ReviewsLevel, useReviewsLevel, useSignedIn } from "./level";
import { OwnReviewCard, ReviewCard } from "./review-card";
import { useReviews } from "./reviews-store";
import { SignInPrompt } from "./sign-in-prompt";

// An instructor's reviews on Terpsicle, under their numbers: your own first
// (with where each stands), then everyone's, newest first, then the credited
// way to PlanetTerp's. PlanetTerp's review text is never shown here (V2 §7.1).

/** Reviews shown before "Show more". */
const PAGE = 20;

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

/** An instructor's published reviews, loaded when Reviews is on here. */
export function useInstructorReviews(id: InstructorId | null) {
  const level = useReviewsLevel();
  const list = useReviews((s) => (id ? s.lists[id] : undefined));
  const ensureList = useReviews((s) => s.ensureList);
  useEffect(() => {
    if (id && (level === "read" || level === "on")) void ensureList(id);
  }, [id, level, ensureList]);
  return list;
}

/** Reviews not waiting out a delete's Undo. */
export function useVisible(reviews: readonly PublicReview[]): PublicReview[] {
  const deleting = useReviews((s) => s.deleting);
  return useMemo(
    () => reviews.filter((r) => !deleting[r.id]),
    [reviews, deleting],
  );
}

export function ReviewsSection({
  instructorId,
  course,
  target,
  planetTerpSlug,
  planetTerpCount,
}: {
  instructorId: InstructorId;
  /** Only this course's reviews; null for all of them. */
  course: CourseCode | null;
  /** What the composer writes about; null until a course is picked. */
  target: ComposerTarget | null;
  /** PlanetTerp's slug and count, for the credited link. */
  planetTerpSlug: string | null;
  planetTerpCount: number;
}) {
  const level = useReviewsLevel();
  const signedIn = useSignedIn();
  const list = useInstructorReviews(instructorId);
  const mine = useMine();
  const deleting = useReviews((s) => s.deleting);
  const [composing, setComposing] = useState<MyReview | "new" | null>(null);
  const [shown, setShown] = useState(PAGE);

  const ownHere = mine.filter(
    (r) =>
      r.instructorId === instructorId &&
      (course === null || r.course === course) &&
      !deleting[r.id],
  );
  const ownById = new Map(ownHere.map((r) => [r.id, r]));
  const existing = target
    ? (ownHere.find(
        (r) => r.course === target.course && r.status !== "rejected",
      ) ?? null)
    : null;
  const all = useVisible(list?.status === "ready" ? list.reviews : []);
  const reviews =
    course === null ? all : all.filter((r) => r.course === course);

  const planetTerpLink =
    planetTerpSlug && planetTerpCount > 0 ? (
      <PlanetTerpLink
        slug={planetTerpSlug}
        count={planetTerpCount}
        more={list?.status === "ready" && list.reviews.length > 0}
      />
    ) : null;

  if (level === "loading")
    return (
      <Section title="Reviews">
        <Skeleton className="mt-3 h-3 w-2/3" />
        <Skeleton className="mt-2 h-3 w-1/2" />
      </Section>
    );
  if (level === "off" || list?.status === "off")
    return <Section title="Reviews">{planetTerpLink}</Section>;

  const edit = (review: MyReview) => setComposing(review);
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
        onClose={() => setComposing(null)}
      />
    ) : null;

  return (
    <Section
      title="Reviews on Terpsicle"
      count={list?.status === "ready" ? reviews.length : undefined}
      right={
        composing === null || signedIn !== true ? (
          <WriteButton
            level={level}
            target={target}
            existing={existing}
            onWrite={() => setComposing((c) => (c === "new" ? null : "new"))}
          />
        ) : null
      }
    >
      {composer ? <div className="my-3">{composer}</div> : null}
      {ownHere
        .filter((r) => r.status !== "published" && r !== composing)
        .map((r) => (
          <OwnReviewCard
            key={r.id}
            review={r}
            level={level}
            showCourse={course === null}
            onEdit={edit}
          />
        ))}
      {list === undefined || list.status === "loading" ? (
        <div className="space-y-2 py-3" aria-busy="true">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ) : list.status === "error" ? (
        <p className="py-3 text-muted">
          Couldn't load reviews. Check your connection and reload the page.
        </p>
      ) : reviews.length === 0 ? (
        <p className="py-3 text-muted">
          {course
            ? `No reviews of ${course} on Terpsicle yet.`
            : "No reviews on Terpsicle yet."}
          {level === "on" && target
            ? " Took it? Yours could be the first."
            : ""}
        </p>
      ) : (
        <div>
          {reviews
            .slice(0, shown)
            .map((r) =>
              composing !== null &&
              composing !== "new" &&
              composing.id === r.id ? null : (
                <ReviewCard
                  key={r.id}
                  review={r}
                  own={ownById.get(r.id) ?? null}
                  level={level}
                  showCourse={course === null}
                  onEdit={edit}
                />
              ),
            )}
          {reviews.length > shown ? (
            <WithTooltip
              label={`Show ${Math.min(PAGE, reviews.length - shown)} more`}
            >
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => setShown((n) => n + PAGE)}
              >
                Show more
              </Button>
            </WithTooltip>
          ) : null}
        </div>
      )}
      {planetTerpLink}
    </Section>
  );
}

/** "48 more on PlanetTerp ↗": credited, and the only way to their words. */
export function PlanetTerpLink({
  slug,
  count,
  more,
}: {
  slug: string;
  count: number;
  more: boolean;
}) {
  const words = `${count.toLocaleString("en-US")} ${more ? "more " : ""}${count === 1 ? "review" : "reviews"} on PlanetTerp`;
  return (
    <p className="mt-3 text-muted text-sm">
      <WithTooltip label="Read them on PlanetTerp, which we're not part of">
        <a
          href={planetTerpUrl(slug)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-fg"
        >
          {words}
          <ExternalLink size={11} aria-hidden="true" />
        </a>
      </WithTooltip>
    </p>
  );
}

/** "Write a review", or what stands in its way. */
export function WriteButton({
  level,
  target,
  existing,
  onWrite,
  label,
}: {
  level: ReviewsLevel;
  target: ComposerTarget | null;
  existing: MyReview | null;
  onWrite: () => void;
  label?: string;
}) {
  const signedIn = useSignedIn();
  if (level !== "on" || signedIn === "loading") return null;
  const words = label ?? (existing ? "Edit your review" : "Write a review");
  if (!target)
    return (
      <span className="text-faint text-sm">
        Pick a course above to review it
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
      <Button variant="outline" size="sm" onClick={onWrite}>
        <PenLine size={13} aria-hidden="true" />
        {words}
      </Button>
    </WithTooltip>
  );
}
