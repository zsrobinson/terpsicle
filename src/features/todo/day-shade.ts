import type { IsoDate } from "~/core/schema";
import { isWeekend } from "~/core/todo";

// How the week shades a day (the owner, 2026-09-29): a day's heading is
// never lighter than its body, always at least one gray step darker, and
// hovering to add a task tints the body at most half a step, so it never
// reaches the heading. On the Ink scale: none (paper), one step (`panel`),
// two (`hover`). Weekdays head one step over paper; the weekend heads two
// over one; today heads two over paper, marked in Todo's color. The
// design-tokens test checks every case in both themes.

export type DayKind = "weekday" | "weekend" | "today";

/** A fill: its token, how much of it, and the classes that draw it. */
export interface Shade {
  /** The CSS variable (`--panel`); `bg` is the page's paper. */
  token: "bg" | "panel" | "hover";
  /** Its share over what's under it, 1 for a solid fill. */
  alpha: number;
  className: string;
}

export interface DayShade {
  head: Shade;
  body: Shade;
  /** Over the body, where a click adds a task. */
  hover: Shade;
}

const PAPER: Shade = { token: "bg", alpha: 1, className: "" };
const ONE_STEP: Shade = { token: "panel", alpha: 1, className: "bg-panel" };
const TWO_STEPS: Shade = { token: "hover", alpha: 1, className: "bg-hover" };

export const DAY_SHADES: Record<DayKind, DayShade> = {
  weekday: {
    head: ONE_STEP,
    body: PAPER,
    hover: { token: "panel", alpha: 0.5, className: "hover:bg-panel/50" },
  },
  weekend: {
    head: TWO_STEPS,
    body: ONE_STEP,
    // Under half the way from one step to two: `/50` presses to the full
    // step (styles.css), which is the heading's.
    hover: { token: "hover", alpha: 0.4, className: "hover:bg-hover/40" },
  },
  today: {
    head: TWO_STEPS,
    body: PAPER,
    hover: { token: "panel", alpha: 0.5, className: "hover:bg-panel/50" },
  },
};

/** Today, the weekend, or any other day. */
export function dayKind(date: IsoDate, today: IsoDate): DayKind {
  return date === today ? "today" : isWeekend(date) ? "weekend" : "weekday";
}

export function dayShade(date: IsoDate, today: IsoDate): DayShade {
  return DAY_SHADES[dayKind(date, today)];
}
