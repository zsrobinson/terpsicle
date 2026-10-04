import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { courseSlug, instructorSlug, type Suggestion } from "~/core/reviews";
import { Button } from "~/ui/button";
import { ListRow } from "~/ui/list-row";
import { PageHeader } from "~/ui/page-header";
import { PageSection } from "~/ui/page-section";
import { WithTooltip } from "~/ui/tooltip";
import { PAGE_ROW, ReviewsFrame, ROW_LINK } from "./frame";

// An instructor or course page nobody publishes (a mistyped link, or an old
// one): a real 404 from the server, with what they may have meant.

/** What the route's loader put in `notFound({ data })`. */
export interface ReviewsNotFoundData {
  what: "instructor" | "course";
  suggestions: Suggestion[];
}

function isNotFoundData(data: unknown): data is ReviewsNotFoundData {
  return (
    typeof data === "object" &&
    data !== null &&
    Array.isArray((data as { suggestions?: unknown }).suggestions)
  );
}

export function ReviewsNotFound({ data }: { data: unknown }) {
  const found = isNotFoundData(data) ? data : null;
  const suggestions = found?.suggestions ?? [];
  const what = found?.what ?? "instructor";
  return (
    <ReviewsFrame>
      <PageHeader
        size="display"
        title={
          what === "instructor" ? "Instructor not found" : "Course not found"
        }
        status={
          what === "instructor"
            ? "We don't know an instructor at this address."
            : "No UMD course we know has this code."
        }
      />
      {/* The same shape as every page we don't have: say so, then the way on. */}
      <WithTooltip label="Search every UMD instructor and course">
        <Button asChild size="lg" className="w-fit">
          <Link to="/reviews">Search reviews</Link>
        </Button>
      </WithTooltip>
      {suggestions.length > 0 ? (
        <PageSection size="display" title="Did you mean">
          <ul>
            {suggestions.map((s) => (
              <ListRow
                key={s.kind === "course" ? s.code : s.id}
                as="li"
                className={cn(PAGE_ROW, "relative")}
              >
                <WithTooltip
                  label={
                    s.kind === "course"
                      ? `Reviews and grades for ${s.code}`
                      : `${s.label}'s reviews and grades`
                  }
                >
                  {s.kind === "course" ? (
                    <Link
                      to="/reviews/$slug"
                      params={{ slug: courseSlug(s.code) }}
                      className={cn(
                        ROW_LINK,
                        "font-medium text-lg hover:underline",
                      )}
                    >
                      {s.label}
                    </Link>
                  ) : (
                    <Link
                      to="/reviews/$slug"
                      params={{ slug: instructorSlug(s.id) }}
                      className={cn(
                        ROW_LINK,
                        "font-medium text-lg hover:underline",
                      )}
                    >
                      {s.label}
                    </Link>
                  )}
                </WithTooltip>
              </ListRow>
            ))}
          </ul>
        </PageSection>
      ) : null}
    </ReviewsFrame>
  );
}
