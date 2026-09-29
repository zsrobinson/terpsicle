import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { ArrowRight, PenLine } from "lucide-react";
import { useEffect, useState } from "react";
import { termLabel } from "~/core/catalog/terms";
import {
  courseSlug,
  type InstructorToReview,
  instructorSlug,
  instructorsToReview,
  reviewedKey,
  reviewStanding,
  reviewsByRecency,
} from "~/core/reviews";
import {
  type CourseCode,
  type InstructorId,
  instructorNameKey,
} from "~/core/schema";
import { formatMonthYear } from "~/core/time/format";
import { newYorkClock } from "~/core/todo/list";
import { GoogleButton } from "~/features/auth/sign-in-panel";
import { Button } from "~/ui/button";
import { ListRow } from "~/ui/list-row";
import { PageSection } from "~/ui/page-section";
import { WithTooltip } from "~/ui/tooltip";
import { browserReader, loadPlanetTerp } from "./data";
import { ROW_LINK } from "./frame";
import { useReviewsLevel, useSignedIn } from "./level";
import { useMineSettled } from "./review-box";
import { useMine } from "./reviews-section";
import { readMainPlans, readPlanCourses, readPlans } from "./your-classes";

// The narrow column of /reviews (owner, 2026-09-29: "a list of recent
// professors you haven't reviewed, and below that a list of ones you
// have"). From your schedules: the instructors of the sections in each
// term's main plan, for terms that are over or nearly (src/core/reviews/
// to-review.ts), newest first, each a step from the form; then your
// reviews, newest first; then the courses in your plans. Signed out, the
// instructors are there to read about, with one quiet line on signing in.
// Quiet rows and notes, never a banner.

/** Rows each list shows: the newest first. */
const SHOWN = 6;

interface Row extends InstructorToReview {
  /** Their id, when PlanetTerp's join knows the name. */
  id: InstructorId | null;
}

/**
 * Who taught you, from your schedules, with their ids; `reviewed` leaves
 * out those you've reviewed. Null until it's worked out (or while waiting).
 */
