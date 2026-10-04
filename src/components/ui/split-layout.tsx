import { cn } from "cn";
import type { ComponentProps, ReactNode } from "react";

// A page in two columns (owner, 2026-09-27, for Home: "a 2/3s layout with
// 2/3 to current stuff and 1/3 to future stuff"; 2026-09-29, for Reviews):
// the wide column for what the page is about, the narrow one for what goes
// with it. From `lg` only; narrower it's one column, the wide one first.
// Each column is a stack of `PageSection`s, and the first section of the
// narrow column keeps the rule every other section has once it sits under
// the wide one.
//
// With `top` (owner, 2026-09-29, Reviews: "having the 2/3 1/3 thing extend
// all the way to the top"), the page's head is the wide column's first
// part and the narrow column starts beside it. Each column flows on its
// own from the top (owner, 2026-10-04: "just have those two columns and
// things flowing naturally within them"), so nothing in one waits for the
// other. That replaces starting the grades level with the reviews
// (2026-09-30), which left a gap under the rating. On a phone the parts
// interleave: the head, the narrow column's start (`side`), the rest of
// the wide one (`main`), then the narrow column's end (`after`), so what
// goes with the page comes before the long read and an instructor's
// grades come after their reviews. The columns are boxes from `lg` and
// `display: contents` below it: one copy of each part, in the order a
// wide screen reads them.

const FIRST_RULE = {
  page: "max-lg:[&>section:first-child]:border-t max-lg:[&>section:first-child]:pt-3",
  display:
    "max-lg:[&>section:first-child]:border-t max-lg:[&>section:first-child]:pt-6",
} as const;

export function SplitLayout({
  top,
  main,
  side,
  after,
  size = "page",
  mainProps,
  sideProps,
  className,
}: {
  /** The wide column's head, beside the narrow column's start (above). */
  top?: ReactNode;
  /** The wide column: two thirds. */
  main: ReactNode;
  /** The narrow column: one third. */
  side: ReactNode;
  /** With `top`: the narrow column's end, after the wide column on a phone. */
  after?: ReactNode;
  /** The sections' size, for the gaps and the rule over the narrow column. */
  size?: "page" | "display";
  /** `data-*` and the like, for the wide column. */
  mainProps?: ComponentProps<"div">;
  /** `data-*`, `aria-label`, for the narrow one. */
  sideProps?: ComponentProps<"div">;
  className?: string;
}) {
  const gap = size === "display" ? "gap-8" : "gap-6";
  const grid = cn(
    "grid grid-cols-1 gap-x-8 lg:grid-cols-3",
    size === "display" ? "gap-y-8" : "gap-y-6",
    className,
  );

  if (top === undefined) {
    return (
      <div data-slot="split-layout" className={grid}>
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
            FIRST_RULE[size],
            gap,
            sideProps?.className,
          )}
        >
          {side}
        </div>
      </div>
    );
  }

  // A column from `lg`; below it, its parts are the grid's own items.
  const column = cn("max-lg:contents lg:flex lg:min-w-0 lg:flex-col", gap);
  const part = cn("flex min-w-0 flex-col", gap);
  return (
    <div data-slot="split-layout" className={grid}>
      <div
        {...mainProps}
        data-slot="split-layout-wide"
        className={cn(column, "lg:col-span-2", mainProps?.className)}
      >
        <div
          data-slot="split-layout-top"
          className={cn(part, "max-lg:order-1")}
        >
          {top}
        </div>
        <div
          data-slot="split-layout-main"
          className={cn(part, "max-lg:order-3")}
        >
          {main}
        </div>
      </div>
      <div
        {...sideProps}
        data-slot="split-layout-narrow"
        className={cn(column, "lg:col-start-3", sideProps?.className)}
      >
        <div
          data-slot="split-layout-side"
          className={cn(part, "max-lg:order-2")}
        >
          {side}
        </div>
        {after !== undefined ? (
          <div
            data-slot="split-layout-after"
            className={cn(part, "max-lg:order-4")}
          >
            {after}
          </div>
        ) : null}
      </div>
    </div>
  );
}
