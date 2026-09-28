import {
  CountBadge,
  RailButton,
  railHint,
  WorkbenchRail,
} from "~/components/workbench/rail";
import { InstallAppButton } from "~/features/pwa/install-entry";
import { useProblemCounts } from "~/state/hooks";
import { useUi } from "~/state/ui-store";
import { clickRailTab } from "./actions";
import { preloadView } from "./schedule-nav";
import { SIDEBAR_PANEL_ID } from "./sidebar";
import { useSidebarStack } from "./sidebar-stack";
import { TABS } from "./tabs";

// The scheduler's rail (SPEC §2), on the workbench's. A tab is a route
// (/schedule/<tab>): clicking one navigates, and clicking the open one
// collapses the sidebar (clickRailTab).

export function Rail() {
  const { view } = useSidebarStack();
  const tab = view.tab;
  const open = useUi((s) => s.sidebarOpen);
  const drilled = view.drill !== null;
  return (
    <WorkbenchRail
      label="Sidebar tabs"
      footer={<InstallAppButton side="right" />}
    >
      {TABS.map((t) => (
        <RailButton
          key={t.id}
          icon={t.icon}
          label={t.label}
          hint={railHint(t.label, { current: t.id === tab, open, drilled })}
          shortcut={t.shortcut}
          current={t.id === tab}
          open={open}
          controls={SIDEBAR_PANEL_ID}
          onClick={() => clickRailTab(t.id)}
          // The router loads the tab's route chunk on intent, so it's
          // usually there by the click.
          onPreload={() => preloadView({ tab: t.id, drill: null })}
          badge={t.id === "problems" ? <ProblemBadge /> : null}
        />
      ))}
    </WorkbenchRail>
  );
}

/** Errors and warnings on the Problems tab; red only when something is an error. */
export function ProblemBadge({ className }: { className?: string }) {
  const counts = useProblemCounts();
  return (
    <CountBadge
      count={counts.error + counts.warning}
      tone={counts.error > 0 ? "error" : "warn"}
      className={className}
    />
  );
}
