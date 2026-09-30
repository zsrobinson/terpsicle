import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { ArrowRight, PenLine } from "lucide-react";
import { useEffect, useState } from "react";
import { termLabel } from "~/core/catalog/terms";
import {
  classesToReview,
  courseSlug,
  instructorSlug,
  reviewedKey,
  reviewStanding,
  reviewsByRecency,
  type TookHere,
} from "~/core/reviews";
import { type InstructorId, instructorNameKey } from "~/core/schema";
import { formatMonthYear } from "~/core/time/format";
import { useAccount } from "~/features/auth/account-store";
import { ListRow } from "~/ui/list-row";
import { PageSection } from "~/ui/page-section";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { browserReader, loadPlanetTerp } from "./data";
import { ROW_LINK } from "./frame";
import { useAccountView, useReviewsLevel, useSignedIn } from "./level";
import { useClassesTaken, useMineSettled } from "./review-box";
import { useMine } from "./reviews-section";

// The narrow column of /reviews (owner, 2026-09-29: "a list of recent
// professors you haven't reviewed, and below that a list of ones you
// have"). Your classes, as the review box knows them (src/core/reviews/
// took.ts): the four-year plan's past terms, and Schedule's for terms the
// Schedule of Classes still lists, newest first, each a step from the
// form. A class whose instructor your plans don't name goes to its
// course's page, which asks who. Then your reviews, newest first. Signed
// out, the classes are there to read about; signing in is asked on the page
// you'd review from (owner, 2026-09-30). Quiet bands and notes, never a
// banner.

/** Rows each list shows: the newest first. */
const SHOWN = 6;

interface Row extends TookHere {
  /** Their id, when PlanetTerp's join knows the name. */
  id: InstructorId | null;
}

/**
 * Your classes, with their instructors' ids; `reviewed` leaves out those
 * you've reviewed. Null until it's worked out (or while waiting).
 */
function useYourClasses(reviewed: ReadonlySet<string> | null): Row[] | null {
  const taken = useClassesTaken();
  const [rows, setRows] = useState<Row[] | null>(null);
  const keys = reviewed ? [...reviewed].sort().join("|") : null;
  useEffect(() => {
    if (keys === null || taken === null) return;
    let live = true;
    void (async () => {
      const done = new Set(keys ? keys.split("|") : []);
      const found = classesToReview(taken, done).slice(0, SHOWN);
      const reader = await browserReader();
      const withIds = await Promise.all(
        found.map(async (r) => {
          const name = r.instructor;
          if (name === null) return { ...r, id: null };
          const pt = await loadPlanetTerp(reader, r.course.slice(0, 4)).catch(
            () => null,
          );
          return { ...r, id: pt?.dept?.names[instructorNameKey(name)] ?? null };
        }),
      );
      if (live) setRows(withIds);
    })();
    return () => {
      live = false;
    };
  }, [keys, taken]);
  return rows;
}

export function YourReviewsColumn() {
  const signedIn = useSignedIn();
  const view = useAccountView();
  const level = useReviewsLevel();
  const mine = useMine();
  const settled = useMineSettled();
  const writing = level === "on";
  // Signed in, it waits for your reviews; signed out (as this browser last
  // was, while /api/me confirms), there are none to wait for.
  const known =
    level !== "loading" &&
    (view === "signed-out" ||
      (view === "signed-in" && signedIn === true && settled));
  const mineHere = view === "signed-in" && writing;
  const reviewed = known
    ? new Set(
        mineHere
          ? mine
              .filter((r) => r.status !== "rejected")
              .map((r) => reviewedKey(r.course, r.reviewedName))
          : [],
      )
    : null;
  const rows = useYourClasses(reviewed);
  const planListed = useAccount((s) => s.flags.plan);
  const yours = view === "signed-in" ? reviewsByRecency(mine) : [];
  // Until it knows what to say, the section's shape: never the signed-out
  // words first (owner, 2026-09-30).
  if (!known || rows === null) return <ColumnPlaceholder />;
  return (
    <>
      <PageSection
        size="side"
        title={mineHere ? "Review your classes" : "Classes you took"}
        aside={rows.length > 0 ? "From your plans" : undefined}
      >
        {rows.length > 0 ? (
          <ul aria-label="Classes to review" className={BANDS}>
            {rows.map((r) => (
              <ClassRow
                key={reviewedKey(r.course, r.instructor ?? "")}
                row={r}
                write={writing && signedIn === true}
              />
            ))}
          </ul>
        ) : mineHere && yours.length > 0 ? (
          <p className="text-muted">
            You've reviewed every class from your plans. Thanks.
          </p>
        ) : planListed ? (
          // Where your classes come from: a transcript knows them all.
          <p className="text-muted">
            Import your transcript in{" "}
            <WithTooltip label="Your four-year plan, where a transcript imports">
              <Link
                to="/plan"
                className="text-fg underline decoration-hairline-strong underline-offset-2 hover:decoration-fg"
              >
                Plan
              </Link>
            </WithTooltip>
            , and the classes you took show up here.
          </p>
        ) : (
          <p className="text-muted">The classes you took show up here.</p>
        )}
      </PageSection>

      {yours.length > 0 ? (
        <PageSection
          size="side"
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
          <ul aria-label="Your reviews" className={BANDS}>
            {yours.slice(0, SHOWN).map((r) => (
              <ListRow
                key={r.id}
                as="li"
                className={BAND}
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
    </>
  );
}

/**
 * The column's lists: each item its own soft band, no rules between
 * (owner, 2026-09-30: "no more separator lines between items but keep
 * visually distinct").
 */
const BANDS = "flex flex-col gap-2";
const BAND = "relative rounded-md border-b-0 bg-band px-3 hover:bg-hover";

/** The column's shape while it finds out whose it is. */
function ColumnPlaceholder() {
  return (
    <div
      aria-hidden="true"
      data-testid="yours-waiting"
      className="flex flex-col gap-4"
    >
      <Skeleton className="h-7 w-1/2" />
      <div className={BANDS}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-md" />
        ))}
      </div>
    </div>
  );
}

/**
 * One class of yours: to review (signed in), or to read about. Without its
 * instructor, it's the course's page, which asks who taught you.
 */
function ClassRow({ row, write }: { row: Row; write: boolean }) {
  const name = row.instructor;
  const words = (
    <>
      {name ? (
        <>
          <span className="font-medium">{name}</span>{" "}
          <span className="text-muted">in</span>{" "}
        </>
      ) : null}
      <span className={cn("ident", !name && "font-medium")}>{row.course}</span>
    </>
  );
  const className = cn(ROW_LINK, "block truncate text-base");
  return (
    <ListRow
      as="li"
      className={BAND}
      secondary={
        name
          ? termLabel(row.termId)
          : `${termLabel(row.termId)} · Who taught you?`
      }
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
          name === null
            ? write
              ? `Review ${row.course}: pick who taught you`
              : `Reviews and grades for ${row.course}`
            : write
              ? `Review ${name} in ${row.course}`
              : `${name}'s reviews in ${row.course}`
        }
      >
        {name && row.id ? (
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
            search={write && name ? { write: name } : {}}
            className={className}
          >
            {words}
          </Link>
        )}
      </WithTooltip>
    </ListRow>
  );
}
