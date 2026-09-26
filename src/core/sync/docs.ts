import {
  type Block,
  type ChatPlans,
  type CourseCode,
  type CourseColor,
  type LocalId,
  type Plan,
  type PlanDoc,
  SETTINGS_DOC_ID,
  type SettingsDoc,
  type SyncDoc,
  type SyncDocKind,
  type TravelSettings,
} from "../schema";
import { sameJson } from "./equal";

// Mapping between the device's tables (Dexie, the source of truth on each
// device) and sync docs (V2 §5). A plan doc is the plan row itself; the
// settings doc gathers what no single plan owns: blocks are per term and
// shared by its plans, colors are global (DATA.md §5).

/** Names a doc on the device: `plan:<id>` or `settings`. */
export type DocKey = `plan:${LocalId}` | typeof SETTINGS_DOC_ID;

export const SETTINGS_DOC_KEY: DocKey = SETTINGS_DOC_ID;

export function planDocKey(id: LocalId): DocKey {
  return `plan:${id}`;
}

export function docKeyOf(doc: { kind: SyncDocKind; id: string }): DocKey {
  return doc.kind === "plan" ? planDocKey(doc.id) : SETTINGS_DOC_KEY;
}

export function parseDocKey(
  key: DocKey,
): { kind: "plan"; id: LocalId } | { kind: "settings" } {
  return key === SETTINGS_DOC_KEY
    ? { kind: "settings" }
    : { kind: "plan", id: key.slice("plan:".length) };
}

/** Everything on the device that syncs. The rest (UI prefs, drafts, caches) stays local. */
export interface SyncedTables {
  readonly plans: readonly Plan[];
  readonly blocks: readonly Block[];
  readonly colors: Readonly<Record<CourseCode, CourseColor>>;
  readonly travel: TravelSettings;
  readonly chatPlans: Readonly<ChatPlans>;
}

export function settingsDocOf(
  t: Pick<SyncedTables, "blocks" | "colors" | "travel" | "chatPlans">,
): SettingsDoc {
  return {
    blocks: [...t.blocks],
    colors: { ...t.colors },
    travel: t.travel,
    chatPlans: { ...t.chatPlans },
  };
}

/**
 * The tables with the settings doc's contents. Each table keeps its identity
 * when its contents didn't change, so persisting writes only what did.
 */
export function withSettingsDoc<T extends SyncedTables>(
  t: T,
  doc: SettingsDoc,
): T {
  const current = settingsDocOf(t);
  const blocks = sameJson(current.blocks, doc.blocks) ? t.blocks : doc.blocks;
  const colors = sameJson(current.colors, doc.colors) ? t.colors : doc.colors;
  const travel = sameJson(t.travel, doc.travel) ? t.travel : doc.travel;
  const chatPlans = sameJson(current.chatPlans, doc.chatPlans)
    ? t.chatPlans
    : doc.chatPlans;
  if (
    blocks === t.blocks &&
    colors === t.colors &&
    travel === t.travel &&
    chatPlans === t.chatPlans
  )
    return t;
  return { ...t, blocks, colors, travel, chatPlans };
}

/** What to push for a doc: the plan (null once it's deleted here) or the settings. */
export function docBody(
  t: SyncedTables,
  key: DocKey,
): PlanDoc | SettingsDoc | null {
  const parsed = parseDocKey(key);
  if (parsed.kind === "settings") return settingsDocOf(t);
  return t.plans.find((p) => p.id === parsed.id) ?? null;
}

/** The plans with one plan replaced, added (at the end) or removed (`null`). */
export function withPlan(
  plans: readonly Plan[],
  id: LocalId,
  plan: Plan | null,
): readonly Plan[] {
  const i = plans.findIndex((p) => p.id === id);
  const current = plans[i];
  if (current === undefined) return plan === null ? plans : [...plans, plan];
  if (plan === null) return plans.filter((p) => p.id !== id);
  if (sameJson(current, plan)) return plans;
  return plans.map((p, k) => (k === i ? plan : p));
}

/**
 * A doc from the server, applied as-is: it replaces the device's version (a
 * tombstone removes the plan). Only for docs with no unsaved local changes;
 * the others go through the conflict rules (`./conflict`).
 */
export function applyDoc<T extends SyncedTables>(t: T, doc: SyncDoc): T {
  if (doc.kind === "settings") return withSettingsDoc(t, doc.body);
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
  const keys: DocKey[] = [];
  const before = new Map(prev.plans.map((p) => [p.id, p]));
  const seen = new Set<LocalId>();
  for (const plan of next.plans) {
    seen.add(plan.id);
    const old = before.get(plan.id);
    if (old !== plan && !sameJson(old, plan)) keys.push(planDocKey(plan.id));
  }
  for (const id of before.keys()) if (!seen.has(id)) keys.push(planDocKey(id));
  const settingsChanged =
    (prev.blocks !== next.blocks ||
      prev.colors !== next.colors ||
      prev.travel !== next.travel ||
      prev.chatPlans !== next.chatPlans) &&
    !sameJson(settingsDocOf(prev), settingsDocOf(next));
  if (settingsChanged) keys.push(SETTINGS_DOC_KEY);
  return keys;
}