function useYourInstructors(
  reviewed: ReadonlySet<string> | null,
): Row[] | null {
  const [rows, setRows] = useState<Row[] | null>(null);
  const keys = reviewed ? [...reviewed].sort().join("|") : null;
  useEffect(() => {
    if (keys === null) return;
    let live = true;
    void (async () => {
      const done = new Set(keys ? keys.split("|") : []);
      // Each term's main plan: the one you took, not its drafts.
      const [plans, mainPlans] = await Promise.all([
        readPlans(),
        readMainPlans(),
      ]);
      const found = instructorsToReview(
        plans,
        newYorkClock(Date.now()).date,
        done,
        mainPlans,
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
  }, [keys]);
  return rows;
}

/** Every course in your plans, for "Your classes". */
function useYourCourses(): CourseCode[] {
  const [codes, setCodes] = useState<CourseCode[]>([]);
  useEffect(() => {
    void readPlanCourses().then(setCodes);
  }, []);
  return codes;
}

export function YourReviewsColumn() {
  const signedIn = useSignedIn();
  const level = useReviewsLevel();
  const mine = useMine();
  const settled = useMineSettled();
  const writing = level === "on";
  const reviewed =
    signedIn === "loading" || level === "loading" || !settled
      ? null
      : new Set(
          signedIn && writing
            ? mine
                .filter((r) => r.status !== "rejected")
                .map((r) => reviewedKey(r.course, r.reviewedName))
            : [],
        );
  const rows = useYourInstructors(reviewed);
  const courses = useYourCourses();
  const yours = signedIn === true ? reviewsByRecency(mine) : [];
  return (
    <>
      <PageSection
        title={
          writing && signedIn === true
            ? "Review your instructors"
            : "Your instructors"
        }
        aside={rows && rows.length > 0 ? "From your schedules" : undefined}
      >
        {rows && rows.length > 0 ? (
          <ul aria-label="Instructors to review">
            {rows.map((r) => (
              <InstructorRow
                key={reviewedKey(r.course, r.name)}
                row={r}
                write={writing && signedIn === true}
              />
            ))}
          </ul>
        ) : rows ? (
          <p className="text-muted">
            {signedIn === true && writing && yours.length > 0
              ? "You've reviewed everyone from your past schedules. Thanks."
              : "Build last term's schedule in Schedule, and who taught you shows up here."}
          </p>
        ) : null}
        {signedIn === false && writing ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-muted">
              Sign in with your UMD account to review them. Readers won't see
              who wrote it.
            </p>
            <GoogleButton
              returnTo="/reviews"
              from="reviews"
              className="w-fit"
            />
          </div>
        ) : null}
      </PageSection>

      {yours.length > 0 ? (
        <PageSection
          title="Your reviews"
          aside={
            <WithTooltip label="Everything you've written, and where each stands">
              <Link
                to="/reviews/mine"
                className="inline-flex items-center gap-1 font-medium text-muted text-sm hover:text-fg"
              >
                All
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </WithTooltip>
          }
        >
          <ul aria-label="Your reviews">
            {yours.slice(0, SHOWN).map((r) => (
              <ListRow
                key={r.id}
                as="li"
                className="relative px-0 hover:bg-hover"
                secondary={`${formatMonthYear(r.createdAt.slice(0, 7))} · ${reviewStanding(r).label}`}
              >
                <WithTooltip
                  label={`Reviews of ${r.instructorName} in ${r.course}`}
                >
                  <Link
                    to="/reviews/$slug"
                    params={{ slug: instructorSlug(r.instructorId) }}
                    search={{ course: r.course }}
                    className={cn(ROW_LINK, "block truncate text-base")}
                  >
                    <span className="font-medium">{r.instructorName}</span>{" "}
                    <span className="text-muted">in</span>{" "}
                    <span className="ident">{r.course}</span>
                  </Link>
                </WithTooltip>
              </ListRow>
            ))}
          </ul>
        </PageSection>
      ) : null}

      {courses.length > 0 ? (
        <PageSection
          title="Your classes"
          // Signed in, plan sync keeps every device's plans here too.
          aside="From your plans"
        >
          <ul className="flex flex-wrap gap-2">
            {courses.map((code) => (
              <li key={code}>
                <WithTooltip label={`Reviews and grades for ${code}`}>
                  <Button variant="outline" size="sm" className="ident" asChild>
                    <Link
                      to="/reviews/$slug"
                      params={{ slug: courseSlug(code) }}
                    >
                      {code}
                    </Link>
                  </Button>
                </WithTooltip>
              </li>
            ))}
          </ul>
        </PageSection>
      ) : null}
    </>
  );
}

/** One instructor of yours: to review (signed in), or to read about. */
function InstructorRow({ row, write }: { row: Row; write: boolean }) {
  const words = (
    <>
      <span className="font-medium">{row.name}</span>{" "}
      <span className="text-muted">in</span>{" "}
      <span className="ident">{row.course}</span>
    </>
  );
  const className = cn(ROW_LINK, "block truncate text-base");
  return (
    <ListRow
      as="li"
      className="relative px-0 hover:bg-hover"
      secondary={termLabel(row.termId)}
      trail={
        write ? (
          <span className="flex items-center gap-1 font-medium text-fg text-sm">
            <PenLine size={13} aria-hidden="true" />
            Review
          </span>
        ) : undefined
      }
    >
      <WithTooltip
        label={
          write
            ? `Review ${row.name} in ${row.course}`
            : `${row.name}'s reviews in ${row.course}`
        }
      >
        {row.id ? (
          <Link
            to="/reviews/$slug"
            params={{ slug: instructorSlug(row.id) }}
            search={
              write
                ? { course: row.course, write: "1" }
                : { course: row.course }
            }
            className={className}
          >
            {words}
          </Link>
        ) : (
          <Link
            to="/reviews/$slug"
            params={{ slug: courseSlug(row.course) }}
            search={write ? { write: row.name } : {}}
            className={className}
          >
            {words}
          </Link>
        )}
      </WithTooltip>
    </ListRow>
  );
}
