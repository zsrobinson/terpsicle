import type { Minutes } from "~/core/schema";

// Moving around the calendar with arrow keys (docs/ACCESSIBILITY.md,
// "The calendar"). The calendar is one Tab stop, a roving tabindex over
// everything on it: classes, blocks, ghosts and travel pills. ← and → go to
// the nearest thing in time on the previous or next day that has anything;
// ↑ and ↓ go through a day in time order; Home and End jump to the day's
// first and last.
//
// Not an ARIA grid: the week isn't a table of cells. Things sit at any
// minute, overlap in lanes, and most slots are empty, so a grid would make a
// screen reader step through empty cells and switch it out of browse mode,
// where the labeled day groups already read well.

/** Something on the calendar that takes focus. */
export interface NavItem {
  key: string;
  /** Its day's column, from 0. */
  col: number;
  start: Minutes;
  /** Left to right among things that start together. */
  lane?: number;
}

export type NavMove = "up" | "down" | "left" | "right" | "home" | "end";

export const NAV_KEYS: Readonly<Record<string, NavMove>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Home: "home",
  End: "end",
};

function byTime(a: NavItem, b: NavItem): number {
  return a.start - b.start || (a.lane ?? 0) - (b.lane ?? 0);
}

/** A day's items in reading order: by start time, then left to right. */
export function dayOrder(items: readonly NavItem[], col: number): NavItem[] {
  return items.filter((i) => i.col === col).sort(byTime);
}

/**
 * Where a key moves focus from `from`, or null to stay put (the edge of a
 * day or the week: no wrapping, so a screen reader hears the end).
 */
export function moveFocus(
  items: readonly NavItem[],
  from: string,
  move: NavMove,
): string | null {
  const current = items.find((i) => i.key === from);
  if (!current) return null;
  const day = dayOrder(items, current.col);
  const at = day.findIndex((i) => i.key === from);
  switch (move) {
    case "up":
      return day[at - 1]?.key ?? null;
    case "down":
      return day[at + 1]?.key ?? null;
    case "home":
      return at > 0 ? (day[0]?.key ?? null) : null;
    case "end":
      return at < day.length - 1 ? (day.at(-1)?.key ?? null) : null;
    case "left":
    case "right": {
      const step = move === "left" ? -1 : 1;
      const cols = [...new Set(items.map((i) => i.col))].sort((a, b) => a - b);
      const next = cols
        .filter((c) => (step === 1 ? c > current.col : c < current.col))
        .sort((a, b) => (a - b) * step)[0];
      if (next === undefined) return null;
      return nearestInTime(dayOrder(items, next), current.start)?.key ?? null;
    }
  }
}

/** The item starting closest to `minute`; the earlier one on a tie. */
function nearestInTime(
  day: readonly NavItem[],
  minute: Minutes,
): NavItem | undefined {
  let best: NavItem | undefined;
  for (const item of day)
    if (!best || Math.abs(item.start - minute) < Math.abs(best.start - minute))
      best = item;
  return best;
}

/**
 * The one item Tab lands on: the last one focused while it's still there;
 * otherwise, while a course's sections show, that course's class nearest to
 * where focus was (a ghost switched to becomes one), or its first (its
 * options are an arrow away); otherwise the week's first item.
 */
export function tabStop(
  items: readonly NavItem[],
  remembered: string | null,
  preferred: readonly string[] = [],
  near: Pick<NavItem, "col" | "start"> | null = null,
): string | null {
  if (remembered && items.some((i) => i.key === remembered)) return remembered;
  const ordered = [...items].sort((a, b) => a.col - b.col || byTime(a, b));
  const wanted = ordered.filter((i) => preferred.includes(i.key));
  if (near)
    wanted.sort(
      (a, b) =>
        Math.abs(a.col - near.col) - Math.abs(b.col - near.col) ||
        Math.abs(a.start - near.start) - Math.abs(b.start - near.start),
    );
  return (wanted[0] ?? ordered[0])?.key ?? null;
}
