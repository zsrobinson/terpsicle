import { cn } from "cn";
import { ChevronDown } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { WithTooltip } from "./tooltip";

// One list row for every product (docs/COHESION.md §3, Phase 2; UX-REVIEW
// §2.4): hairline-separated rows on one grid, never boxes around them.
//
//   lead · primary and secondary · trail (meta) · action
//
// `lead` is a dot, a checkbox, a code or nothing; the row's children are the
// primary line (the identity: a code in `ident`, a name), with `secondary`
// muted at 12px under it; `trail` is right-aligned tabular facts; `action` is
// one small button. Hover is `bg-hover` (the caller's, when the row does
// something), and it stays while the row's own menu or popover is open:
// `hover:bg-hover menu-open:bg-hover` (the variant is in styles.css). The
// selected row is `bg-accent-soft`, never a product tint.
// Groups get a `GroupHeader` band, never a card.

/**
 * The one section band of the workbench products' sidebars (Schedule, Chat,
 * Plan, Todo; docs/DESIGN.md §7.8): a tinted strip with a hairline above and
 * below, on every section, the first one too. The band carries the
 * hierarchy: a section's is `bg-panel`, a group inside it (the instructors
 * under Sections) a half step lighter, its rows the page. Its top hairline
 * sits over whatever rule is above it (`-mt-px`), so a band under a header
 * or a row never draws two. 30px, 44px on phones (`--band-height`).
 */
export const SECTION_BAND =
  "-mt-px flex h-(--band-height) shrink-0 items-center gap-2 border-hairline border-y px-4 text-sm";

/**
 * One row of any list. The rest of the props go to the row element (pointer
 * handlers, `data-*`, `aria-*`).
 */
export function ListRow({
  lead,
  children,
  secondary,
  trail,
  action,
  density = "regular",
  align = "center",
  state,
  as: Row = "div",
  className,
  ...rest
}: Omit<ComponentProps<"div">, "children"> & {
  lead?: ReactNode;
  /** The primary line, or the whole body when it's more than two lines. */
  children: ReactNode;
  /** The muted 12px line under the primary one. */
  secondary?: ReactNode;
  /** Status or facts, right-aligned and tabular (the kit's "meta"). */
  trail?: ReactNode;
  /** One small button or a word, in a fixed-width column (`w-14`). */
  action?: ReactNode;
  /** `compact`: one line, 28px; for long lists. */
  density?: "regular" | "compact";
  /** `start` for rows of two or more lines, so the columns share a top. */
  align?: "center" | "start";
  /**
   * `current` is the selected row (the plan's own section, the open room);
   * `previewed` is what the calendar shows while you look.
   */
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
        "flex gap-3 border-hairline border-b px-4 transition-colors last:border-b-0 [li:not(:last-child)>&]:border-b",
        align === "start" ? "items-start" : "items-center",
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
      <div className="min-w-0 flex-1">
        {children}
        {secondary !== undefined ? (
          <div className="emph-secondary mt-0.5 text-sm">{secondary}</div>
        ) : null}
      </div>
      {trail !== undefined ? (
        <div className="tnum shrink-0 text-right text-sm">{trail}</div>
      ) : null}
      {action !== undefined ? (
        <div className="flex w-14 shrink-0 justify-center">{action}</div>
      ) : null}
    </Row>
  );
}

/**
 * The tinted 30px bar over a group of rows (an instructor, a course, a day).
 * With `onToggle`, its left part collapses the group; `right` holds its own
 * controls (never inside the toggle). `sticky` pins it under a sticky
 * SectionHeader bar.
 */
export function GroupHeader({
  open,
  onToggle,
  toggleLabel,
  title,
  meta,
  right,
  sticky = false,
  headingLevel,
  nested = false,
  className,
}: {
  title: ReactNode;
  /** Muted facts after the title: "★ 4.2 (61) · GPA 3.10". */
  meta?: ReactNode;
  right?: ReactNode;
  sticky?: boolean;
  /** A plain group's heading level, when it heads a part of the page. */
  headingLevel?: 2 | 3 | 4;
  /**
   * A group inside a section (the instructors under a course's Sections):
   * a half step lighter than the section's band, a step darker than its
   * rows. Without it, the group is the section (Chat's courses, Plan's
   * GenEd groups).
   */
  nested?: boolean;
  className?: string;
} & (
  | {
      open: boolean;
      onToggle: () => void;
      /** The toggle's tooltip: "Hide Grace Kowalczyk's sections". */
      toggleLabel: string;
    }
  | { open?: never; onToggle?: never; toggleLabel?: never }
)) {
  const label = (
    <>
      <span className="emph-heading truncate">{title}</span>
      {/* The title keeps its room; the meta takes what's left and gives it
          up first (QA S8: "Farid Kinc…" beside a whole rating and GPA). */}
      {meta ? (
        <span className="emph-secondary tnum min-w-0 flex-1 truncate">
          {meta}
        </span>
      ) : null}
    </>
  );
  const Heading = headingLevel ? (`h${headingLevel}` as const) : "div";
  return (
    <div
      className={cn(
        SECTION_BAND,
        "text-muted",
        nested ? "bg-band-soft" : "bg-band",
        // Under a sticky section band.
        sticky && "sticky top-(--band-height) z-10",
        className,
      )}
    >
      {onToggle ? (
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
            {label}
          </button>
        </WithTooltip>
      ) : (
        <Heading className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
          {label}
        </Heading>
      )}
      {right ? (
        <div className="flex shrink-0 items-center gap-2 text-muted text-xs">
          {right}
        </div>
      ) : null}
    </div>
  );
}
