import {
  type Block,
  type CourseCode,
  type CourseColor,
  type FourYearSyncDoc,
  type LocalId,
  type MainPlans,
  type Plan,
  type PlanDoc,
  type PlanSyncDoc,
  SETTINGS_DOC_ID,
  type SettingsDoc,
  type SettingsSyncDoc,
  type SyncedPrefs,
  type TravelSettings,
} from "../schema";
import type { FourYearDoc } from "../schema/four-year";
import { sameJson } from "./equal";

// Mapping between the device's tables (Dexie, the source of truth on each
// device) and sync docs (V2 §5). A plan doc is the plan row itself; the
// settings doc gathers what no single plan owns: blocks are per term and
// shared by its plans, colors are global (DATA.md §5). A four-year doc is
// Terpsicle Plan's row in its own table (V3 §2.4).

/** Names a doc on the device: `plan:<id>`, `four-year:<id>` or `settings`. */
export type DocKey =
  | `plan:${LocalId}`
  | `four-year:${LocalId}`
  | typeof SETTINGS_DOC_ID;

export const SETTINGS_DOC_KEY: DocKey = SETTINGS_DOC_ID;

export function planDocKey(id: LocalId): DocKey {
  return `plan:${id}`;
}

export function fourYearDocKey(id: LocalId): DocKey {
  return `four-year:${id}`;
}

/**
 * A doc as the device uses it. The server's four-year body is only checked
 * loosely (`FourYearSyncBodySchema`, so the full schema stays out of every
 * page's first load); the engine checks it against `FourYearDocSchema`
 * before it gets here.
 */
export type DeviceFourYearSyncDoc = Omit<FourYearSyncDoc, "body"> & {
  readonly body: FourYearDoc | null;
};
export type DeviceSyncDoc =
  | PlanSyncDoc
  | SettingsSyncDoc
  | DeviceFourYearSyncDoc;
export type DocKind = DeviceSyncDoc["kind"];

export function docKeyOf(doc: { kind: DocKind; id: string }): DocKey {
  switch (doc.kind) {
    case "plan":
      return planDocKey(doc.id);
    case "four-year":
      return fourYearDocKey(doc.id);
    case "settings":
      return SETTINGS_DOC_KEY;
  }
}

export function parseDocKey(
  key: DocKey,
):
  | { kind: "plan"; id: LocalId }
  | { kind: "four-year"; id: LocalId }
  | { kind: "settings" } {
  if (key === SETTINGS_DOC_KEY) return { kind: "settings" };
  if (key.startsWith("four-year:"))
    return { kind: "four-year", id: key.slice("four-year:".length) };
  return { kind: "plan", id: key.slice("plan:".length) };
}

/** Everything on the device that syncs. The rest (UI prefs, drafts, caches) stays local. */
export interface SyncedTables {
  readonly plans: readonly Plan[];
  readonly blocks: readonly Block[];
  readonly colors: Readonly<Record<CourseCode, CourseColor>>;
  readonly travel: TravelSettings;
  readonly mainPlans: Readonly<MainPlans>;
  /** Terpsicle Plan's four-year docs (V3 §2.3), grades and all. */
  readonly fourYear: readonly FourYearDoc[];
  /**
   * The other products' prefs (AI features, Chat's room rules): the `prefs`
   * settings row, whole, with any key this build doesn't know. Schedule
   * never edits them, but its pushes carry them.
   */
  readonly prefs: Readonly<SyncedPrefs>;
}

/** The tables the settings doc is made of. */
export type SettingsTables = Pick<
  SyncedTables,
  "blocks" | "colors" | "travel" | "mainPlans" | "prefs"
>;

export function settingsDocOf(t: SettingsTables): SettingsDoc {
  return {
    blocks: [...t.blocks],
    colors: { ...t.colors },
    travel: t.travel,
    mainPlans: { ...t.mainPlans },
    // The same map under its old name, for builds from before main plans.
    chatPlans: { ...t.mainPlans },
    prefs: { ...t.prefs },
  };
}

/**
 * The tables with the settings doc's contents. Each table keeps its identity
 * when its contents didn't change, so persisting writes only what did.
 */
export function withSettingsDoc<T extends SettingsTables>(
  t: T,
  doc: SettingsDoc,
): T {
  const current = settingsDocOf(t);
  const blocks = sameJson(current.blocks, doc.blocks) ? t.blocks : doc.blocks;
  const colors = sameJson(current.colors, doc.colors) ? t.colors : doc.colors;
  const travel = sameJson(t.travel, doc.travel) ? t.travel : doc.travel;
  const mainPlans = sameJson(current.mainPlans, doc.mainPlans)
    ? t.mainPlans
    : doc.mainPlans;
  const prefs = sameJson(current.prefs, doc.prefs) ? t.prefs : doc.prefs;
  if (
    blocks === t.blocks &&
    colors === t.colors &&
    travel === t.travel &&
    mainPlans === t.mainPlans &&
    prefs === t.prefs
  )
    return t;
  return { ...t, blocks, colors, travel, mainPlans, prefs };
}

