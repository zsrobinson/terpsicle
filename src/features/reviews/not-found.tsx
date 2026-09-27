import { Link } from "@tanstack/react-router";
import type { Suggestion } from "~/core/reviews";
import { WithTooltip } from "~/ui/tooltip";
import { Breadcrumbs, ReviewsFrame } from "./frame";

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
      <Breadcrumbs crumbs={[{ label: "Reviews", to: "/reviews" }]} />
      <h1 className="mb-1.5 font-semibold text-xl tracking-tight">
        {what === "instructor" ? "Instructor not found" : "Course not found"}
      </h1>
      <p className="text-muted">
        {what === "instructor"
          ? "We don't know an instructor at this address."
          : "No UMD course we know has this code."}
      </p>
      {suggestions.length > 0 ? (
        <div className="mt-6">
          <h2 className="font-semibold">Did you mean</h2>
          <ul className="mt-1">
            {suggestions.map((s) => (
              <li key={s.kind === "course" ? s.code : s.id}>
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
                      className="inline-block py-1 font-medium hover:underline"
                    >
                      {s.label}
                    </Link>
                  ) : (
                    <Link
                      to="/reviews/instructors/$id"
                      params={{ id: s.id }}
                      search={{}}
                      className="inline-block py-1 font-medium hover:underline"
                    >
                      {s.label}
                    </Link>
                  )}
                </WithTooltip>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-6 text-sm">
        <WithTooltip label="Search every UMD course">
          <Link to="/reviews" className="text-muted hover:text-fg">
            Find a course
          </Link>
        </WithTooltip>
      </p>
    </ReviewsFrame>
  );
}
