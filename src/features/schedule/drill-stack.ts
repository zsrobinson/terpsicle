import { type DrillEntry, sameDrillSubject } from "~/state/drill";

// Which drill-in views the sidebar keeps mounted, as the URL moves. Only the
// top one is the URL's; the ones under it stay mounted (hidden) so Back finds
// them as they were: scroll position, open disclosures, focus to return to.
// The router's history says how the URL moved; this says what that does to
// the mounted views. Pure, so it's tested on its own.

/**
 * Drill-in levels kept mounted under the top one. Past this, the oldest are
 * dropped (they reopen fresh).
 */
export const MOUNTED_DRILLS = 6;

/**
 * How the URL moved: `back` and `forward` through history (a lower or higher
 * history index), `push` a new entry, `replace` the current one, and `reset`
 * for a new tab or term, where the views over the old one don't apply.
 */
export type StackMove = "push" | "replace" | "back" | "forward" | "reset";

function mountable(stack: readonly DrillEntry[]): readonly DrillEntry[] {
  return stack.length > MOUNTED_DRILLS ? stack.slice(-MOUNTED_DRILLS) : stack;
}

/**
 * The mounted drill-in stack once the URL shows `target` (null: the tab's
 * own panel). Back returns to a level still mounted; Forward and a push
 * stack the view (a push to the level just under the top closes the top
 * one); a replace swaps the top. The same subject keeps its level, taking
 * the new entry (its details sub-tab).
 */
export function followStack(
  stack: readonly DrillEntry[],
  target: DrillEntry | null,
  move: StackMove,
): readonly DrillEntry[] {
  if (!target) return stack.length === 0 ? stack : [];
  if (move === "reset") return [target];
  const top = stack.at(-1);
  if (top && sameDrillSubject(top, target))
    return top === target || JSON.stringify(top) === JSON.stringify(target)
      ? stack
      : [...stack.slice(0, -1), target];
  const under = stack.at(-2);
  switch (move) {
    case "back":
      for (let i = stack.length - 2; i >= 0; i--) {
        const level = stack[i];
        if (level && sameDrillSubject(level, target))
          return stack.slice(0, i + 1);
      }
      return [target];
    case "push":
    case "forward":
      if (under && sameDrillSubject(under, target)) return stack.slice(0, -1);
      return mountable([...stack, target]);
    case "replace":
      return [...stack.slice(0, -1), target];
  }
}
