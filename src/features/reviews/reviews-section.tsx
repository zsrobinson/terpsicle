import { ExternalLink, PenLine } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PanelNote } from "~/app/panel";
import type {
  CourseCode,
  InstructorId,
  MyReview,
  PublicReview,
} from "~/core/schema";
import { planetTerpUrl } from "~/core/schema";
import { Button } from "~/ui/button";
import { InlineError } from "~/ui/inline-error";
import { PageSection } from "~/ui/page-section";
import { RowSkeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { Composer, type ComposerTarget } from "./composer";
import { PAGE_ROW } from "./frame";
import { type ReviewsLevel, useReviewsLevel, useSignedIn } from "./level";
import { OwnReviewCard, ReviewCard } from "./review-card";
import { useReviews } from "./reviews-store";
import { SignInPrompt } from "./sign-in-prompt";

// An instructor's reviews on Terpsicle, under their numbers: your own first
// (with where each stands), then everyone's, newest first, then the credited
// way to PlanetTerp's. PlanetTerp's review text is never shown here (V2 §7.1).
// "Write a review" is the page header's action; the form opens here.

/** Reviews shown before "Show more". */
const PAGE = 20;

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

export function ReviewsSection({
  instructorId,
  course,
  target,
  composing,
  onCompose,
  planetTerpSlug,
  planetTerpCount,
}: {
  instructorId: InstructorId;
  /** Only this course's reviews; null for all of them. */
  course: CourseCode | null;
  /** What the composer writes about; null until a course is picked. */
  target: ComposerTarget | null;
  /** The page's "Write a review" and each review's Edit open the form here. */
  composing: Composing;
  onCompose: (next: Composing) => void;
  /** PlanetTerp's slug and count, for the credited link. */
  planetTerpSlug: string | null;
  planetTerpCount: number;
}) {
  const level = useReviewsLevel();
  const signedIn = useSignedIn();
  const list = useInstructorReviews(instructorId);
  const reloadList = useReviews((s) => s.reloadList);
  const ownHere = useOwnHere(instructorId, course);
  const [shown, setShown] = useState(PAGE);
  const formRef = useRef<HTMLDivElement>(null);

  // The header's button can be a screen away: bring the form to it.
  useEffect(() => {
    if (composing !== null)
      formRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [composing]);

  const ownById = new Map(ownHere.map((r) => [r.id, r]));
  const existing = existingReview(ownHere, target);
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
      <PageSection title="Reviews">
        <RowSkeleton rows={2} inset={false} label="Loading reviews" />
      </PageSection>
    );
  if (level === "off" || list?.status === "off")
    return <PageSection title="Reviews">{planetTerpLink}</PageSection>;

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
      title="Reviews on Terpsicle"
      aside={list?.status === "ready" ? reviews.length : undefined}
    >
      {composer ? (
        <div ref={formRef} className="scroll-mt-4">
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
      {list === undefined || list.status === "loading" ? (
        <RowSkeleton rows={3} inset={false} label="Loading reviews" />
      ) : list.status === "error" ? (
        <InlineError
          message="Couldn't load reviews. Check your connection."
          onRetry={() => void reloadList(instructorId)}
        />
      ) : reviews.length === 0 ? (
        <PanelNote className={PAGE_ROW}>
          {course
            ? `No reviews of ${course} on Terpsicle yet.`
            : "No reviews on Terpsicle yet."}
          {level === "on" && target
            ? " Took it? Yours could be the first."
            : ""}
        </PanelNote>
      ) : (
        <div>
          <ul>
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
          </ul>
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
    </PageSection>
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
    <p className="text-muted text-sm">
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
      <span className="text-muted text-sm">Pick a course to review it</span>
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
        <Button onClick={onWrite}>
          <PenLine aria-hidden="true" />
          {words}
        </Button>
      )}
    </WithTooltip>
  );
}
