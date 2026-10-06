import type { IsoDateTime, LocalId, SettingsDoc, TermId } from "../schema";
import type { DataExport, ExportTask } from "../schema/data-export";
import {
  type DeviceSyncDoc,
  type DocKey,
  firstSignInUnion,
  fourYearDocKey,
  planDocKey,
  SETTINGS_DOC_KEY,
  type SyncedTables,
  sameJson,
  settingsDocOf,
  withSettingsDoc,
} from "../sync";

// Adding a data file (docs/DATA.md §5.6): never replaces anything. It's the
// first sign-in's union (`firstSignInUnion`, V2 §5.4) with what's here as
// "the account" and the file as "this device": every plan and four-year
// plan here stays as it is; one in the file that isn't here is added
// (renamed with "(copy)" if its name is taken in its term); one that's
// here but different in the file is added as a copy; settings keep your
// value wherever both have one and add what only the file has.

/** A plan or four-year plan the file adds, as the preview names it. */
export interface AddedPlan {
  id: LocalId;
  name: string;
  termId: TermId;
}

export interface ImportPlan {
  /** What the device holds after adding the file. */
  tables: SyncedTables;
  added: {
    plans: AddedPlan[];
    fourYear: { id: LocalId; name: string }[];
  };
  /** In the file and already here, the same. */
  same: { plans: number; fourYear: number };
  /** Your settings before, and after the file's were added to them. */
  settingsBefore: SettingsDoc;
  settingsAfter: SettingsDoc;
  settingsChanged: boolean;
  /** Own tasks to add (signed in): the file's whose uid you don't have. */
  tasks: ExportTask[];
  /** The docs adding it changes, to mark for sync. */
  keys: DocKey[];
}

/** The file's synced tables, as a device would hold them. */
function tablesOf(file: DataExport): SyncedTables {
  return {
    plans: file.plans,
    fourYear: file.fourYear,
    blocks: file.settings.blocks,
    colors: file.settings.colors,
    travel: file.settings.travel,
    mainPlans: file.settings.mainPlans,
    prefs: file.settings.prefs,
  };
}

/** What's here, as the docs an account would hold. */
function docsOf(t: SyncedTables, now: IsoDateTime): DeviceSyncDoc[] {
  return [
    ...t.plans.map(
      (body): DeviceSyncDoc => ({
        kind: "plan",
        id: body.id,
        rev: 1,
        updatedAt: now,
        body,
      }),
    ),
    ...t.fourYear.map(
      (body): DeviceSyncDoc => ({
        kind: "four-year",
        id: body.id,
        rev: 1,
        updatedAt: now,
        body,
      }),
    ),
    {
      kind: "settings",
      id: "settings",
      rev: 1,
      updatedAt: now,
      body: settingsDocOf(t),
    },
  ];
}

/**
 * What adding `file` to what's here (`current`) would do, without doing it.
 * `taskUids`: the own tasks the account has, or null signed out (no tasks
 * are added to a browser).
 */
export function planImport(input: {
  current: SyncedTables;
  file: DataExport;
  taskUids: ReadonlySet<string> | null;
  newId: () => LocalId;
  now: IsoDateTime;
}): ImportPlan {
  const { current, file, now } = input;
  const union = firstSignInUnion({
    local: tablesOf(file),
    server: docsOf(current, now),
    cursor: 0,
    newId: input.newId,
    now,
  });
  const kept = new Set(current.plans.map((p) => p.id));
  const keptFourYear = new Set(current.fourYear.map((d) => d.id));
  // Everything in the result that wasn't here is what the file adds:
  // uploads (renamed or not) and copies alike.
  const plans = union.tables.plans.filter((p) => !kept.has(p.id));
  const fourYear = union.tables.fourYear.filter((d) => !keptFourYear.has(d.id));
  const settingsBefore = settingsDocOf(current);
  const settingsAfter = settingsDocOf(union.tables);
  const settingsChanged = !sameJson(settingsBefore, settingsAfter);
  const tasks =
    input.taskUids === null
      ? []
      : (file.account?.todo?.tasks ?? []).filter(
          (t) => !input.taskUids?.has(t.uid),
        );
  return {
    tables: union.tables,
    added: {
      plans: plans.map((p) => ({ id: p.id, name: p.name, termId: p.termId })),
      fourYear: fourYear.map((d) => ({ id: d.id, name: d.name })),
    },
    same: {
      plans:
        file.plans.length -
        union.uploaded.length -
        union.copies.length -
        union.skipped.length,
      fourYear:
        file.fourYear.length -
        union.fourYear.uploaded.length -
        union.fourYear.copies.length -
        union.fourYear.skipped.length,
    },
    settingsBefore,
    settingsAfter,
    settingsChanged,
    tasks,
    keys: [
      ...plans.map((p) => planDocKey(p.id)),
      ...fourYear.map((d) => fourYearDocKey(d.id)),
      ...(settingsChanged ? [SETTINGS_DOC_KEY] : []),
    ],
  };
}

/**
 * Undo: what the file added goes, and your settings come back as they
 * were, unless they've changed since (then they're left as they are).
 */
export function undoImport(
  current: SyncedTables,
  plan: ImportPlan,
): { tables: SyncedTables; keys: DocKey[] } {
  const plans = new Set(plan.added.plans.map((p) => p.id));
  const fourYear = new Set(plan.added.fourYear.map((d) => d.id));
  const restore =
    plan.settingsChanged &&
    sameJson(settingsDocOf(current), plan.settingsAfter);
  const without: SyncedTables = {
    ...current,
    plans: current.plans.filter((p) => !plans.has(p.id)),
    fourYear: current.fourYear.filter((d) => !fourYear.has(d.id)),
  };
  return {
    tables: restore ? withSettingsDoc(without, plan.settingsBefore) : without,
    keys: [
      ...[...plans].map(planDocKey),
      ...[...fourYear].map(fourYearDocKey),
      ...(restore ? [SETTINGS_DOC_KEY] : []),
    ],
  };
}

const count = (n: number, one: string, many: string) =>
  `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** "a, b and c". */
function listOf(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/** What adding the file does, in one sentence. */
export function importSummary(plan: ImportPlan): string {
  const parts = [
    plan.added.plans.length > 0 &&
      count(plan.added.plans.length, "plan", "plans"),
    plan.added.fourYear.length > 0 &&
      count(plan.added.fourYear.length, "four-year plan", "four-year plans"),
    plan.tasks.length > 0 && count(plan.tasks.length, "task", "tasks"),
  ].filter((p): p is string => typeof p === "string");
  if (parts.length === 0)
    return plan.settingsChanged
      ? "Adds the settings you don't have yet, like course colors and blocks."
      : "Everything in this file is already here.";
  return `Adds ${listOf(parts)}.`;
}
