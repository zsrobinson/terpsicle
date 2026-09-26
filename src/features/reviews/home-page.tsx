import { Link, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { matchCourses } from "~/core/reviews";
import type { CourseCode } from "~/core/schema";
import { WithTooltip } from "~/ui/tooltip";
import { loadCourseSearch, useLoaded } from "./data";
import { PageTitle, ReviewsFrame, Section } from "./frame";
import { useReviewsLevel, useSignedIn } from "./level";
import { readPlanCourses } from "./your-classes";

// /reviews (V2 §1.1): find a course, or pick one of your classes from the
// plans in this browser. Each course page lists who's taught it.

/** Search results shown at once. */
const RESULTS = 8;

export function ReviewsHomePage() {
  const level = useReviewsLevel();
  const signedIn = useSignedIn();
  const [yours, setYours] = useState<CourseCode[]>([]);
  useEffect(() => {
    void readPlanCourses().then(setYours);
  }, []);
  return (
    <ReviewsFrame page="home">
      <PageTitle
        title="Terpsicle Reviews"
        sub={
          level === "on"
            ? "What students say about UMD courses and instructors. Anyone can read them; sign in with your UMD account to write your own."
            : "What students say about UMD courses and instructors."
        }
      />
      <CourseSearch />
      {yours.length > 0 ? (
        <Section title="Your classes">
          <ul className="flex flex-wrap gap-1 pt-3">
            {yours.map((code) => (
              <li key={code}>
                <WithTooltip label={`Reviews and grades for ${code}`}>
                  <Link
                    to="/reviews/courses/$code"
                    params={{ code }}
                    className="ident flex h-7 items-center rounded-md border border-hairline px-2.5 text-sm hover:bg-hover"
                  >
                    {code}
                  </Link>
                </WithTooltip>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-faint text-xs">
            From the plans saved in this browser.
          </p>
        </Section>
      ) : null}
      <nav
        aria-label="More"
        className="mt-8 flex flex-wrap gap-4 text-muted text-sm"
      >
        {signedIn === true && level !== "off" ? (
          <WithTooltip label="Everything you've written, and where each stands">
            <Link to="/reviews/mine" className="hover:text-fg">
              Your reviews
            </Link>
          </WithTooltip>
        ) : null}
        <WithTooltip label="What reviews can and can't say, and how checks work">
          <Link to="/reviews/policy" className="hover:text-fg">
            What's allowed
          </Link>
        </WithTooltip>
      </nav>
      <p className="mt-2 text-faint text-xs">
        Ratings and grades include PlanetTerp's, with thanks. Terpsicle isn't
        affiliated with the University of Maryland.
      </p>
    </ReviewsFrame>
  );
}

function CourseSearch() {
  const [query, setQuery] = useState("");
  const [wanted, setWanted] = useState(false);
  const rows = useLoaded(wanted ? "course-search" : null, loadCourseSearch);
  const navigate = useNavigate();
  const listId = useId();
  const results = useMemo(
    () =>
      rows.status === "ready"
        ? matchCourses(rows.data, query).slice(0, RESULTS)
        : [],
    [rows, query],
  );
  const open = (code: CourseCode) =>
    void navigate({ to: "/reviews/courses/$code", params: { code } });
  return (
    <form
      aria-label="Find a course"
      onSubmit={(e) => {
        e.preventDefault();
        const first = results[0];
        if (first) open(first[0]);
      }}
    >
      <label htmlFor={`${listId}-input`} className="sr-only">
        Find a course
      </label>
      <div className="flex h-9 items-center gap-2 border border-hairline-strong bg-raised px-2.5 focus-within:border-fg/40">
        <Search size={14} aria-hidden="true" className="text-faint" />
        <WithTooltip label="Search by course code or title">
          <input
            id={`${listId}-input`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setWanted(true)}
            placeholder="Find a course: CMSC351, algorithms…"
            autoComplete="off"
            aria-controls={listId}
            className="h-full flex-1 bg-transparent text-base placeholder:text-faint focus:outline-none"
          />
        </WithTooltip>
      </div>
      <ul id={listId} aria-label="Courses" className="mt-1">
        {query.trim() !== "" && rows.status === "loading" ? (
          <li className="px-2.5 py-2 text-muted text-sm">Loading courses…</li>
        ) : query.trim() !== "" && rows.status === "error" ? (
          <li className="px-2.5 py-2 text-muted text-sm">
            Couldn't load the course list. Check your connection and try again.
          </li>
        ) : query.trim() !== "" && results.length === 0 ? (
          <li className="px-2.5 py-2 text-muted text-sm">
            No course matches “{query.trim()}”.
          </li>
        ) : (
          results.map(([code, title]) => (
            <li key={code}>
              <WithTooltip label={`Reviews and grades for ${code}`}>
                <Link
                  to="/reviews/courses/$code"
                  params={{ code }}
                  className="flex items-baseline gap-2 px-2.5 py-1.5 hover:bg-hover"
                >
                  <span className="ident font-medium">{code}</span>
                  <span className="truncate text-muted">{title}</span>
                </Link>
              </WithTooltip>
            </li>
          ))
        )}
      </ul>
    </form>
  );
}
