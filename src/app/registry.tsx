import {
  type ComponentType,
  createContext,
  type ReactNode,
  useContext,
} from "react";
import type { RailTab } from "~/core/schema";
import type { DrillEntry, DrillKind } from "~/state/drill";

// Features plug their sidebar panels and drill-in views into the shell here,
// without touching shell code. Each feature exports `panels` from
// `src/features/<feature>/panels.tsx`; the shell finds those files itself.
// How-to: src/app/README.md.

export type DrillEntryOf<K extends DrillKind> = Extract<
  DrillEntry,
  { kind: K }
>;

export interface DrillViewProps<K extends DrillKind> {
  entry: DrillEntryOf<K>;
}

export interface DrillView<K extends DrillKind> {
  component: ComponentType<DrillViewProps<K>>;
  /** The breadcrumb for this level: "CMSC351", "Connection". */
  crumb: (entry: DrillEntryOf<K>) => string;
  /** Set the crumb in Geist Mono (codes). */
  monoCrumb?: boolean;
}

export type DrillViews = { [K in DrillKind]?: DrillView<K> };

export interface PanelRegistration {
  /** The panel shown when a rail tab is open. */
  tabs?: Partial<Record<RailTab, ComponentType>>;
  /** Views that drill in over any tab. */
  drills?: DrillViews;
  /**
   * Components the shell mounts once, rendering nothing, for app-wide work a
   * feature owns: following a deep link, syncing seat alerts on startup.
   */
  effects?: readonly ComponentType[];
}

export interface PanelRegistry {
  tabs: Partial<Record<RailTab, ComponentType>>;
  drills: DrillViews;
  effects: readonly ComponentType[];
}

/** Types a feature's registration. */
export function definePanels(
  registration: PanelRegistration,
): PanelRegistration {
  return registration;
}

/** Merges registrations; a tab or drill kind registered twice is a bug, so it warns. */
export function createPanelRegistry(
  registrations: readonly PanelRegistration[],
): PanelRegistry {
  const registry: PanelRegistry = { tabs: {}, drills: {}, effects: [] };
  for (const r of registrations) {
    registry.effects = [...registry.effects, ...(r.effects ?? [])];
    for (const [tab, component] of Object.entries(r.tabs ?? {})) {
      if (tab in registry.tabs) console.warn(`Two panels for the ${tab} tab`);
      Object.assign(registry.tabs, { [tab]: component });
    }
    for (const [kind, view] of Object.entries(r.drills ?? {})) {
      if (kind in registry.drills) console.warn(`Two views for ${kind}`);
      Object.assign(registry.drills, { [kind]: view });
    }
  }
  return registry;
}

/** Looks up the view for an entry, keeping the entry's kind and view's props together. */
export function drillViewFor<K extends DrillKind>(
  registry: PanelRegistry,
  entry: DrillEntryOf<K>,
): DrillView<K> | undefined {
  return registry.drills[entry.kind as K] as DrillView<K> | undefined;
}

// Every feature's `panels.tsx`, found at build time.
const discovered = import.meta.glob<{ panels?: PanelRegistration }>(
  "/src/features/*/panels.tsx",
  { eager: true },
);

export const featureRegistry: PanelRegistry = createPanelRegistry(
  Object.values(discovered).flatMap((m) => (m.panels ? [m.panels] : [])),
);

const RegistryContext = createContext<PanelRegistry>(featureRegistry);

/** Tests (and stories) swap in their own panels. */
export function PanelRegistryProvider({
  registry,
  children,
}: {
  registry: PanelRegistry;
  children: ReactNode;
}) {
  return (
    <RegistryContext.Provider value={registry}>
      {children}
    </RegistryContext.Provider>
  );
}

export function usePanelRegistry(): PanelRegistry {
  return useContext(RegistryContext);
}

/** Mounts every feature's effects (see `PanelRegistration.effects`). */
export function FeatureEffects() {
  const { effects } = usePanelRegistry();
  return (
    <>
      {effects.map((Effect, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the list is fixed at build time
        <Effect key={i} />
      ))}
    </>
  );
}
