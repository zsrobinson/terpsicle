import type { LocalId, Plan, SettingsDoc, TermId } from "~/core/schema";
import type { FourYearDoc } from "~/core/schema/four-year";
import {
  isUntouchedPlan,
  sameJson,
  withPlan,
  withSettingsDoc,
} from "~/core/sync";
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
  /**
   * Four-year docs the same way (V3 §2.4). Only Plan's page shows them; the
   * scheduler leaves them to IndexedDB.
   */
  readonly fourYear?: readonly (readonly [LocalId, FourYearDoc | null])[];
  /** The settings doc: blocks, colors, travel, main plans and the prefs. */
  readonly settings?: SettingsDoc;
  /**
   * The account's plans arrived in these terms (a pull, the first sign-in),
   * so an untouched plan the app made there on its own goes (V2 §5.3). Sync
   * storage has already dropped the ones it held, and `known` is every plan
   * it holds: any other plan here is one the app made while the step ran,
   * whose write hadn't landed when the step read IndexedDB.
   */
  readonly arrived?: {
    readonly terms: readonly TermId[];
    readonly known: readonly LocalId[];
  };
}

/** The change applied to one version of the workspace (a history step too). */
export function withRemoteChange<W extends Workspace>(
  w: W,
  change: RemoteChange,
): W {
  let plans = w.plans;
  for (const [id, plan] of change.plans ?? [])
    plans = withPlan(plans, id, plan);
  let { blocks, colors, mainPlans } = w;
  if (change.settings) {
    if (!sameJson(blocks, change.settings.blocks))
      blocks = change.settings.blocks;
    if (!sameJson(colors, change.settings.colors))
      colors = change.settings.colors;
    if (!sameJson(mainPlans, change.settings.mainPlans))
      mainPlans = change.settings.mainPlans;
  }
  if (
    plans === w.plans &&
    blocks === w.blocks &&
    colors === w.colors &&
    mainPlans === w.mainPlans
  )
    return w;
  return { ...w, plans, blocks, colors, mainPlans };
}

/**
 * The plans the app made on its own that sync storage never saw, dropped
 * from the terms the account's plans arrived in (`RemoteChange.arrived`).
 * Only the workspace now: the app made them without an undo step.
 */
function withUnseenDefaultsDropped<W extends Workspace>(
  w: W,
  arrived: RemoteChange["arrived"],
): W {
  if (!arrived || arrived.terms.length === 0) return w;
  const terms = new Set(arrived.terms);
  const known = new Set(arrived.known);
  const plans = w.plans.filter(
    (p) => !terms.has(p.termId) || known.has(p.id) || !isUntouchedPlan(p),
  );
  return plans.length === w.plans.length ? w : { ...w, plans };
}

function sameWorkspace(a: Workspace, b: Workspace): boolean {
  return (
    sameJson(a.plans, b.plans) &&
    sameJson(a.blocks, b.blocks) &&
    sameJson(a.colors, b.colors) &&
    sameJson(a.activePlanByTerm, b.activePlanByTerm) &&
    sameJson(a.mainPlans, b.mainPlans)
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
    mainPlans: state.mainPlans,
  };
  const workspace = withUnseenDefaultsDropped(
    withRemoteChange(current, change),
    change.arrived,
  );
  const settings = change.settings
    ? withSettingsDoc(
        {
          plans: workspace.plans,
          blocks: workspace.blocks,
          colors: workspace.colors,
          travel: state.travel,
          mainPlans: workspace.mainPlans,
          // The store doesn't hold the prefs: the host shows them (boot.ts).
          prefs: change.settings.prefs,
        },
        change.settings,
      )
    : { travel: state.travel };
  if (workspace === current && settings.travel === state.travel) return;
  store.setState({
    ...workspace,
    travel: settings.travel,
    past: rebaseHistory(state.past, change, workspace),
    future: rebaseHistory(state.future, change, workspace),
  });
}
