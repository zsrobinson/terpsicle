import { createContext, type ReactNode, useContext } from "react";
import type { DrillEntry, DrillEntryOf, DrillKind } from "~/state/drill";

// A drill-in's route component reads the entry it shows from here, not from
// the router: the sidebar keeps views mounted under the top one (so Back
// finds them as they were), and those aren't the URL's any more.

const DrillEntryContext = createContext<DrillEntry | null>(null);

export function DrillEntryProvider({
  entry,
  children,
}: {
  entry: DrillEntry;
  children: ReactNode;
}) {
  return (
    <DrillEntryContext.Provider value={entry}>
      {children}
    </DrillEntryContext.Provider>
  );
}

/** The entry this drill-in view shows: `{ kind: "course", courseCode }`. */
export function useDrillEntry<K extends DrillKind>(kind: K): DrillEntryOf<K> {
  const entry = useContext(DrillEntryContext);
  if (entry?.kind !== kind)
    throw new Error(
      `Expected a ${kind} drill-in, got ${entry?.kind ?? "none"}`,
    );
  return entry as DrillEntryOf<K>;
}
