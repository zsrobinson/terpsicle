import { cn } from "cn";
import { ArrowUpRight } from "lucide-react";
import type { ComponentProps } from "react";

// A way out of Terpsicle (docs/decisions.md, "Reviews link out to
// PlanetTerp"): every link that leaves for another site opens it in a new
// tab and wears this arrow, so a product's mark beside it never promises a
// Terpsicle page.

/** What a link to another site carries: a new tab, with no handle back. */
export const OUTSIDE_TAB = {
  target: "_blank",
  rel: "noopener noreferrer",
} as const;

/** The small arrow after a way out's words, or on a mark's corner. */
export function OutsideArrow({ className }: { className?: string }) {
  return (
    <ArrowUpRight
      aria-hidden="true"
      data-outside-arrow=""
      // Sized by class: an icon in a button or menu item keeps its own size.
      className={cn("size-3 shrink-0", className)}
    />
  );
}

/**
 * A link to another site: its words, then the arrow, in a new tab. The host
 * gives it its look (`className`); the tooltip is the host's too.
 */
export function OutsideLink({
  children,
  className,
  ...props
}: Omit<ComponentProps<"a">, "target" | "rel"> & { href: string }) {
  return (
    <a
      {...props}
      {...OUTSIDE_TAB}
      className={cn("inline-flex items-center gap-0.5", className)}
    >
      {children}
      <OutsideArrow />
    </a>
  );
}
