import {
  BlockSchema,
  CourseColorPrefSchema,
  DEFAULT_TRAVEL_SETTINGS,
  DEFAULT_UI_PREFS,
  PlanSchema,
  type SettingsRow,
  SettingsRowSchema,
  type UiPrefs,
} from "~/core/schema";
import { type TerpsicleDb, validRows } from "./db";
import { restorableTarget } from "./drill";
import { useGenerateDrafts } from "./generate-drafts";
import type { Workspace } from "./plan-ops";
import { uiPrefsOf, useUi } from "./ui-store";
import { useWorkspace } from "./workspace-store";

// Loads the stores from IndexedDB, then writes every change back. Writes are
// queued so they land in order; each store change writes only the rows that
// changed. The undo stack, hover state and search text aren't persisted
// (DATA.md §5).

/** Reads everything into the stores. Invalid rows are skipped, never fatal. */
export async function hydrate(db: TerpsicleDb): Promise<void> {
  const [plans, blocks, colors, settings] = await db.transaction(
    "r",
    [db.plans, db.blocks, db.courseColors, db.settings],
    () =>
      Promise.all([
        db.plans.toArray(),
        db.blocks.toArray(),
        db.courseColors.toArray(),
        db.settings.toArray(),
      ]),
  );
  const rows = validRows("settings", SettingsRowSchema, settings);
  const ui =
    rows.find((r) => r.key === "ui")?.value ??
    (DEFAULT_UI_PREFS satisfies UiPrefs);
  const travel =
    rows.find((r) => r.key === "travel")?.value ?? DEFAULT_TRAVEL_SETTINGS;
  const drafts = rows.find((r) => r.key === "generate")?.value ?? {};

  useWorkspace.setState({
    plans: validRows("plans", PlanSchema, plans),
    blocks: validRows("blocks", BlockSchema, blocks),
    colors: Object.fromEntries(
      validRows("courseColors", CourseColorPrefSchema, colors).map((c) => [
        c.courseCode,
        c.color,
      ]),
    ),
    activePlanByTerm: ui.activePlanByTerm,
    travel,
    hydrated: true,
    past: [],
    future: [],
  });
  useGenerateDrafts.setState({ drafts });
  useUi.setState({
    tab: ui.tab,
    sidebarOpen: ui.sidebarOpen,
    stack: ui.drill ? [ui.drill] : [],
    theme: ui.theme,
    lastTermId: ui.lastTermId,
    collapsedGroups: ui.collapsedGroups,
  });
}

/** Marks the stores loaded without storage (IndexedDB blocked or broken). */
export function hydrateEmpty(): void {
  useWorkspace.setState({ hydrated: true });
}

/** Rows to put and keys to delete between two versions of a table. */
export function diffById<T>(
  prev: readonly T[],
  next: readonly T[],
  key: (row: T) => string,
): { put: T[]; remove: string[] } {
  const before = new Map(prev.map((row) => [key(row), row]));
  const put = next.filter((row) => before.get(key(row)) !== row);
  const nextKeys = new Set(next.map(key));
  const remove = [...before.keys()].filter((k) => !nextKeys.has(k));
  return { put, remove };
}

function uiRow(): SettingsRow {
  const ui = useUi.getState();
  return {
    key: "ui",
    value: {
      ...uiPrefsOf(ui, restorableTarget(ui.stack.at(-1))),
      activePlanByTerm: Object.fromEntries(
        Object.entries(useWorkspace.getState().activePlanByTerm).filter(
          (entry): entry is [string, string] => entry[1] !== undefined,
        ),
      ),
    },
  };
}

export interface Persistence {
  stop: () => void;
  /** Resolves when every write queued so far has landed. */
  flushed: () => Promise<void>;
}

/**
 * Writes store changes to IndexedDB until stopped. `onError` hears about
 * failed writes (storage full or blocked).
 */
export function startPersisting(
  db: TerpsicleDb,
  onError: (error: unknown) => void = console.error,
): Persistence {
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = (write: () => Promise<unknown>) => {
    queue = queue.then(write).catch(onError);
  };

  let lastUi = JSON.stringify(uiRow());
  const writeUiIfChanged = () => {
    const row = uiRow();
    const text = JSON.stringify(row);
    if (text === lastUi) return;
    lastUi = text;
    enqueue(() => db.settings.put(row));
  };

  const stopWorkspace = useWorkspace.subscribe((next, prev) => {
    const w: Workspace = next;
    const p: Workspace = prev;
    if (w.plans !== p.plans) {
      const { put, remove } = diffById(p.plans, w.plans, (x) => x.id);
      enqueue(() =>
        db.transaction("rw", db.plans, async () => {
          if (put.length) await db.plans.bulkPut(put);
          if (remove.length) await db.plans.bulkDelete(remove);
        }),
      );
    }
    if (w.blocks !== p.blocks) {
      const { put, remove } = diffById(p.blocks, w.blocks, (x) => x.id);
      enqueue(() =>
        db.transaction("rw", db.blocks, async () => {
          if (put.length) await db.blocks.bulkPut(put);
          if (remove.length) await db.blocks.bulkDelete(remove);
        }),
      );
    }
    if (w.colors !== p.colors) {
      const rows = (colors: Workspace["colors"]) =>
        Object.entries(colors).flatMap(([courseCode, color]) =>
          color ? [{ courseCode, color }] : [],
        );
      const before = rows(p.colors);
      const after = rows(w.colors);
      const put = after.filter((row) => p.colors[row.courseCode] !== row.color);
      const remove = before
        .filter((row) => w.colors[row.courseCode] === undefined)
        .map((row) => row.courseCode);
      enqueue(() =>
        db.transaction("rw", db.courseColors, async () => {
          if (put.length) await db.courseColors.bulkPut(put);
          if (remove.length) await db.courseColors.bulkDelete(remove);
        }),
      );
    }
    if (next.travel !== prev.travel) {
      const travel = next.travel;
      enqueue(() => db.settings.put({ key: "travel", value: travel }));
    }
    if (w.activePlanByTerm !== p.activePlanByTerm) writeUiIfChanged();
  });
  const stopUi = useUi.subscribe(writeUiIfChanged);
  const stopDrafts = useGenerateDrafts.subscribe((next, prev) => {
    if (next.drafts === prev.drafts) return;
    const drafts = next.drafts;
    enqueue(() => db.settings.put({ key: "generate", value: drafts }));
  });

  return {
    stop: () => {
      stopWorkspace();
      stopUi();
      stopDrafts();
    },
    flushed: () => queue.then(() => undefined),
  };
}
