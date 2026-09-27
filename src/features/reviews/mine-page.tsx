import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Mark } from "~/app/brand/mark";
import { PanelNote } from "~/app/panel";
import type { MyReview } from "~/core/schema";
import { EmptyState } from "~/ui/empty-state";
import { InlineError } from "~/ui/inline-error";
import { PageHeader } from "~/ui/page-header";
import { RowSkeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { Composer } from "./composer";
import { PAGE_NOTE, ReviewsFrame } from "./frame";
import { useReviewsLevel, useSignedIn } from "./level";
import { OwnReviewCard } from "./review-card";
import { useReviews } from "./reviews-store";
import { SignInPrompt } from "./sign-in-prompt";

// /reviews/mine (V2 §1.1): everything you've written and where each stands:
// posted, waiting for a person, not posted (and why), or hidden after
// reports. Only you ever see this page's words.

export function MyReviewsPage() {
  const level = useReviewsLevel();
  const signedIn = useSignedIn();
  const mine = useReviews((s) => s.mine);
  const loadMine = useReviews((s) => s.loadMine);
  const deleting = useReviews((s) => s.deleting);
  const [editing, setEditing] = useState<MyReview | null>(null);

  useEffect(() => {
    if (signedIn === true && (level === "read" || level === "on"))
      void loadMine();
  }, [signedIn, level, loadMine]);

  const reviews =
    mine.status === "ready" ? mine.reviews.filter((r) => !deleting[r.id]) : [];

  return (
    <ReviewsFrame>
      <PageHeader
        back={{ label: "Reviews", to: "/reviews" }}
        title="Your reviews"
        status="Readers never see who wrote a review. This page is only for you."
      />
      {signedIn === "loading" || level === "loading" ? (
        <RowSkeleton rows={2} inset={false} label="Loading your reviews" />
      ) : level === "off" ? (
        <PanelNote className={PAGE_NOTE}>Reviews isn't open yet.</PanelNote>
      ) : !signedIn ? (
        <SignInPrompt>
          Sign in with your UMD account to see the reviews you've written.
        </SignInPrompt>
      ) : mine.status === "error" ? (
        <InlineError
          message="Couldn't load your reviews. Check your connection."
          onRetry={() => void loadMine()}
        />
      ) : mine.status !== "ready" ? (
        <RowSkeleton rows={2} inset={false} label="Loading your reviews" />
      ) : reviews.length === 0 ? (
        <EmptyState
          mark={<Mark id="reviews" size={40} />}
          title="No reviews yet"
          line="Find the course you took, then pick your instructor to write one."
          primary={{
            label: "Find a course",
            to: "/reviews",
            hint: "Find the course you took",
          }}
          className="pt-2"
        />
      ) : (
        <ul>
          {reviews.map((r) =>
            editing?.id === r.id ? (
              <li key={r.id} className="py-3">
                <Composer
                  target={{
                    instructorId: r.instructorId,
                    reviewedName: r.reviewedName,
                    dept: r.course.slice(0, 4),
                    course: r.course,
                  }}
                  existing={r}
                  onClose={() => setEditing(null)}
                />
              </li>
            ) : (
              <OwnReviewCard
                key={r.id}
                review={r}
                level={level}
                showCourse={false}
                onEdit={setEditing}
                about={
                  <>
                    <WithTooltip
                      label={`Reviews of ${r.instructorName} in ${r.course}`}
                    >
                      <Link
                        to="/reviews/instructors/$id"
                        params={{ id: r.instructorId }}
                        search={{ course: r.course }}
                        className="font-medium hover:underline"
                      >
                        {r.instructorName}
                      </Link>
                    </WithTooltip>
                    <span className="text-muted">
                      {" · "}
                      <span className="ident">{r.course}</span>
                    </span>
                  </>
                }
              />
            ),
          )}
        </ul>
      )}
    </ReviewsFrame>
  );
}
