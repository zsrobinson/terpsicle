import { cn } from "cn";

// The one chip (docs/COHESION.md §6, "Selected states"): a small,
// square-cornered toggle for a filter, a preference or a preset. Selected is
// the kit's soft gray, as a segmented control's chosen segment and the
// selected row are, never the inverted fill (docs/decisions.md, "Base UI for
// every primitive, styled in Ink": "i do prefer our soft gray instead of
// the inverted color"). What a chip does is in its words and marks (a
// filter's funnel, a preference's "2×"), not in a second selected look.

/** A selected chip, or any toggle drawn as one (a block's days). */
export const CHIP_SELECTED =
  "border-hairline-strong bg-accent-soft text-fg hover:bg-hover";

/**
 * A chip that isn't. An open menu's or popover's trigger says
 * `aria-expanded` (a menu's says `data-popup-open` too) and lights up.
 */
export const CHIP_UNSELECTED =
  "border-hairline text-muted hover:bg-hover hover:text-fg data-popup-open:bg-hover data-popup-open:text-fg aria-expanded:bg-hover aria-expanded:text-fg";

/** A chip's look: 24px, square corners, selected or not. */
export const chipClass = (selected: boolean) =>
  cn(
    "flex h-6 shrink-0 items-center gap-px rounded-md border px-1 text-xs transition-colors",
    selected ? CHIP_SELECTED : CHIP_UNSELECTED,
  );
