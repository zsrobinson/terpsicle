import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PenLine } from "lucide-react";
import { useMemo } from "react";
import { termLabel } from "~/core/catalog/terms";
import {
  courseSlug,
  type InstructorToReview,
  instructorsToReview,
  reviewedKey,
} from "~/core/reviews";
import type { IsoDate } from "~/core/schema";
import { ListRow } from "~/ui/list-row";
import { WithTooltip } from "~/ui/tooltip";
import type { HomeLocal } from "./local";
import { reviewedKeysQuery } from "./queries";
import { HomeSection, homeLinkClicked, ROW_LINK } from "./section";

// "Review your instructors" (owner, 2026-09-28: "encourage reviews of
// professors based on the information we know about the user like the
// courses they're signed up for"), the same list /reviews shows
// (`instructorsToReview`), from each term's main plan: the classes you
// took. Instructors you've reviewed drop out. Gone when there's nobody.

/** Rows shown: the newest terms' first. */
const SHOWN = 3;

export function ReviewsSection({
  local,
  today,
}: {
  local: HomeLocal;
  today: IsoDate;
}) {
  const reviewed = useReviewedKeys();
  const rows = useMemo(() => {
    if (reviewed === null) return null;
    // Each term's main plan, the one you took (V2 §5.5), not the drafts:
    // picked inside, the same way /reviews asks for it.
    return instructorsToReview(
      local.plans,
      today,
      reviewed,
      local.mainPlans,
    ).slice(0, SHOWN);
  }, [local, today, reviewed]);

  // Nothing to ask: no section at all, never an empty one.
  if (!rows || rows.length === 0) return null;
  return (
    <HomeSection
      product="reviews"
      title="Review your instructors"
      to="/reviews"
      tooltip="Read and write reviews"
    >
      <ul aria-label="Instructors to review">
        {rows.map((r) => (
          <ReviewRow key={reviewedKey(r.course, r.name)} r={r} />
        ))}
      </ul>
    </HomeSection>
  );
}

function ReviewRow({ r }: { r: InstructorToReview }) {
  return (
    <ListRow
      as="li"
      className="relative px-0 hover:bg-hover"
      secondary={termLabel(r.termId)}
      trail={
        <span className="flex items-center gap-1 font-medium text-fg">
          <PenLine size={13} aria-hidden="true" />
          Review
        </span>
      }
    >
      <WithTooltip label={`Review ${r.name} in ${r.course}`}>
        <Link
          to="/reviews/$slug"
          params={{ slug: courseSlug(r.course) }}
          search={{ write: r.name }}
          onClick={() => homeLinkClicked("reviews")}
          className={ROW_LINK}
        >
          <span data-private="" className="font-medium">
            {r.name}
          </span>{" "}
          <span className="text-muted">in</span>{" "}
          <span className="ident">{r.course}</span>
        </Link>
      </WithTooltip>
    </ListRow>
  );
}

/**
 * The reviews you've written, as `reviewedKey`s; null while loading, and
 * offline: ask nothing rather than ask for ones already written.
 */
function useReviewedKeys(): ReadonlySet<string> | null {
  return useQuery(reviewedKeysQuery()).data ?? null;
}
