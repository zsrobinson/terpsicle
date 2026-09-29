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
// part and the narrow column starts beside it. Narrower, the order is the
// head, the narrow column, then the rest of the wide one: what goes with
// the page comes before the long read. `after` is the narrow column's end:
// under `side` on a wide screen, but after the whole wide column on a
// phone (an instructor's grades, after their reviews). One copy of each,
// in reading order; the grid only places them.

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
  return (
    <div
      data-slot="split-layout"
      className={cn(
        "grid grid-cols-1 gap-x-8 lg:grid-cols-3",
        size === "display" ? "gap-y-8" : "gap-y-6",
        // The head takes its own height; the rest of the wide column, what's
        // left. With `after`, a middle row takes whatever of the narrow
        // column's start outgrows the head, so `after` starts under it.
        top !== undefined &&
          (after !== undefined
            ? "lg:grid-rows-[auto_auto_1fr]"
            : "lg:grid-rows-[auto_1fr]"),
        className,
      )}
    >
      {top !== undefined ? (
        <div
          data-slot="split-layout-top"
          className={cn(
            "flex min-w-0 flex-col lg:col-span-2 lg:row-start-1",
            gap,
          )}
        >
          {top}
        </div>
      ) : null}
      {top !== undefined ? (
        <SideColumn size={size} gap={gap} props={sideProps} top>
          {side}
        </SideColumn>
      ) : null}
      <div
        {...mainProps}
        className={cn(
          "flex min-w-0 flex-col lg:col-span-2",
          top !== undefined && "lg:col-start-1 lg:row-start-2",
          after !== undefined && "lg:row-span-2",
          gap,
          mainProps?.className,
        )}
      >
        {main}
      </div>
      {top === undefined ? (
        <SideColumn size={size} gap={gap} props={sideProps}>
          {side}
        </SideColumn>
      ) : null}
      {top !== undefined && after !== undefined ? (
        <div
          data-slot="split-layout-after"
          className={cn(
            "flex min-w-0 flex-col lg:col-start-3 lg:row-start-3",
            gap,
          )}
        >
          {after}
        </div>
      ) : null}
    </div>
  );
}

function SideColumn({
  size,
  gap,
  props,
  top = false,
  children,
}: {
  size: "page" | "display";
  gap: string;
  props: ComponentProps<"div"> | undefined;
  /** Beside a `top`: from the first row through the last. */
  top?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      {...props}
      className={cn(
        "flex min-w-0 flex-col",
        top ? "lg:col-start-3 lg:row-span-2 lg:row-start-1" : FIRST_RULE[size],
        gap,
        props?.className,
      )}
    >
      {children}
    </div>
  );
}
