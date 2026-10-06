import { type RefObject, useEffect, useRef } from "react";
import {
  burstConfetti,
  type ConfettiColor,
  type ConfettiSize,
  flashDone,
} from "./confetti";

// When a bar celebrates (docs/decisions.md, "Confetti when a check finishes
// the week"): the moment its count reaches its total by one more thing being
// done, out of the same total, for the same thing. Not when a page opens on
// a week that's already done, not when another week comes up done, and not
// when the total shrinks to meet what's done (a course hidden, a deadline
// gone). And once: after an Undo, checking it again doesn't send it again.
// Confetti waits for the fill to reach the end; under Reduce Motion the fill
// jumps and the row flashes at once.

/** The share of the fill's slide (`--dur-sheet`) to wait before bursting. */
const FILL_LEAD = 0.7;

/** What a bar shows, for telling whether it just finished. */
export interface BarCount {
  /** What the bar is for: a week, or a course in a week. */
  identity: string;
  done: number;
  total: number;
}

/** Whether going from `before` to `now` is one bar finishing by a check. */
export function justFinished(before: BarCount | null, now: BarCount): boolean {
  if (before === null) return false;
  if (before.identity !== now.identity || before.total !== now.total)
    return false;
  return now.total > 0 && now.done === now.total && before.done < now.done;
}

function reducedMotion(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** `--dur-sheet` in ms, the fill's slide. */
function fillDuration(): number {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue("--dur-sheet")
    .trim();
  const ms = Number.parseFloat(value);
  return Number.isFinite(ms) ? (value.endsWith("ms") ? ms : ms * 1000) : 450;
}

/**
 * Confetti from `bar` the moment it finishes (`justFinished`), once for each
 * `identity` while the bar is up: unchecking and checking again doesn't send
 * more. `quiet` holds it back, read at the moment it would fire: a course's
 * bar when the week's own bar has the confetti.
 */
export function useCelebrate(
  bar: RefObject<HTMLElement | null>,
  {
    identity,
    done,
    total,
    colors,
    size,
    quiet = false,
  }: BarCount & {
    colors: readonly ConfettiColor[];
    size: ConfettiSize;
    quiet?: boolean;
  },
): void {
  const last = useRef<BarCount | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Read when it fires, so a new array each render restarts nothing.
  const latest = useRef({ colors, size, quiet });
  latest.current = { colors, size, quiet };
  // What this bar has celebrated: a week, or a course's week.
  const celebrated = useRef(new Set<string>());

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    const now = { identity, done, total };
    const before = last.current;
    last.current = now;
    if (!justFinished(before, now)) {
      // Unchecked again before the fill got there: no confetti.
      if (done < total) clearTimeout(timer.current);
      return;
    }
    clearTimeout(timer.current);
    const fire = () => {
      const el = bar.current;
      const { colors, size, quiet } = latest.current;
      if (!el || quiet || celebrated.current.has(identity)) return;
      celebrated.current.add(identity);
      if (reducedMotion()) flashDone(el.parentElement ?? el);
      else burstConfetti(el, colors, size);
    };
    if (reducedMotion()) fire();
    else timer.current = setTimeout(fire, fillDuration() * FILL_LEAD);
  }, [identity, done, total, bar]);
}
