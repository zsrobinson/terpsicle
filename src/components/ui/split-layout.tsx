import { cn } from "cn";
import type { ComponentProps, ReactNode } from "react";

// A page in two columns (owner, 2026-09-27, for Home: "a 2/3s layout with
// 2/3 to current stuff and 1/3 to future stuff"; 2026-09-29, for Reviews):
// the wide column for what the page is about, the narrow one for what goes
// with it. From `lg` only; narrower it's one column, the wide one first.
// Each column is a stack of `PageSection`s, and the first section of the
// narrow column keeps the rule every other section has once it sits under
// the wide one.

const FIRST_RULE = {
  page: "max-lg:[&>section:first-child]:border-t max-lg:[&>section:first-child]:pt-3",
  display:
    "max-lg:[&>section:first-child]:border-t max-lg:[&>section:first-child]:pt-6",
} as const;

export function SplitLayout({
  main,
  side,
  size = "page",
  mainProps,
  sideProps,
  className,
}: {
  /** The wide column: two thirds. */
  main: ReactNode;
  /** The narrow column: one third. */
  side: ReactNode;
  /** The sections' size, for the gaps and the rule over the narrow column. */
  size?: "page" | "display";
  /** `data-*` and the like, for the wide column. */
  mainProps?: ComponentProps<"div">;
  /** `data-*`, `aria-label`, for the narrow one. */
  sideProps?: ComponentProps<"div">;
  className?: string;
}) {
  const gap = size === "display" ? "gap-8" : "gap-6";
  return (
    <div
      data-slot="split-layout"
      className={cn(
        "grid grid-cols-1 gap-x-8 lg:grid-cols-3",
        size === "display" ? "gap-y-8 lg:gap-x-12" : "gap-y-6",
        className,
      )}
    >
      <div
        {...mainProps}
        className={cn(
          "flex min-w-0 flex-col lg:col-span-2",
          gap,
          mainProps?.className,
        )}
      >
        {main}
      </div>
      <div
        {...sideProps}
        className={cn(
          "flex min-w-0 flex-col",
          gap,
          FIRST_RULE[size],
          sideProps?.className,
        )}
      >
        {side}
      </div>
    </div>
  );
}
