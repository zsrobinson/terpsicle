import { cn } from "cn";
import type * as React from "react";

/** A neutral loading/empty bar. Decorative: hidden from assistive tech. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("rounded bg-hover", className)}
      {...props}
    />
  );
}

// Loading is a skeleton in the shape of what's coming, never a spinner in
// the middle of a page (docs/COHESION.md §3, Phase 2): a list's rows, or a
// page's header over its rows. The bars vary in width, so they read as text.
const WIDTHS = [0.62, 0.5, 0.7, 0.56, 0.66, 0.45];

/**
 * Rows loading, in `ListRow`'s shape: a dot, a line and a shorter second
 * line, a value at the right, hairlines between. It's the one element a
 * screen reader hears: "Loading" or what's loading.
 */
function RowSkeleton({
  rows = 3,
  label = "Loading",
  inset = true,
  className,
}: {
  rows?: number;
  /** What's loading, for screen readers ("Loading your deadlines"). */
  label?: string;
  /** `px-4`, as in a panel; `false` for rows flush with a page's column. */
  inset?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      data-slot="row-skeleton"
      className={cn("flex flex-col", className)}
    >
      {Array.from({ length: rows }, (_, i) => (
        <div
          // Rows never reorder.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          key={i}
          className={cn(
            "flex items-start gap-3 border-hairline border-b py-2 last:border-b-0",
            inset && "px-4",
          )}
        >
          <Skeleton className="mt-1 size-2 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
            <Skeleton
              className="h-3"
              style={{ width: `${(WIDTHS[i % WIDTHS.length] ?? 0.6) * 100}%` }}
            />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
          <Skeleton className="mt-0.5 h-3 w-12 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** A page loading: its title and status line over a list of rows. */
function PageSkeleton({
  rows = 4,
  label = "Loading",
  className,
}: {
  rows?: number;
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      data-slot="page-skeleton"
      className={cn("flex flex-col gap-4", className)}
    >
      <div className="flex flex-col gap-2 border-hairline border-b pb-3">
        <Skeleton className="h-4.5 w-48" />
        <Skeleton className="h-3 w-32" />
      </div>
      {/* One status for the page; the rows inside stay quiet. */}
      <div aria-hidden="true">
        <RowSkeleton rows={rows} inset={false} />
      </div>
    </div>
  );
}

export { PageSkeleton, RowSkeleton, Skeleton };
