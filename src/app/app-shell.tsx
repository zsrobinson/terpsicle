import { cn } from "cn";
import { useCallback, useEffect, useState } from "react";
import { WithTooltip } from "~/ui/tooltip";
import { CalendarSkeleton } from "./calendar-skeleton";
import { Logo } from "./logo";
import { TABS, type Tab, type TabId } from "./tabs";

// M0 placeholder for the layout in SPEC.md §2: top bar, labeled rail, one
// sidebar panel, and a calendar that fills the rest. M3 replaces the insides.

export function AppShell() {
  const [active, setActive] = useState<TabId>("courses");
  const [collapsed, setCollapsed] = useState(false);

  // Clicking the active tab again collapses the sidebar (SPEC.md §2).
  const select = (id: TabId) => {
    if (id === active && !collapsed) setCollapsed(true);
    else {
      setActive(id);
      setCollapsed(false);
    }
  };

  const open = useCallback((id: TabId) => {
    setActive(id);
    setCollapsed(false);
  }, []);
  useTabShortcuts(open);

  const tab = TABS.find((t) => t.id === active) ?? TABS[0];

  return (
    <div className="flex h-dvh flex-col bg-bg text-fg">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Sidebar tabs"
          className="hidden w-[60px] shrink-0 flex-col items-center gap-0.5 border-hairline border-r bg-panel py-2 md:flex"
        >
          {TABS.map((t) => (
            <RailButton
              key={t.id}
              tab={t}
              selected={t.id === active && !collapsed}
              onSelect={select}
            />
          ))}
        </nav>
        {!collapsed && tab ? <Sidebar title={tab.label} /> : null}
        <main className="min-w-0 flex-1">
          <CalendarSkeleton />
        </main>
      </div>
      <nav
        aria-label="Tabs"
        className="flex shrink-0 justify-around border-hairline border-t bg-panel px-1 py-1 md:hidden"
      >
        {TABS.map((t) => (
          <RailButton
            key={t.id}
            tab={t}
            selected={t.id === active}
            onSelect={open}
            compact
          />
        ))}
      </nav>
    </div>
  );
}

function TopBar() {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-hairline border-b px-3">
      <Logo />
      <span className="text-faint">/</span>
      <Placeholder className="h-4 w-24" />
      <span className="hidden text-faint sm:inline">/</span>
      <Placeholder className="hidden h-4 w-16 sm:block" />
    </header>
  );
}

function RailButton({
  tab,
  selected,
  onSelect,
  compact = false,
}: {
  tab: Tab;
  selected: boolean;
  onSelect: (id: TabId) => void;
  compact?: boolean;
}) {
  const Icon = tab.icon;
  return (
    <WithTooltip label={tab.label} shortcut={tab.shortcut} side="right">
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onSelect(tab.id)}
        className={cn(
          "flex flex-col items-center gap-1 rounded-lg py-2 text-muted transition-colors hover:bg-hover hover:text-fg",
          compact ? "min-w-0 flex-1 py-1.5" : "w-[52px]",
          selected && "bg-raised text-fg shadow-sm ring-1 ring-hairline",
        )}
      >
        <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
        <span className="font-medium text-[10px]">{tab.label}</span>
      </button>
    </WithTooltip>
  );
}

function Sidebar({ title }: { title: string }) {
  return (
    <aside className="hidden w-[360px] shrink-0 flex-col border-hairline border-r md:flex">
      <div className="flex min-h-12 items-center border-hairline border-b px-4">
        <h2 className="font-semibold text-[13px]">{title}</h2>
      </div>
      <div className="flex flex-col gap-3 p-4" aria-hidden="true">
        <Placeholder className="h-4 w-3/4" />
        <Placeholder className="h-4 w-1/2" />
        <Placeholder className="h-4 w-2/3" />
      </div>
    </aside>
  );
}

function Placeholder({ className }: { className?: string }) {
  return <div className={cn("rounded bg-hover", className)} />;
}

/** `1`–`7` open the matching tab, unless the person is typing. */
function useTabShortcuts(open: (id: TabId) => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      )
        return;
      const tab = TABS.find((t) => t.shortcut === event.key);
      if (tab) open(tab.id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);
}
