import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { MyReview } from "~/core/schema";
import { currentPath, GoogleButton } from "~/features/auth/sign-in-panel";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { Composer } from "./composer";
import { Breadcrumbs, PageTitle, ReviewsFrame } from "./frame";
import { useReviewsLevel, useSignedIn } from "./level";
import { OwnReviewCard } from "./review-card";
import { useReviews } from "./reviews-store";

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
      <Breadcrumbs crumbs={[{ label: "Reviews", to: "/reviews" }]} />
      <PageTitle
        title="Your reviews"
        sub="Readers never see who wrote a review. This page is only for you."
      />
      {signedIn === "loading" || level === "loading" ? (
        <Skeleton className="h-16 w-full" />
      ) : level === "off" ? (
        <p className="text-muted">Terpsicle Reviews isn't open yet.</p>
      ) : !signedIn ? (
        <div className="max-w-[320px] space-y-3">
          <p className="text-muted">
            Sign in with your UMD account to see the reviews you've written.
          </p>
          <GoogleButton returnTo={currentPath()} from="reviews" />
        </div>
      ) : mine.status === "error" ? (
        <p className="text-muted">
          Couldn't load your reviews. Check your connection and reload the page.
        </p>
      ) : mine.status !== "ready" ? (
        <Skeleton className="h-16 w-full" />
      ) : reviews.length === 0 ? (
        <p className="text-muted">
          You haven't written any reviews yet.{" "}
          <WithTooltip label="Find a class you've taken">
            <Link
              to="/reviews"
              className="underline underline-offset-2 hover:text-fg"
            >
              Find a class you've taken
            </Link>
          </WithTooltip>{" "}
          to review it.
        </p>
      ) : (
        <ul>
          {reviews.map((r) => (
            <li key={r.id} className="pt-3">
              <p className="text-sm">
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
              </p>
              {editing?.id === r.id ? (
                <div className="my-3">
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
                </div>
              ) : (
                <OwnReviewCard
                  review={r}
                  level={level}
                  showCourse={false}
                  onEdit={setEditing}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </ReviewsFrame>
  );
}
