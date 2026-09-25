import { cn } from "cn";
import { type ReactNode, useEffect, useRef } from "react";
import type { RailTab } from "~/core/schema";
import { useUi } from "~/state/ui-store";
import { Skeleton } from "~/ui/skeleton";

// Building blocks for sidebar panels, so every feature's panel has the same
// header and scroll behavior as the reference prototype.

/**
 * Focuses an element when the shell asks this tab to (e.g. `/` focuses the
 * search box): `const ref = useFocusRequest<HTMLInputElement>("search")`.
 */
export function useFocusRequest<T extends HTMLElement>(tab: RailTab) {
  const ref = useRef<T>(null);
  const request = useUi((s) => s.focusRequest);
  useEffect(() => {
    if (request?.tab === tab) ref.current?.focus();
  }, [request, tab]);
  return ref;
}

/** The 48px header at the top of a tab panel: a title, an optional muted line, and actions. */
export function PanelHeader({
  title,
  sub,
  right,
}: {
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex min-h-12 shrink-0 items-center gap-2 border-hairline border-b px-4 py-2">
      <div className="min-w-0 flex-1">
        <h2 className="truncate font-semibold text-[13px]">{title}</h2>
        {sub ? (
          <div className="truncate text-[11.5px] text-muted">{sub}</div>
        ) : null}
      </div>
      {right}
    </div>
  );
}

/** The scrolling part of a panel, under its header. */
export function PanelBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("scroll-thin min-h-0 flex-1 overflow-y-auto", className)}
    >
      {children}
    </div>
  );
}

/** A small section label inside a panel ("Saved for later"). */
export function PanelLabel({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between px-4 pt-4 pb-1.5 font-medium text-[11px] text-muted">
      <span>{children}</span>
      {right}
    </div>
  );
}

/**
 * What a tab shows until its feature registers a panel: its title over a
 * neutral skeleton, with no copy about what's coming.
 */
export function PanelSkeleton({ title }: { title: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="panel-skeleton">
      <PanelHeader title={title} />
      <div className="flex flex-col">
        {[0.72, 0.58, 0.66].map((width) => (
          <div
            key={width}
            className="flex flex-col gap-2 border-hairline border-b px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <Skeleton className="size-2 rounded-full" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="ml-auto h-1.5 w-12 rounded-full" />
            </div>
            <Skeleton
              className="ml-4 h-3"
              style={{ width: `${width * 100}%` }}
            />
            <Skeleton className="ml-4 h-2.5 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
