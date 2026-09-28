import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { PenLine } from "lucide-react";
import { useEffect, useState } from "react";
import { termLabel } from "~/core/catalog/terms";
import {
  courseSlug,
  type InstructorToReview,
  instructorSlug,
  instructorsToReview,
  reviewedKey,
} from "~/core/reviews";
import { type InstructorId, instructorNameKey } from "~/core/schema";
import { newYorkClock } from "~/core/todo/list";
import { ListRow } from "~/ui/list-row";
import { PageSection } from "~/ui/page-section";
import { WithTooltip } from "~/ui/tooltip";
import { browserReader, loadPlanetTerp } from "./data";
import { PAGE_ROW, ROW_LINK } from "./frame";
import { useReviewsLevel, useSignedIn } from "./level";
import { useMine } from "./reviews-section";
import { readPlans } from "./your-classes";

// "Review your instructors" on /reviews (owner, 2026-09-28: "encourage
// reviews of professors based on the information we know about the user
// like the courses they're signed up for"). Signed in, from the sections in
// your schedules for terms that are over, or nearly (src/core/reviews/
// to-review.ts): each row goes straight to the form. A quiet section of
// rows, never a banner; it's gone once you've reviewed them all.

/** Rows shown: the newest terms' first. */
const SHOWN = 6;

interface Row extends InstructorToReview {
  /** Their id, when PlanetTerp's join knows the name. */
  id: InstructorId | null;
}

/** Who you could review, with their ids; null until it's worked out. */
function useToReview(enabled: boolean): Row[] | null {
  const mine = useMine();
  const [rows, setRows] = useState<Row[] | null>(null);
  const reviewedKeys = mine
    .filter((r) => r.status !== "rejected")
    .map((r) => reviewedKey(r.course, r.reviewedName))
    .join("|");
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    void (async () => {
      const reviewed = new Set(reviewedKeys ? reviewedKeys.split("|") : []);
      const found = instructorsToReview(
        await readPlans(),
        newYorkClock(Date.now()).date,
        reviewed,
      ).slice(0, SHOWN);
      const reader = await browserReader();
      const withIds = await Promise.all(
        found.map(async (r) => {
          const pt = await loadPlanetTerp(reader, r.course.slice(0, 4)).catch(
            () => null,
          );
          return {
            ...r,
            id: pt?.dept?.names[instructorNameKey(r.name)] ?? null,
          };
        }),
      );
      if (live) setRows(withIds);
    })();
    return () => {
      live = false;
    };
  }, [enabled, reviewedKeys]);
  return rows;
}

export function ReviewYourInstructors() {
  const signedIn = useSignedIn();
  const level = useReviewsLevel();
  const rows = useToReview(signedIn === true && level === "on");
  if (signedIn !== true || level !== "on" || !rows || rows.length === 0)
    return null;
  return (
    <PageSection
      size="display"
      title="Review your instructors"
      aside="From your schedules"
    >
      <ul>
        {rows.map((r) => (
          <ListRow
            key={reviewedKey(r.course, r.name)}
            as="li"
            className={cn(PAGE_ROW, "relative hover:bg-hover")}
            secondary={termLabel(r.termId)}
            trail={
              <span className="flex items-center gap-1 font-medium text-base text-fg">
                <PenLine size={14} aria-hidden="true" />
                Review
              </span>
            }
          >
            <WithTooltip label={`Review ${r.name} in ${r.course}`}>
              {r.id ? (
                <Link
                  to="/reviews/$slug"
                  params={{ slug: instructorSlug(r.id) }}
                  search={{ course: r.course, write: "1" }}
                  className={cn(ROW_LINK, "text-lg")}
                >
                  <span className="font-medium">{r.name}</span>{" "}
                  <span className="text-muted">in</span>{" "}
                  <span className="ident">{r.course}</span>
                </Link>
              ) : (
                <Link
                  to="/reviews/$slug"
                  params={{ slug: courseSlug(r.course) }}
                  search={{ write: r.name }}
                  className={cn(ROW_LINK, "text-lg")}
                >
                  <span className="font-medium">{r.name}</span>{" "}
                  <span className="text-muted">in</span>{" "}
                  <span className="ident">{r.course}</span>
                </Link>
              )}
            </WithTooltip>
          </ListRow>
        ))}
      </ul>
    </PageSection>
  );
}
