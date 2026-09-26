import { cn } from "cn";
import { ChevronDown } from "lucide-react";
import { type ComponentProps, type ReactNode, useEffect, useRef } from "react";
import type { RailTab } from "~/core/schema";
import { useUi } from "~/state/ui-store";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";

// The anatomy every sidebar panel shares (docs/UX-REVIEW.md §2.3):
//
//   PanelHeader (48px, or the Back bar in a drill-in), outside the scroll
//   PanelBody: the one scroll area
//     SectionHeader "bar": sticky at top-0, "Sections  3 of 14 fit  …"
//       GroupHeader: sticky under the bar, collapsible ("▾ Grace Kowalczyk …")
//         ListRow …
//     SectionHeader "label": a quiet heading for forms ("Must have")
//   PanelFooter (optional): sticky at the bottom, the panel's primary action
//
// At most two sticky levels inside a PanelBody: a bar, then a group header.

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
        <h2 className="truncate font-semibold text-base">{title}</h2>
        {sub ? <div className="truncate text-muted text-sm">{sub}</div> : null}
      </div>
      {right}
    </div>
  );
}

/** At most two sticky levels inside a PanelBody: a bar, then a group header. */
const STICKY_LEVELS = 2;

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
      // The phone drawer measures this to pick a height that shows it.
      data-panel-body=""
      className={cn(
        "scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-y-contain",
        className,
      )}
      // A row focused while scrolling stops clear of the sticky Sections bar
      // and group header above it (two 36px levels), never under them
      // (WCAG 2.4.11).
      style={{
        scrollPaddingTop: STICKY_LEVELS * 36 + 4,
        scrollPaddingBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

/**
 * A section's heading inside a panel.
 * - `bar` (default): a 36px band with hairlines above and below, for lists;
 *   `sticky` pins it to the top of the PanelBody.
 * - `label`: a quiet heading with no lines, for forms and short groups.
 */
export function SectionHeader({
  title,
  count,
  right,
  variant = "bar",
  sticky = false,
  className,
}: {
  title: ReactNode;
  /** "3 of 14 fit", "12": muted and tabular. */
  count?: ReactNode;
  /** Filters, jump links, a freshness note. */
  right?: ReactNode;
  variant?: "bar" | "label";
  /** Bar only. */
  sticky?: boolean;
  className?: string;
}) {
  if (variant === "label")
    return (
      <div
        className={cn(
          "flex items-baseline justify-between gap-2 px-4 pt-4 pb-1.5 font-medium text-muted text-xs",
          className,
        )}
      >
        {/* A heading, so a screen reader can jump between a form's parts
            ("Courses", "Must have", "Rank by") like between panels. */}
        <span className="flex items-baseline gap-1.5">
          <h3 className="font-medium">{title}</h3>
          {count !== undefined ? (
            <span className="tnum font-normal">{count}</span>
          ) : null}
        </span>
        {right}
      </div>
    );
  return (
    <div
      className={cn(
        "flex h-9 shrink-0 items-center gap-2 whitespace-nowrap border-hairline border-y bg-bg px-4 text-sm",
        sticky && "sticky top-0 z-20",
        className,
      )}
    >
      <h3 className="font-medium">{title}</h3>
      {count !== undefined ? (
        <span className="tnum text-muted">{count}</span>
      ) : null}
      {right ? (
        <div className="ml-auto flex min-w-0 items-center gap-3">{right}</div>
      ) : null}
    </div>
  );
}

/**
 * A small section label ("Bookmarked"): `SectionHeader variant="label"`.
 * Kept so panels migrate on their own schedule.
 */
export function PanelLabel({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return <SectionHeader variant="label" title={children} right={right} />;
}

/**
 * The header of a collapsible group of rows (an instructor's sections). The
 * left part toggles; `right` holds its own controls (never inside the
 * toggle). `sticky` pins it under a sticky SectionHeader bar.
 */
export function GroupHeader({
  open,
  onToggle,
  toggleLabel,
  title,
  meta,
  right,
  sticky = false,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  /** The toggle's tooltip: "Hide Grace Kowalczyk's sections". */
  toggleLabel: string;
  title: ReactNode;
  /** Muted facts after the title: "★ 4.2 (61) · GPA 3.10". */
  meta?: ReactNode;
  right?: ReactNode;
  sticky?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-9 items-center gap-2 border-hairline border-b bg-panel px-4 text-sm",
        sticky && "sticky top-9 z-10",
        className,
      )}
    >
      <WithTooltip label={toggleLabel}>
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="-ml-1 flex h-full min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <ChevronDown
            size={13}
            aria-hidden="true"
            className={cn(
              "shrink-0 text-muted transition-transform duration-150",
              !open && "-rotate-90",
            )}
          />
          <span className="truncate font-medium">{title}</span>
          {meta ? (
            <span className="tnum shrink-0 text-muted">{meta}</span>
          ) : null}
        </button>
      </WithTooltip>
      {right ? (
        <div className="flex shrink-0 items-center gap-2 text-muted text-xs">
          {right}
        </div>
      ) : null}
    </div>
  );
}

/**
 * One row of any list (docs/UX-REVIEW.md §2.4), in four columns:
 * - `lead`: identity (a code, a dot, a checkbox), fixed width per list;
 * - `children`: what it is, a primary line then at most two secondary lines;
 * - `trail`: a status or value, right-aligned and tabular;
 * - `action`: one small button or a word, fixed width (`w-14`).
 * Hairlines between rows, never boxes around them. The rest of the props go
 * to the row element (pointer handlers, `data-*`, `aria-*`).
 */
export function ListRow({
  lead,
  children,
  trail,
  action,
  density = "regular",
  state,
  as: Row = "div",
  className,
  ...rest
}: Omit<ComponentProps<"div">, "children"> & {
  lead?: ReactNode;
  children: ReactNode;
  trail?: ReactNode;
  action?: ReactNode;
  /** `compact`: one line, 28px; for long lists. */
  density?: "regular" | "compact";
  /** `current` is the plan's own item; `previewed` is what the calendar shows. */
  state?: "current" | "previewed";
  /** `li` inside a `ul`. */
  as?: "div" | "li";
}) {
  return (
    <Row
      {...(rest as ComponentProps<"div"> & ComponentProps<"li">)}
      data-state={state}
      className={cn(
        // No hairline under the list's last row. A row wrapped in its own
        // <li> (for a context menu) is always its li's last child, so there
        // it's the li that decides.
        "flex items-center gap-3 border-hairline border-b px-4 transition-colors last:border-b-0 [li:not(:last-child)>&]:border-b",
        density === "compact" ? "min-h-7 py-1" : "py-2",
        state === "previewed"
          ? "bg-hover"
          : state === "current"
            ? "bg-accent-soft"
            : undefined,
        className,
      )}
    >
      {lead !== undefined ? <div className="shrink-0">{lead}</div> : null}
      <div className="min-w-0 flex-1">{children}</div>
      {trail !== undefined ? (
        <div className="tnum shrink-0 text-right text-sm">{trail}</div>
      ) : null}
      {action !== undefined ? (
        <div className="flex w-14 shrink-0 justify-center">{action}</div>
      ) : null}
    </Row>
  );
}

/** What a list says when it's empty: a line or two, and maybe one action. No illustrations. */
export function EmptyState({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-4 py-3 text-muted text-sm", className)}>
      <div>{children}</div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/**
 * The bottom of a panel, pinned while its body scrolls: the one place for
 * the panel's primary action ("Generate plans", "Save as new plan"). Put it
 * after the PanelBody, not inside it.
 */
export function PanelFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-2 border-hairline border-t bg-bg px-4 py-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** " · " between facts on one line, in a tertiary color. */
export function MetaSep() {
  // The spaces stay outside the hidden dot, so a screen reader still hears
  // two words ("FC01 Helena"), not one ("FC01Helena").
  return (
    <>
      {" "}
      <span aria-hidden="true" className="text-faint">
        ·
      </span>{" "}
    </>
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
