import { cn } from "cn";
import { useProblemCounts } from "~/state/hooks";
import { useUi } from "~/state/ui-store";
import { WithTooltip } from "~/ui/tooltip";
import { clickRailTab } from "./actions";
import { SIDEBAR_PANEL_ID } from "./sidebar";
import { TABS, type Tab } from "./tabs";
import { ThemeToggle } from "./theme-toggle";

// The labeled rail (SPEC §2). Clicking the open tab collapses the sidebar;
// any tab reopens it. The active state is a soft fill and a thin edge bar, no
// ring or shadow, kept light so the rail doesn't read like a chat app
// (DESIGN §5).

export function Rail() {
  const tab = useUi((s) => s.tab);
  const open = useUi((s) => s.sidebarOpen);
  const drilled = useUi((s) => s.stack.length > 0);
  return (
    <div className="flex w-[62px] shrink-0 flex-col items-center border-hairline border-r bg-panel py-2">
      <nav
        aria-label="Sidebar tabs"
        className="flex flex-col items-center gap-0.5"
      >
        {TABS.map((t) => (
          <RailButton
            key={t.id}
            tab={t}
            current={t.id === tab}
            open={open}
            drilled={drilled}
          />
        ))}
      </nav>
      <div className="mt-auto">
        <ThemeToggle side="right" />
      </div>
    </div>
  );
}

function hint(tab: Tab, current: boolean, open: boolean, drilled: boolean) {
  if (!current || !open) return tab.label;
  if (drilled) return `Back to ${tab.label}`;
  return `${tab.label} (click again to hide the sidebar)`;
}

function RailButton({
  tab,
  current,
  open,
  drilled,
}: {
  tab: Tab;
  current: boolean;
  open: boolean;
  drilled: boolean;
}) {
  const Icon = tab.icon;
  const selected = current && open;
  return (
    <WithTooltip
      label={hint(tab, current, open, drilled)}
      shortcut={tab.shortcut}
      side="right"
    >
      <button
        type="button"
        aria-pressed={selected}
        aria-controls={selected ? SIDEBAR_PANEL_ID : undefined}
        onClick={() => clickRailTab(tab.id)}
        className={cn(
          "relative flex w-[54px] flex-col items-center gap-1 rounded-lg py-2 transition-colors",
          // Selected: a soft fill a step deeper than hover, and a 2px bar at
          // the rail's edge, so hovering another tab never looks selected.
          selected
            ? "bg-accent-soft text-fg before:-left-1 before:absolute before:inset-y-3 before:w-0.5 before:rounded-full before:bg-fg"
            : "text-muted hover:bg-hover hover:text-fg",
          current && !open && "text-fg",
        )}
      >
        <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
        <span className="font-medium text-2xs">{tab.label}</span>
        {tab.id === "problems" ? <ProblemBadge /> : null}
      </button>
    </WithTooltip>
  );
}

/** Errors and warnings on the Problems tab; red only when something is an error. */
export function ProblemBadge({ className }: { className?: string }) {
  const counts = useProblemCounts();
  const n = counts.error + counts.warning;
  if (n === 0) return null;
  return (
    // The top bar says it in words; here it's a glance.
    <span
      aria-hidden="true"
      className={cn(
        "tnum absolute top-1 right-1.5 min-w-[15px] rounded-full px-1 text-center font-mono text-2xs text-bg leading-[15px]",
        counts.error > 0 ? "bg-error" : "bg-warn",
        className,
      )}
    >
      {n}
    </span>
  );
}
