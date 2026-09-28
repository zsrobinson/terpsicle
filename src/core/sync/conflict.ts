import { PLAN_NAME_MAX } from "../plans/naming";
import type {
  IsoDateTime,
  LocalId,
  Plan,
  SettingsDoc,
  SyncedPrefs,
} from "../schema";
import type { FourYearDoc } from "../schema/four-year";
import { withFourYear, withPlan } from "./docs";
import { sameJson } from "./equal";

// What happens when a save finds the server's `rev` moved (another device
// saved in between). Nothing is merged: the person sees both versions and
// loses neither (V2 §5.4).

const COPY_SUFFIX = / \(copy(?: \d+)?\)$/;

/**
 * "Plan A (copy)", then "Plan A (copy 2)", "Plan A (copy 3)", … the first
 * not taken. A copy of a copy counts on from the original name rather than
 * stacking suffixes, and the name is trimmed to fit the 60-character limit.
 */
export function conflictCopyName(
  name: string,
  taken: Iterable<string>,
): string {
  const names = new Set(taken);
  const root = name.replace(COPY_SUFFIX, "");
  for (let i = 1; ; i++) {
    const suffix = i === 1 ? " (copy)" : ` (copy ${i})`;
    const candidate =
      root.slice(0, PLAN_NAME_MAX - suffix.length).trimEnd() + suffix;
    if (!names.has(candidate)) return candidate;
  }
}

/**
 * Whether two versions of a plan hold the same work: term, name, courses and
 * the sections marked Registered. Tab order and timestamps don't count, so a
 * moved tab never makes a copy.
 */
export function samePlanContent(a: Plan, b: Plan): boolean {
  return (
    a.termId === b.termId &&
    a.name === b.name &&
    sameJson(a.courses, b.courses) &&
    sameJson(a.registered ?? [], b.registered ?? [])
  );
}

export type PlanConflict =
  /** The server's version replaces this device's (null: the plan is deleted). */
  | { kind: "take-server"; plan: Plan | null }
  /** This device's version stays and is saved again on top of the server's rev. */
  | { kind: "keep-local"; plan: Plan }
  /** The server's version stays as the plan; this device's becomes `copy`, a new plan. */
  | { kind: "keep-both"; plan: Plan; copy: Plan };

export interface PlanConflictInput {
  /** This device's current version; null when it was deleted here. */
  local: Plan | null;
  /** The server's current version; null for a tombstone. */
  server: Plan | null;
  /** This device's plans, for the copy's name and tab position. */
  plans: readonly Plan[];
  /** The id for the copy, if one is made. */
  copyId: LocalId;
  now: IsoDateTime;
}

/**
 * The conflict rule for a plan doc:
 * - both versions hold the same work: take the server's;
 * - one side deleted the plan and the other edited it: the edit wins;
 * - otherwise keep both: the server's stays, and this device's becomes a new
 *   plan named "<name> (copy)" at the end of the term's tabs.
 */
export function resolvePlanConflict(input: PlanConflictInput): PlanConflict {
  const { local, server } = input;
  if (local === null) return { kind: "take-server", plan: server };
  if (server === null) return { kind: "keep-local", plan: local };
  if (samePlanContent(local, server))
    return { kind: "take-server", plan: server };
  const others = withPlan(input.plans, server.id, server).filter(
    (p) => p.termId === local.termId,
  );
  const copy: Plan = {
    ...local,
    id: input.copyId,
    name: conflictCopyName(
      local.name,
      others.map((p) => p.name),
    ),
    order: nextOrder(others),
    createdAt: input.now,
    updatedAt: input.now,
  };
  return { kind: "keep-both", plan: server, copy };
}

/** One past the last tab's `order` among `plans` (0 when there are none). */
export function nextOrder(plans: readonly Pick<Plan, "order">[]): number {
  return plans.reduce((max, p) => Math.max(max, Math.floor(p.order) + 1), 0);
}

/** The device's plans once a conflict on plan `id` is resolved. */
export function plansAfterConflict(
  plans: readonly Plan[],
  id: LocalId,
  conflict: PlanConflict,
): readonly Plan[] {
  switch (conflict.kind) {
    case "take-server":
    case "keep-local":
      return withPlan(plans, id, conflict.plan);
    case "keep-both":
      return [...withPlan(plans, id, conflict.plan), conflict.copy];
  }
}

// ---------- four-year docs ----------

/**
 * Whether two versions of a four-year doc hold the same work: its name,
 * first semester, entries, grades and template. When it was made or last
 * changed doesn't count.
 */
export function sameFourYearContent(a: FourYearDoc, b: FourYearDoc): boolean {
  return (
    a.name === b.name &&
    a.firstTermId === b.firstTermId &&
    sameJson(a.entries, b.entries) &&
    sameJson(a.grades, b.grades) &&
    sameJson(a.template, b.template)
  );
}

/** A plan conflict's outcomes (`PlanConflict`), for a four-year doc. */
export type FourYearConflict =
  | { kind: "take-server"; doc: FourYearDoc | null }
  | { kind: "keep-local"; doc: FourYearDoc }
  | { kind: "keep-both"; doc: FourYearDoc; copy: FourYearDoc };

