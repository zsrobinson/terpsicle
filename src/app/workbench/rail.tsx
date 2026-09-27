import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { WithTooltip } from "~/ui/tooltip";

// A workbench's labeled rail (SPEC §2; docs/COHESION.md §4): its views, one
// button each, with anything else (Install) at the foot. Clicking the open
// view collapses the sidebar and any view reopens it; each product decides
// what a click does. The active state is a soft fill and a thin edge bar,
// no ring or shadow, kept light so the rail doesn't read like a chat app
// (DESIGN §5).

export function WorkbenchRail({
  label,
  children,
  footer,
}: {
  /** The navigation's name for a screen reader ("Sidebar tabs"). */
  label: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  // On a short screen (a phone on its side gets this layout) the views run
  // past the bottom: the rail scrolls, with no scrollbar eating its width.
  return (
    <div className="flex w-[62px] shrink-0 flex-col items-center overflow-y-auto border-hairline border-r bg-panel py-2 [scrollbar-width:none]">
      <nav aria-label={label} className="flex flex-col items-center gap-0.5">
        {children}
      </nav>
      <div className="mt-auto flex flex-col items-center gap-1">{footer}</div>
    </div>
  );
}

/** A rail button's tooltip: what a click on it will do. */
export function railHint(
  label: string,
  {
    current,
    open,
    drilled,
  }: { current: boolean; open: boolean; drilled: boolean },
): string {
  if (!current || !open) return label;
  if (drilled) return `Back to ${label}`;
  return `${label} (click again to hide the sidebar)`;
}

export function RailButton({
  icon: Icon,
  label,
  hint,
  shortcut,
  current,
  open,
  controls,
  onClick,
  onPreload,
  badge,
}: {
  icon: LucideIcon;
  label: string;
  /** The tooltip (`railHint`). */
  hint: string;
  shortcut?: string;
  /** The view on screen, or on screen once the sidebar opens. */
  current: boolean;
  /** Whether the sidebar shows. */
  open: boolean;
  /** The sidebar panel's id, while this view is in it. */
  controls: string;
  onClick: () => void;
  /** Loads the view's code on intent, so it's usually there by the click. */
  onPreload?: () => void;
  badge?: ReactNode;
}) {
  const selected = current && open;
  return (
    <WithTooltip label={hint} shortcut={shortcut} side="right">
      <button
        type="button"
        aria-pressed={selected}
        aria-controls={selected ? controls : undefined}
        onClick={onClick}
        onPointerEnter={onPreload}
        onFocus={onPreload}
        className={cn(
          "relative flex w-[54px] flex-col items-center gap-1 rounded-lg py-2 transition-colors",
          // Selected: the kit's one selected fill (accent-soft, as a selected
          // row or segment), and a 2px bar at the rail's edge, so a hovered
          // tab never reads as selected.
          selected
            ? "bg-accent-soft text-fg before:-left-1 before:absolute before:inset-y-3 before:w-0.5 before:rounded-full before:bg-fg"
            : "text-muted hover:bg-hover/50 hover:text-fg",
          current && !open && "text-fg",
        )}
      >
        <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
        <span className="font-medium text-2xs">{label}</span>
        {badge}
      </button>
    </WithTooltip>
  );
}

/**
 * A count on a rail or drawer tab (errors and warnings on Problems): red
 * only for errors. The bar says it in words; here it's a glance.
 */
export function CountBadge({
  count,
  tone,
  className,
}: {
  count: number;
  tone: "error" | "warn";
  className?: string;
}) {
  if (count === 0) return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "tnum absolute top-1 right-1.5 min-w-[15px] rounded-full px-1 text-center font-mono text-2xs text-bg leading-[15px]",
        tone === "error" ? "bg-error" : "bg-warn",
        className,
      )}
    >
      {count}
    </span>
  );
}
