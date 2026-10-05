import type { ComponentProps } from "react";
import { WorkbenchDrawer } from "~/components/workbench/drawer";
import { totalOf } from "~/core/todo";
import { DoneCount, ProgressBar, TodoSidebar, weekConfetti } from "./sidebar";
import { todoDrawerSnap, useTodoWorkbench } from "./workbench-store";

// Todo on a phone: the sidebar in the workbench's bottom drawer, as
// Schedule's and Plan's are. Todo has no views to put in its strip, so the
// strip is the week's progress, which reads at peek over the tab bar with
// ELMS's line under it. Loaded on phones only.

export function TodoDrawer(props: ComponentProps<typeof TodoSidebar>) {
  const snap = useTodoWorkbench((s) => s.drawerSnap);
  const setSnap = useTodoWorkbench((s) => s.setDrawerSnap);
  const total = totalOf(props.rows.filter((r) => !r.hidden));
  const title = props.thisWeek ? "This week" : "The week";
  return (
    <WorkbenchDrawer
      snap={snap}
      getSnap={todoDrawerSnap}
      onSnap={setSnap}
      title="Sidebar"
      tabs={
        <div className="flex shrink-0 flex-col justify-center gap-2 border-hairline border-b px-4 pt-1 pb-3">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="emph-heading">{title}</span>
            {total.total === 0 ? (
              <span className="emph-meta">Nothing due</span>
            ) : (
              // The strip's one line, as tall as its title: the drawer's
              // peek has no room to spare.
              <DoneCount progress={total} line="h-4" />
            )}
          </div>
          <ProgressBar
            progress={total}
            label={`${title}, every course`}
            confetti={{
              identity: props.weekFirst,
              colors: weekConfetti(props.rows),
              size: "large",
            }}
            className="h-2"
          />
        </div>
      }
    >
      <TodoSidebar {...props} inDrawer />
    </WorkbenchDrawer>
  );
}