/**
 * What to push for a doc: the plan or four-year doc (null once it's deleted
 * here) or the settings.
 */
export function docBody(
  t: SyncedTables,
  key: DocKey,
): PlanDoc | SettingsDoc | FourYearDoc | null {
  const parsed = parseDocKey(key);
  if (parsed.kind === "settings") return settingsDocOf(t);
  if (parsed.kind === "four-year")
    return t.fourYear.find((d) => d.id === parsed.id) ?? null;
  return t.plans.find((p) => p.id === parsed.id) ?? null;
}

/** Rows with one row replaced, added (at the end) or removed (`null`). */
function withRow<T extends { id: LocalId }>(
  rows: readonly T[],
  id: LocalId,
  row: T | null,
): readonly T[] {
  const i = rows.findIndex((r) => r.id === id);
  const current = rows[i];
  if (current === undefined) return row === null ? rows : [...rows, row];
  if (row === null) return rows.filter((r) => r.id !== id);
  if (sameJson(current, row)) return rows;
  return rows.map((r, k) => (k === i ? row : r));
}

/** The plans with one plan replaced, added (at the end) or removed (`null`). */
export function withPlan(
  plans: readonly Plan[],
  id: LocalId,
  plan: Plan | null,
): readonly Plan[] {
  return withRow(plans, id, plan);
}

/** The four-year docs with one replaced, added (at the end) or removed (`null`). */
export function withFourYear(
  docs: readonly FourYearDoc[],
  id: LocalId,
  doc: FourYearDoc | null,
): readonly FourYearDoc[] {
  return withRow(docs, id, doc);
}

/**
 * A doc from the server, applied as-is: it replaces the device's version (a
 * tombstone removes the plan). Only for docs with no unsaved local changes;
 * the others go through the conflict rules (`./conflict`).
 */
export function applyDoc<T extends SyncedTables>(t: T, doc: DeviceSyncDoc): T {
  if (doc.kind === "settings") return withSettingsDoc(t, doc.body);
  if (doc.kind === "four-year") {
    const fourYear = withFourYear(t.fourYear, doc.id, doc.body);
    return fourYear === t.fourYear ? t : { ...t, fourYear };
  }
  const plans = withPlan(t.plans, doc.id, doc.body);
  return plans === t.plans ? t : { ...t, plans };
}

/**
 * Docs whose contents differ between two versions of the tables: what a
 * local edit made dirty. Only for the person's own edits; applying a server
 * doc doesn't make it dirty.
 */
export function changedDocKeys(
  prev: SyncedTables,
  next: SyncedTables,
): DocKey[] {
  const keys: DocKey[] = [
    ...changedRows(prev.plans, next.plans, planDocKey),
    ...changedRows(prev.fourYear, next.fourYear, fourYearDocKey),
  ];
  const settingsChanged =
    (prev.blocks !== next.blocks ||
      prev.colors !== next.colors ||
      prev.travel !== next.travel ||
      prev.mainPlans !== next.mainPlans ||
      prev.prefs !== next.prefs) &&
    !sameJson(settingsDocOf(prev), settingsDocOf(next));
  if (settingsChanged) keys.push(SETTINGS_DOC_KEY);
  return keys;
}

/** The four-year docs a change to Plan's list touched. */
export function changedFourYearKeys(
  prev: readonly FourYearDoc[],
  next: readonly FourYearDoc[],
): DocKey[] {
  return changedRows(prev, next, fourYearDocKey);
}

/** Keys of the rows added, changed or removed between two versions of a table. */
function changedRows<T extends { id: LocalId }>(
  prev: readonly T[],
  next: readonly T[],
  keyOf: (id: LocalId) => DocKey,
): DocKey[] {
  if (prev === next) return [];
  const keys: DocKey[] = [];
  const before = new Map(prev.map((r) => [r.id, r]));
  const seen = new Set<LocalId>();
  for (const row of next) {
    seen.add(row.id);
    const old = before.get(row.id);
    if (old !== row && !sameJson(old, row)) keys.push(keyOf(row.id));
  }
  for (const id of before.keys()) if (!seen.has(id)) keys.push(keyOf(id));
  return keys;
}
