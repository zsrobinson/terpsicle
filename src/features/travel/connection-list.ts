import {
  type Connection,
  type ConnectionVerdict,
  DAYS,
  type Day,
  type TravelSettings,
} from "~/core/schema";

// How the Travel tab lists connections (docs/UX-REVIEW.md §4.6): the same
// walk on several days is one row ("Mon, Wed, Fri"), the ones that need a
// look come first, and the settings read as one line.

/** One row: the same walk on every day it happens. */
export type ConnectionGroup = {
  /** The first day's connection; its details open from the row. */
  readonly connection: Connection;
  readonly days: readonly Day[];
  /** Every day's connection id, to mark the row that's open. */
  readonly ids: readonly string[];
};

/** Most serious first, as in Problems. Missing route data is neutral. */
export const VERDICT_ORDER: readonly ConnectionVerdict[] = [
  "insufficient",
  "tight",
  "no-route",
  "unknown",
  "ok",
];

/** Same classes, same buildings, same times: the same walk. */
function walkKey(c: Connection): string {
  return [
    c.from.sectionKey,
    c.to.sectionKey,
    c.from.building,
    c.to.building,
    c.from.time,
    c.to.time,
    c.verdict,
  ].join("|");
}

/**
 * Merges the same walk across days, then sorts by verdict (most serious
 * first), first day, and time.
 */
export function groupConnections(
  connections: readonly Connection[],
): ConnectionGroup[] {
  const groups = new Map<string, Connection[]>();
  for (const c of connections) {
    const key = walkKey(c);
    const list = groups.get(key);
    if (list) list.push(c);
    else groups.set(key, [c]);
  }
  const dayIndex = (d: Day) => DAYS.indexOf(d);
  return [...groups.values()]
    .map((list) => {
      const sorted = [...list].sort(
        (a, b) => dayIndex(a.day) - dayIndex(b.day),
      );
      // The map keeps insertion order and every list has at least one entry.
      const first = sorted[0] as Connection;
      return {
        connection: first,
        days: sorted.map((c) => c.day),
        ids: sorted.map((c) => c.id),
      };
    })
    .sort(
      (a, b) =>
        VERDICT_ORDER.indexOf(a.connection.verdict) -
          VERDICT_ORDER.indexOf(b.connection.verdict) ||
        dayIndex(a.connection.day) - dayIndex(b.connection.day) ||
        a.connection.from.time - b.connection.from.time,
    );
}

/**
 * Breaks longer than this, with enough time, get no pill on the calendar
 * (docs/UX-REVIEW.md §4.3; the calendar's rule lives in core/travel's
 * `pill.ts`). The list keeps them, under their own heading, so every
 * connection is still somewhere.
 */
export const BACK_TO_BACK_MINUTES = 30;

/** A connection the calendar marks with a pill: a short break, or one that's tight or too short. */
export function isBackToBack(c: Connection): boolean {
  return (
    c.gapMinutes <= BACK_TO_BACK_MINUTES ||
    c.verdict === "tight" ||
    c.verdict === "insufficient"
  );
}

const PACE_WORDS = {
  slower: "Slower pace",
  typical: "Typical pace",
  faster: "Faster pace",
} as const;

/** "Typical pace · no extra time · standard routes". */
export function settingsSummary(travel: TravelSettings): string {
  return [
    PACE_WORDS[travel.pace],
    travel.extraMinutes === 0
      ? "no extra time"
      : `+${travel.extraMinutes} min a trip`,
    travel.accessible ? "accessible routes" : "standard routes",
  ].join(" · ");
}
