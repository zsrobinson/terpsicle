import type { LocalId, Plan, SettingsDoc } from "~/core/schema";
import { sameJson, withPlan, withSettingsDoc } from "~/core/sync";
import type { Workspace } from "~/state/plan-ops";
import type { WorkspaceState } from "~/state/workspace-store";

// Changes that come from the account (plan sync, V2 §5.4), not from the
// person: a pulled doc, a conflict's result, the first sign-in's union. They
// aren't undoable, and undo must not bring back what they replaced, so each
// step of history gets the same change: a replaced plan's history is gone,
// and steps that only touched it disappear.

export interface RemoteChange {
  /** Plans the account replaced, added (at the end) or removed (`null`). */
  readonly plans?: readonly (readonly [LocalId, Plan | null])[];
  /** The settings doc: blocks, colors, travel and chat plans. */
  readonly settings?: SettingsDoc;
}

/** The change applied to one version of the workspace (a history step too). */
export function withRemoteChange<W extends Workspace>(
  w: W,
  change: RemoteChange,
): W {
  let plans = w.plans;
  for (const [id, plan] of change.plans ?? [])
    plans = withPlan(plans, id, plan);
  let { blocks, colors } = w;
  if (change.settings) {
    if (!sameJson(blocks, change.settings.blocks))
      blocks = change.settings.blocks;
    if (!sameJson(colors, change.settings.colors))
      colors = change.settings.colors;
  }
  if (plans === w.plans && blocks === w.blocks && colors === w.colors) return w;
  return { ...w, plans, blocks, colors };
}

function sameWorkspace(a: Workspace, b: Workspace): boolean {
  return (
    sameJson(a.plans, b.plans) &&
    sameJson(a.blocks, b.blocks) &&
    sameJson(a.colors, b.colors) &&
    sameJson(a.activePlanByTerm, b.activePlanByTerm)
  );
}

/**
 * A history stack (`past` or `future`, oldest first) with the change applied
 * to every step. `next` is the state that follows the stack's last step (the
 * workspace now, with the change applied). A step that no longer changes
 * anything, because all it did was replaced, is dropped.
 */
export function rebaseHistory<E extends { before: Workspace }>(
  entries: readonly E[],
  change: RemoteChange,
  next: Workspace,
): E[] {
  const mapped = entries.map((e) => ({
    ...e,
    before: withRemoteChange(e.before, change),
  }));
  return mapped.filter((e, i) => {
    const after = i + 1 < mapped.length ? mapped[i + 1]?.before : next;
    return after === undefined || !sameWorkspace(e.before, after);
  });
}

/**
 * The workspace store (`useWorkspace`), handed in by the scheduler: this
 * chunk loads lazily and imports none of the scheduler's modules.
 */
export interface WorkspaceStore {
  getState: () => WorkspaceState;
  setState: (partial: Partial<WorkspaceState>) => void;
  subscribe: (
    listener: (next: WorkspaceState, prev: WorkspaceState) => void,
  ) => () => void;
}

/**
 * Shows a change from the account in the workspace store: not undoable, no
 * toast, and undo never brings back what it replaced (`rebaseHistory`).
 */
export function applyRemoteChange(
  store: WorkspaceStore,
  change: RemoteChange,
): void {
  const state = store.getState();
  const current: Workspace = {
    plans: state.plans,
    blocks: state.blocks,
    colors: state.colors,
    activePlanByTerm: state.activePlanByTerm,
  };
  const workspace = withRemoteChange(current, change);
  const settings = change.settings
    ? withSettingsDoc(
        {
          plans: workspace.plans,
          blocks: workspace.blocks,
          colors: workspace.colors,
          travel: state.travel,
          chatPlans: state.chatPlans,
        },
        change.settings,
      )
    : { travel: state.travel, chatPlans: state.chatPlans };
  if (
    workspace === current &&
    settings.travel === state.travel &&
    settings.chatPlans === state.chatPlans
  )
    return;
  store.setState({
    ...workspace,
    travel: settings.travel,
    chatPlans: settings.chatPlans,
    past: rebaseHistory(state.past, change, workspace),
    future: rebaseHistory(state.future, change, workspace),
  });
}