/**
 * The conflict rule for a four-year doc, the plans' rule (V3 §2.4): the same
 * work takes the server's, an edit beats a delete, and otherwise both are
 * kept: the server's stays, and this device's becomes a new doc named
 * "<name> (copy)" at the end of the list.
 */
export function resolveFourYearConflict(input: {
  /** This device's current version; null when it was deleted here. */
  local: FourYearDoc | null;
  /** The server's current version; null for a tombstone. */
  server: FourYearDoc | null;
  /** This device's four-year docs, for the copy's name. */
  docs: readonly FourYearDoc[];
  copyId: LocalId;
  now: IsoDateTime;
}): FourYearConflict {
  const { local, server } = input;
  if (local === null) return { kind: "take-server", doc: server };
  if (server === null) return { kind: "keep-local", doc: local };
  if (sameFourYearContent(local, server))
    return { kind: "take-server", doc: server };
  const others = withFourYear(input.docs, server.id, server);
  const copy: FourYearDoc = {
    ...local,
    id: input.copyId,
    name: conflictCopyName(
      local.name,
      others.map((d) => d.name),
    ),
    createdAt: input.now,
    updatedAt: input.now,
  };
  return { kind: "keep-both", doc: server, copy };
}

/** The device's four-year docs once a conflict on doc `id` is resolved. */
export function fourYearAfterConflict(
  docs: readonly FourYearDoc[],
  id: LocalId,
  conflict: FourYearConflict,
): readonly FourYearDoc[] {
  switch (conflict.kind) {
    case "take-server":
    case "keep-local":
      return withFourYear(docs, id, conflict.doc);
    case "keep-both":
      return [...withFourYear(docs, id, conflict.doc), conflict.copy];
  }
}

// ---------- the settings doc ----------

type Keyed<V> = ReadonlyMap<string, V>;

/**
 * One key's value after a conflict, given its value when this device last
 * saved (`base`), now on this device (`local`) and on the server. `undefined`
 * means the key is absent (deleted, or never there).
 */
function pick<V>(
  base: V | undefined,
  local: V | undefined,
  server: V | undefined,
): V | undefined {
  if (sameJson(local, base)) return server;
  // Deleted here but edited elsewhere: the edit wins.
  if (local === undefined && !sameJson(server, base)) return server;
  return local;
}

function mergeKeyed<V>(
  base: Keyed<V> | null,
  local: Keyed<V>,
  server: Keyed<V>,
): Map<string, V> {
  const out = new Map<string, V>();
  // Server keys first, in the server's order, then keys only this device has.
  for (const key of new Set([...server.keys(), ...local.keys()])) {
    const value =
      base === null
        ? (server.get(key) ?? local.get(key))
        : pick(base.get(key), local.get(key), server.get(key));
    if (value !== undefined) out.set(key, value);
  }
  return out;
}

function entries<V>(record: Readonly<Record<string, V>>): Map<string, V> {
  return new Map(Object.entries(record));
}

/**
 * The settings doc after a conflict. It can't be kept twice the way a plan
 * is, so it's settled per key (a block, a course's color, the travel
 * settings, a term's chat plan, a product's prefs): keys this device changed
 * since `base`, its last save, keep this device's value; every other key
 * takes the server's.
 * A key deleted on one side and edited on the other keeps the edit.
 *
 * With no `base` (the first sign-in), the server's value wins for keys both
 * have, and keys only this device has are kept: nothing is dropped.
 */
export function mergeSettings(input: {
  base: SettingsDoc | null;
  local: SettingsDoc;
  server: SettingsDoc;
}): SettingsDoc {
  const { base, local, server } = input;
  // A part only one side changed is taken whole, keeping its order.
  const settle = <T>(part: (doc: SettingsDoc) => T, merge: () => T): T => {
    if (base !== null) {
      if (sameJson(part(local), part(base))) return part(server);
      if (sameJson(part(server), part(base))) return part(local);
    }
    return merge();
  };
  const blocksById = (doc: SettingsDoc) =>
    new Map(doc.blocks.map((b) => [b.id, b]));
  const keyed = <V>(part: (doc: SettingsDoc) => Readonly<Record<string, V>>) =>
    Object.fromEntries(
      mergeKeyed(
        base && entries(part(base)),
        entries(part(local)),
        entries(part(server)),
      ),
    );
  return {
    blocks: settle(
      (d) => d.blocks,
      () => [
        ...mergeKeyed(
          base && blocksById(base),
          blocksById(local),
          blocksById(server),
        ).values(),
      ],
    ),
    colors: settle(
      (d) => d.colors,
      () => keyed((d) => d.colors),
    ),
    // Both sides changed the travel settings (or there's no base): this
    // device's changes win over a base, the server's without one.
    travel: settle(
      (d) => d.travel,
      () => (base === null ? server.travel : local.travel),
    ),
    chatPlans: settle(
      (d) => d.chatPlans,
      () => keyed((d) => d.chatPlans),
    ),
    // Each product's prefs are one key (`ai`, `chatRules`, and any this
    // build doesn't know), settled like a course's color.
    prefs: settle(
      (d) => d.prefs,
      // The values are the docs' own, already checked: only the record's
      // type is lost on the way through the Map.
      () => keyed<unknown>((d) => d.prefs) as SyncedPrefs,
    ),
  };
}
