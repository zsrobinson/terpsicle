import { cn } from "cn";
import type { ReactNode } from "react";
import type { MarkId } from "~/lib/brand/marks";
import { viewWords } from "~/lib/cross-link";
import { Mark } from "./mark";

// Integration icons (owner, 2026-09-29, app-wide; docs/DESIGN.md §7.9):
// wherever one product shows up in another, its mark does too, "just to
// make it obvious". This is the one way a mark sits beside words outside
// the family bar: the same size and place in a button, a link, a menu item
// or a heading. The host keeps its own look; the label only adds the mark.

/**
 * The mark's size in every integration: the family bar's tabs' size, and the
 * smallest at which a mark's 10-unit grid lands on whole pixels.
 */
export const INTEGRATION_MARK_SIZE = 20;

/**
 * A product's mark, then its words. Without words, it writes the product's
 * "View …" words ("View schedule"), which are written nowhere else.
 * `iconOnly` is the mark alone, for a control that names itself
 * (`aria-label`); the umbrella stands for Terpsicle itself (an admin row).
 *
 * Inline, not flex: in a sentence or a heading, the words keep the line's
 * baseline, and the mark centers on them (`align-middle`).
 */
export function IntegrationLabel({
  product,
  children,
  iconOnly = false,
  className,
}: {
  product: MarkId;
  children?: ReactNode;
  iconOnly?: boolean;
  className?: string;
}) {
  // `size-5` keeps a button's 16px icon rule off it.
  const mark = (
    <Mark
      id={product}
      size={INTEGRATION_MARK_SIZE}
      className={cn(
        "inline-block size-5 shrink-0 align-middle",
        iconOnly ? className : "mr-1.5",
      )}
    />
  );
  if (iconOnly) return mark;
  const words =
    children ?? (product === "umbrella" ? null : viewWords(product));
  return (
    <span data-integration={product} className={cn("inline", className)}>
      {mark}
      {words}
    </span>
  );
}
