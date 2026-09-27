import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import type { Suggestion } from "~/core/reviews";
import { ListRow } from "~/ui/list-row";
import { PageHeader } from "~/ui/page-header";
import { PageSection } from "~/ui/page-section";
import { WithTooltip } from "~/ui/tooltip";
import { PAGE_ROW, ReviewsFrame, ROW_LINK } from "./frame";

// An instructor or course page nobody publishes (a mistyped link, or an old
// one): a real 404 from the server, with what they may have meant.

/** What the route's loader put in `notFound({ data })`. */
export interface ReviewsNotFoundData {
  suggestions: Suggestion[];
}

function isSuggestions(data: unknown): data is ReviewsNotFoundData {
  return (
    typeof data === "object" &&
    data !== null &&
    Array.isArray((data as { suggestions?: unknown }).suggestions)
  );
}

export function ReviewsNotFound({
  what,
  data,
}: {
  what: "instructor" | "course";
  data: unknown;
}) {
  const suggestions = isSuggestions(data) ? data.suggestions : [];
  return (
    <ReviewsFrame>
      <PageHeader
        back={{ label: "Reviews", to: "/reviews" }}
        title={
          what === "instructor" ? "Instructor not found" : "Course not found"
        }
        status={
          <>
            {what === "instructor"
              ? "We don't know an instructor at this address."
              : "No UMD course we know has this code."}{" "}
            <WithTooltip label="Search every UMD course">
              <Link
                to="/reviews"
                className="text-fg underline decoration-hairline-strong underline-offset-2 hover:decoration-fg"
              >
                Find a course
              </Link>
            </WithTooltip>
          </>
        }
      />
      {suggestions.length > 0 ? (
        <PageSection title="Did you mean">
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
                      to="/reviews/courses/$code"
                      params={{ code: s.code }}
                      className={cn(ROW_LINK, "font-medium hover:underline")}
                    >
                      {s.label}
                    </Link>
                  ) : (
                    <Link
                      to="/reviews/instructors/$id"
                      params={{ id: s.id }}
                      search={{}}
                      className={cn(ROW_LINK, "font-medium hover:underline")}
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
