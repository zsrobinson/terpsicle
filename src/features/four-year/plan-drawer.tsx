import type { ReactNode } from "react";
import { DrawerTab, DrawerTabs, WorkbenchDrawer } from "~/app/workbench/drawer";
import { usePlanNav } from "./model";
import { PlanSidebarContent } from "./plan-sidebar";
import { tapDrawerView } from "./view-nav";
import { PLAN_VIEWS, ProblemsBadge } from "./views";
import { planDrawerSnap, usePlanWorkbench } from "./workbench-store";

// Plan on a phone: its sidebar in the workbench's bottom drawer, with its
// views as the strip of tabs, as the scheduler's. Loaded on phones only.

export function PlanDrawer({ view }: { view: ReactNode }) {
  const snap = usePlanWorkbench((s) => s.drawerSnap);
  const setSnap = usePlanWorkbench((s) => s.setDrawerSnap);
  const nav = usePlanNav();
  const { tab } = nav.search;
  // What raises it on its own (a view or a course opened from elsewhere) is
  // the page's, which is there before this chunk (plan-page.tsx).
  return (
    <WorkbenchDrawer
      snap={snap}
      getSnap={planDrawerSnap}
      onSnap={setSnap}
      title="Sidebar"
      tabs={
        <DrawerTabs label="Plan views">
          {PLAN_VIEWS.map((v) => (
            <DrawerTab
              key={v.tab}
              icon={v.icon}
              label={v.label}
              shortcut={v.shortcut}
              selected={v.tab === tab}
              onClick={() => tapDrawerView(nav, v.tab)}
              badge={
                v.tab === "problems" ? (
                  <ProblemsBadge className="right-1" />
                ) : null
              }
            />
          ))}
        </DrawerTabs>
      }
    >
      <PlanSidebarContent view={view} compact />
    </WorkbenchDrawer>
  );
}
