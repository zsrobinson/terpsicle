import { cn } from "cn";
import type { ReactNode } from "react";
import { SECTION_BAND } from "~/ui/list-row";
import { PageHeader } from "~/ui/page-header";
import { RowSkeleton } from "~/ui/skeleton";

// The row and the group bar are the kit's (src/components/ui/list-row.tsx),
// shared by every product; panels import them from here or from ~/ui.
export { GroupHeader, ListRow } from "~/ui/list-row";

// The anatomy every sidebar panel shares (docs/UX-REVIEW.md §2.3):
//
//   PanelHeader (48px, or the Back bar in a drill-in), outside the scroll
//   PanelBody: the one scroll area
//     SectionHeader: the band, sticky at top-0, "Sections  3 of 14 fit  …"
//       GroupHeader nested (~/ui): a lighter band, sticky under it,
//       collapsible ("▾ Grace Kowalczyk …")
//         ListRow (~/ui) …
//     SectionHeader: every section, forms too ("Filters"), the same band
//   PanelFooter (optional): sticky at the bottom, the panel's primary action
//
// The bands carry the hierarchy (docs/DESIGN.md §7.8): a section's is the
// darkest, a group's inside it lighter, rows the page. At most two sticky
// levels inside a PanelBody: a section, then a group.

/**
 * The 48px header at the top of a tab panel: a title, an optional muted line,
 * and actions. The page kit's `PageHeader` at panel size, under its old name.
 */
export function PanelHeader({
  title,
  sub,
  right,
}: {
  title: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
}) {
  return <PageHeader size="panel" title={title} status={sub} actions={right} />;
}

/** At most two sticky levels inside a PanelBody: a bar, then a group header. */
const STICKY_LEVELS = 2;

/** The scrolling part of a panel, under its header. */
export function PanelBody({
  focusable = false,
  labelledBy,
  className,
  children,
}: {
  /**
   * A stop for Tab, so the keyboard can scroll it: for a panel that may
   * have nothing focusable in it (GenEd with every category covered).
   */
  focusable?: boolean;
  /** The panel title's id: a focusable body says what it is when focused. */
  labelledBy?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      // The phone drawer measures this to pick a height that shows it.
      data-panel-body=""
      tabIndex={focusable ? 0 : undefined}
      {...(labelledBy
        ? { role: "group", "aria-labelledby": labelledBy }
        : undefined)}
      className={cn(
        "scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-y-contain",
        focusable &&
          "outline-none focus-visible:outline-2 focus-visible:outline-fg focus-visible:-outline-offset-2",
        className,
      )}
      // A row focused while scrolling stops clear of the sticky Sections bar
      // and group header above it (two bands), never under them
      // (WCAG 2.4.11).
      style={{
        scrollPaddingTop: `calc(${STICKY_LEVELS} * var(--band-height) + 4px)`,
        scrollPaddingBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

/**
 * A section's heading inside a panel: the kit's band (`SECTION_BAND`), the
 * same in every workbench product (docs/DESIGN.md §7.8), with the title,
 * a muted count and anything at its right. `sticky` pins it to the top of
 * the PanelBody; a `GroupHeader nested` goes under it.
 */
export function SectionHeader({
  title,
  count,
  right,
  sticky = false,
  level = 3,
  className,
}: {
  title: ReactNode;
  /** "3 of 14 fit", "12": muted and tabular. */
  count?: ReactNode;
  /** Filters, jump links, a freshness note. */
  right?: ReactNode;
  sticky?: boolean;
  /**
   * 3 under a panel's own h2 (the scheduler's sidebar); 2 where the panel's
   * sections sit with no heading above them (Todo's panels).
   */
  level?: 2 | 3;
  className?: string;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <div
      className={cn(
        SECTION_BAND,
        "whitespace-nowrap bg-band",
        sticky && "sticky top-0 z-20",
        className,
      )}
    >
      <Heading className="emph-heading">{title}</Heading>
      {count !== undefined ? <span className="emph-meta">{count}</span> : null}
      {right ? (
        <div className="ml-auto flex min-w-0 items-center gap-3">{right}</div>
      ) : null}
    </div>
  );
}

/**
 * A small section label ("Bookmarked"): the same band as `SectionHeader`.
 * Kept so panels migrate on their own schedule.
 */
export function PanelLabel({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return <SectionHeader title={children} right={right} />;
}

/**
 * What a list or panel says when it's empty or can't load: a line or two, and
 * maybe one action. No illustrations. A product's first visit is the kit's
 * `EmptyState` (src/components/ui/empty-state.tsx) instead.
 */
export function PanelNote({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("emph-secondary px-4 py-3 text-sm", className)}>
      <div>{children}</div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/**
 * The bottom of a panel, pinned while its body scrolls: the one place for
 * the panel's primary action ("Generate plans", "Add as Plan C"). Put it
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
 * What a tab shows until its feature registers a panel: its title over the
 * kit's row skeleton, with no copy about what's coming.
 */
export function PanelSkeleton({ title }: { title: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="panel-skeleton">
      <PanelHeader title={title} />
      <RowSkeleton label={`Loading ${title}`} />
    </div>
  );
}
