import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PenLine, X } from "lucide-react";
import { useMemo } from "react";
import { courseDept } from "~/core/catalog/plan-diff";
import { termLabel } from "~/core/catalog/terms";
import {
  courseSlug,
  dismissedToReview,
  type InstructorToReview,
  instructorsToReview,
  reviewedKey,
  withToReviewDismissed,
} from "~/core/reviews";
import {
  type InstructorSlug,
  type IsoDate,
  instructorNameKey,
  PLANETTERP_HOME,
  planetTerpCourseUrl,
  planetTerpUrl,
} from "~/core/schema";
import {
  saveSyncedPrefs,
  useAccountPrefsSettled,
  useSyncedPrefs,
} from "~/features/prefs/synced-prefs";
import { Button } from "~/ui/button";
import { ListRow } from "~/ui/list-row";
import { OUTSIDE_TAB, OutsideArrow } from "~/ui/outside-link";
import { undoToast } from "~/ui/toast";
import { WithTooltip } from "~/ui/tooltip";
import type { HomeLocal } from "./local";
import { planetTerpSlugsQuery, reviewedKeysQuery } from "./queries";
import { HomeSection, homeLinkClicked, ROW_LINK } from "./section";

// "Review your instructors" (owner, 2026-09-28: "encourage reviews of
// professors based on the information we know about the user like the
// courses they're signed up for"), the same list /reviews shows
// (`instructorsToReview`), from each term's main plan: the classes you
// took. Gone when there's nobody.
//
// While reviews live on PlanetTerp (docs/decisions.md, "Reviews link out
// to PlanetTerp"), it's the nudge that sends reviews there: each row opens
// that professor's PlanetTerp page (their course's, when PlanetTerp doesn't
// know them), and since we can't tell what you reviewed there, each row has
// its own Dismiss, with Undo. Otherwise the reviews you've written here drop
// out, and a row opens our review form.

/** Rows shown: the newest terms' first. */
const SHOWN = 3;

export function ReviewsSection({
  local,
  today,
  outside,
}: {
  local: HomeLocal;
  today: IsoDate;
  /** Reviews live on PlanetTerp: our pages are off. */
  outside: boolean;
}) {
  const reviewed = useReviewedKeys(outside);
  const dismissed = useDismissedRows(outside);
  const rows = useMemo(() => {
    const skip = outside ? dismissed : reviewed;
    if (skip === null) return null;
    // Each term's main plan, the one you took (V2 §5.5), not the drafts:
    // picked inside, the same way /reviews asks for it.
    return instructorsToReview(local.plans, today, skip, local.mainPlans).slice(
      0,
      SHOWN,
    );
  }, [local, today, reviewed, dismissed, outside]);

  // Where each row goes on PlanetTerp: read once there are rows.
  const people = useMemo(
    () =>
      outside && rows
        ? rows.map((r) => ({ dept: courseDept(r.course), name: r.name }))
        : [],
    [rows, outside],
  );
  const slugs =
    useQuery({ ...planetTerpSlugsQuery(people), enabled: people.length > 0 })
      .data ?? {};

  // Nothing to ask: no section at all, never an empty one.
  if (!rows || rows.length === 0) return null;
  return (
    <HomeSection
      product="reviews"
      title="Review your instructors"
      to="/reviews"
      tooltip={
        outside
          ? "Reviews on PlanetTerp. Opens in a new tab."
          : "Read and write reviews"
      }
      outside={
        outside ? { href: PLANETTERP_HOME, label: "PlanetTerp" } : undefined
      }
    >
      <ul aria-label="Instructors to review">
        {rows.map((r) =>
          outside ? (
            <OutsideRow
              key={reviewedKey(r.course, r.name)}
              r={r}
              slug={
                slugs[`${courseDept(r.course)}:${instructorNameKey(r.name)}`]
              }
            />
          ) : (
            <ReviewRow key={reviewedKey(r.course, r.name)} r={r} />
          ),
        )}
      </ul>
    </HomeSection>
  );
}

function RowName({ r }: { r: InstructorToReview }) {
  return (
    <>
      <span data-private="" className="font-medium">
        {r.name}
      </span>{" "}
      <span className="text-muted">in</span>{" "}
      <span className="ident">{r.course}</span>
    </>
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
          <RowName r={r} />
        </Link>
      </WithTooltip>
    </ListRow>
  );
}

/** One toast for these rows: closing another replaces the last one's Undo. */
const DISMISS_TOAST_ID = "home-to-review";

/** A row that opens their PlanetTerp page, with its own Dismiss. */
function OutsideRow({
  r,
  slug,
}: {
  r: InstructorToReview;
  /** Their PlanetTerp slug; their course's page until it's known, or if never. */
  slug: InstructorSlug | undefined;
}) {
  const key = reviewedKey(r.course, r.name);
  const dismiss = () => {
    void saveSyncedPrefs((p) => withToReviewDismissed(p, key, true));
    undoToast({
      id: DISMISS_TOAST_ID,
      message: `${r.name} is off your list`,
      tooltip: "Put them back",
      onUndo: () =>
        void saveSyncedPrefs((p) => withToReviewDismissed(p, key, false)),
    });
  };
  return (
    <ListRow
      as="li"
      className="relative px-0 hover:bg-hover"
      secondary={termLabel(r.termId)}
      trail={
        <span className="flex items-center gap-1 font-medium text-fg">
          <PenLine size={13} aria-hidden="true" />
          Review
          <OutsideArrow />
        </span>
      }
      action={
        <WithTooltip label={`Dismiss ${r.name} in ${r.course}`}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Dismiss ${r.name} in ${r.course}`}
            onClick={dismiss}
            // Above the row's link, which covers the row.
            className="relative z-10"
          >
            <X aria-hidden="true" />
          </Button>
        </WithTooltip>
      }
    >
      <WithTooltip label={`Review ${r.name} on PlanetTerp, in a new tab`}>
        <a
          href={slug ? planetTerpUrl(slug) : planetTerpCourseUrl(r.course)}
          {...OUTSIDE_TAB}
          className={ROW_LINK}
        >
          <RowName r={r} />
          <span className="sr-only"> on PlanetTerp</span>
        </a>
      </WithTooltip>
    </ListRow>
  );
}

/**
 * The reviews you've written here, as `reviewedKey`s; null while loading,
 * and offline: ask nothing rather than ask for ones already written. Not
 * asked while reviews live on PlanetTerp.
 */
function useReviewedKeys(outside: boolean): ReadonlySet<string> | null {
  return useQuery({ ...reviewedKeysQuery(), enabled: !outside }).data ?? null;
}

/** The rows you've closed; null until the account's prefs are read. */
function useDismissedRows(outside: boolean): ReadonlySet<string> | null {
  const prefs = useSyncedPrefs();
  const settled = useAccountPrefsSettled();
  if (!outside || prefs === null || !settled) return null;
  return dismissedToReview(prefs);
}
