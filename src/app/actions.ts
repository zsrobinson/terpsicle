import type {
  LocalId,
  PlanCourse,
  RailTab,
  Term,
  TermId,
  Theme,
} from "~/core/schema";
import { newLocalId, nowIso } from "~/state/ids";
import { useUi } from "~/state/ui-store";
import { useWorkspace } from "~/state/workspace-store";
import { track } from "./analytics";
import { applyThemePreference } from "./theme";

// What people do in the shell, as plain functions: each changes the stores
// and records the analytics event that goes with it, so every entry point
// (menus, shortcuts, the first-visit guide) counts the same way.

export function createEmptyPlan(termId: TermId): void {
  useWorkspace
    .getState()
    .dispatch(
      { type: "plan/create", id: newLocalId(), termId, now: nowIso() },
      "Created an empty plan",
    );
  track("plan_created", { source: "empty" });
}

/**
 * A new plan with the given courses, e.g. Generate's "Save as new plan".
 * Opens it and returns its id; undoable like any other change.
 */
export function createPlanFrom(
  termId: TermId,
  courses: readonly PlanCourse[],
  { source, name }: { source: "generate"; name?: string },
): LocalId {
  const id = newLocalId();
  useWorkspace
    .getState()
    .dispatch(
      { type: "plan/create", id, termId, name, courses, now: nowIso() },
      name ? `Saved ${name}` : "Saved a new plan",
    );
  track("plan_created", { source });
  return id;
}

export function copyPlan(planId: LocalId): void {
  const source = useWorkspace.getState().plans.find((p) => p.id === planId);
  if (!source) return;
  useWorkspace.getState().dispatch(
    {
      type: "plan/duplicate",
      id: planId,
      newId: newLocalId(),
      now: nowIso(),
    },
    `Copied ${source.name}`,
  );
  track("plan_created", { source: "copy" });
}

export function renamePlan(
  planId: LocalId,
  name: string,
  via: "menu" | "double-click",
): void {
  const before = useWorkspace.getState().plans.find((p) => p.id === planId);
  if (!before) return;
  useWorkspace
    .getState()
    .dispatch(
      { type: "plan/rename", id: planId, name, now: nowIso() },
      `Renamed ${before.name}`,
      { toast: false },
    );
  const after = useWorkspace.getState().plans.find((p) => p.id === planId);
  if (after && after.name !== before.name) track("plan_renamed", { via });
}

export function deletePlan(planId: LocalId): void {
  const plan = useWorkspace.getState().plans.find((p) => p.id === planId);
  if (!plan) return;
  useWorkspace.getState().dispatch(
    {
      type: "plan/delete",
      id: planId,
      replacementId: newLocalId(),
      now: nowIso(),
    },
    `Deleted ${plan.name}`,
  );
  track("plan_deleted", {});
}

export function openPlan(termId: TermId, planId: LocalId): void {
  useWorkspace.getState().activatePlan(termId, planId);
}

/** `+` → Generate plans…: generating makes new plans, so it has its own tab (SPEC §3.9). */
export function openGenerate(): void {
  openTab("generate", "click");
}

export function openTab(tab: RailTab, via: "click" | "shortcut"): void {
  const ui = useUi.getState();
  if (ui.tab === tab && ui.sidebarOpen && ui.stack.length === 0) return;
  ui.openTab(tab);
  track("tab_opened", { tab, via });
}

/** A click on a rail tab: opens, goes back to the tab's root, or collapses (SPEC §2). */
export function clickRailTab(tab: RailTab): void {
  const result = useUi.getState().clickTab(tab);
  if (result === "collapsed") track("sidebar_collapsed", {});
  else if (result === "opened") track("tab_opened", { tab, via: "click" });
}

export function switchTerm(term: Term): void {
  const ui = useUi.getState();
  if (ui.lastTermId === term.id) return;
  ui.setLastTermId(term.id);
  track("term_switched", { status: term.status });
}

export function setTheme(theme: Theme): void {
  useUi.getState().setTheme(theme);
  applyThemePreference(theme);
  track("theme_changed", { theme });
}

export function undo(via: "shortcut" | "toast"): boolean {
  const done = useWorkspace.getState().undo();
  if (done) track("undo_used", { via });
  return done;
}

export function redo(): boolean {
  return useWorkspace.getState().redo();
}
