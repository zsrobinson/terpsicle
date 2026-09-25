import { DAYS, type Day, type Minutes } from "../schema";

// Calendar grid extent (SPEC §3.3): hours fit the plan, never less than
// 8am–5pm; Saturday and Sunday columns appear only when something meets then.
// Overlapping items sit side by side in lanes (`packLanes`).

export const MIN_CALENDAR_START: Minutes = 8 * 60;
export const MIN_CALENDAR_END: Minutes = 17 * 60;

export type HourRange = {
  /** On the hour, minutes since midnight. */
  readonly start: Minutes;
  /** On the hour, minutes since midnight. */
  readonly end: Minutes;
};

/**
 * The hours the grid shows: at least 8am–5pm, grown out to whole hours so
 * every item fits.
 */
export function calendarHourRange(
  items: Iterable<{ start: number; end: number }>,
): HourRange {
  let start = MIN_CALENDAR_START;
  let end = MIN_CALENDAR_END;
  for (const item of items) {
    start = Math.min(start, Math.floor(item.start / 60) * 60);
    end = Math.max(end, Math.ceil(item.end / 60) * 60);
  }
  return { start, end: Math.min(end, 24 * 60) };
}

const WEEKDAYS: readonly Day[] = ["M", "Tu", "W", "Th", "F"];

/** Monday–Friday, plus Saturday and/or Sunday only when an item needs them. */
export function calendarDays(items: Iterable<{ day: Day }>): Day[] {
  let saturday = false;
  let sunday = false;
  for (const item of items) {
    if (item.day === "Sa") saturday = true;
    else if (item.day === "Su") sunday = true;
  }
  return DAYS.filter(
    (d) =>
      WEEKDAYS.includes(d) ||
      (d === "Sa" && saturday) ||
      (d === "Su" && sunday),
  );
}

/** An item placed in a side-by-side lane of its overlap cluster. */
export type Lane<T> = T & {
  /** 0-based column within its overlap cluster. */
  lane: number;
  /** Columns in its overlap cluster. */
  lanes: number;
};

/**
 * Side-by-side lanes for overlapping items (SPEC §3.3): items that overlap,
 * directly or through a chain, form a cluster, and each takes the first lane
 * free at its start. Every item in a cluster shares the cluster's lane count.
 */
export function packLanes<T extends { start: number; end: number }>(
  items: readonly T[],
): Lane<T>[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Lane<T>[] = [];
  let cluster: Lane<T>[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;
  const flush = () => {
    for (const item of cluster) item.lanes = laneEnds.length;
    cluster = [];
    laneEnds = [];
  };
  for (const item of sorted) {
    if (item.start >= clusterEnd) {
      flush();
      clusterEnd = Number.NEGATIVE_INFINITY;
    }
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.end);
    } else laneEnds[lane] = item.end;
    const placed = { ...item, lane, lanes: 1 };
    cluster.push(placed);
    out.push(placed);
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flush();
  return out;
}
