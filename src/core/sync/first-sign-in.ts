import { DEFAULT_FOUR_YEAR_NAME } from "../four-year/reducer";
import type {
  IsoDateTime,
  LocalId,
  Plan,
  Rev,
  SettingsSyncDoc,
  TermId,
} from "../schema";
import type { FourYearDoc } from "../schema/four-year";
import {
  conflictCopyName,
  mergeSettings,
  nextOrder,
  sameFourYearContent,
  samePlanContent,
} from "./conflict";
import {
  type DeviceSyncDoc,
  type DocKey,
  docKeyOf,
  fourYearDocKey,
  planDocKey,
  SETTINGS_DOC_KEY,
  type SyncedTables,
  settingsDocOf,
  withSettingsDoc,
} from "./docs";
import { sameJson } from "./equal";
import type { DocSync, PlanSyncState } from "./state";

// The first sign-in on a device: this device's plans join the account's.
// Drop nothing (V2 §5.4).

const DEFAULT_NAME = /^Plan [A-Z]+$/;

/**
 * A plan the app made on its own and nobody touched: a default name ("Plan A")
 * and no courses. Such a plan isn't uploaded into a term where the account
 * already has plans, or every new device would add an empty tab.
 */
export function isUntouchedPlan(plan: Plan): boolean {
  return plan.courses.length === 0 && DEFAULT_NAME.test(plan.name);
}

const DEFAULT_FOUR_YEAR = new RegExp(`^${DEFAULT_FOUR_YEAR_NAME}(?: \\d+)?$`);

/**
 * A four-year doc nobody has put anything in: the reducer's default name
 * ("My plan", "My plan 2"), no entries, no grades, no template. It isn't
 * uploaded to an account that already has a four-year plan (V3 §2.4).
 */
export function isUntouchedFourYear(doc: FourYearDoc): boolean {
  return (
    doc.entries.length === 0 &&
    Object.keys(doc.grades).length === 0 &&
    doc.template === null &&
    DEFAULT_FOUR_YEAR.test(doc.name)
  );
}

export interface FirstSignInInput<T extends SyncedTables> {
  /** This device's tables. */
  local: T;
  /** A full pull: every doc on the account, tombstones included. */
  server: readonly DeviceSyncDoc[];
  /** The cursor that pull returned. */
  cursor: Rev;
  /** Mints ids for copies (only needed when a plan is already on the account and differs). */
  newId: () => LocalId;
  now: IsoDateTime;
}

export interface FirstSignInResult<T extends SyncedTables> {
  tables: T;
  sync: PlanSyncState;
  /** This device's plans that are on the account now, uploaded as they were or renamed. */
  uploaded: LocalId[];
  /** Plans renamed because the account had one with the same name in that term. */
  renamed: { id: LocalId; from: string; to: string }[];
  /** New plans made from this device's version of a plan the account holds differently. */
  copies: { id: LocalId; of: LocalId }[];
  /** Untouched auto-made plans left out (`isUntouchedPlan`). */
  skipped: LocalId[];
  /** The same for four-year docs; `skipped` holds untouched ones (`isUntouchedFourYear`). */
  fourYear: {
    uploaded: LocalId[];
    renamed: { id: LocalId; from: string; to: string }[];
    copies: { id: LocalId; of: LocalId }[];
    skipped: LocalId[];
    /**
     * The four-year doc to open on this device: the account's most recently
     * changed one, since the account's plan is the one to show, not what
     * this device made before signing in (QA P4); null when the account
     * had none.
     */
    open: LocalId | null;
  };
}

function byTermAndOrder(a: Plan, b: Plan): number {
  if (a.termId !== b.termId) return a.termId < b.termId ? -1 : 1;
  if (a.order !== b.order) return a.order - b.order;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function byCreation(a: FourYearDoc, b: FourYearDoc): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The union of this device's data and the account's:
 * - every plan on the account stays as it is;
 * - every plan here that the account doesn't have is uploaded, after the
 *   account's tabs in its term; if the account has a plan with the same name
 *   in that term, this one gets "(copy)";
 * - a plan the account already has, but different here (signed in before,
 *   edited while signed out), is kept both ways, as a conflict would be;
 * - the settings doc keeps the account's values for keys both sides have and
 *   adds what only this device has (`mergeSettings` with no base).
 *
 * Four-year docs join the same way, with the list of four-year docs as
 * their one "term" (V3 §2.4).
 *
 * The only things left out are an untouched auto-made plan in a term where
 * the account already has plans, and an untouched "My plan" when the account
 * already has a four-year plan. The result doesn't depend on the order of
 * the plans in either input.
 */
export function firstSignInUnion<T extends SyncedTables>(
  input: FirstSignInInput<T>,
): FirstSignInResult<T> {
  const { local, now } = input;
  const docs: Partial<Record<DocKey, DocSync>> = {};
  const serverPlans = new Map<LocalId, Plan>();
  const tombstones = new Map<LocalId, Rev>();
  const serverFourYear = new Map<LocalId, FourYearDoc>();
  const fourYearTombstones = new Map<LocalId, Rev>();
  let serverSettings: SettingsSyncDoc | undefined;
  for (const doc of input.server) {
    docs[docKeyOf(doc)] = { rev: doc.rev, dirty: false, inFlight: false };
    if (doc.kind === "settings") serverSettings = doc;
    else if (doc.kind === "four-year") {
      if (doc.body === null) fourYearTombstones.set(doc.id, doc.rev);
      else serverFourYear.set(doc.id, doc.body);
    } else if (doc.body === null) tombstones.set(doc.id, doc.rev);
    else serverPlans.set(doc.id, doc.body);
  }

  const out: Plan[] = [...serverPlans.values()];
  const accountTerms = new Set(out.map((p) => p.termId));
  const inTerm = (termId: TermId) => out.filter((p) => p.termId === termId);
  const localNames = (termId: TermId) =>
    local.plans.filter((p) => p.termId === termId).map((p) => p.name);

  const result: Omit<FirstSignInResult<T>, "tables" | "sync"> = {
    uploaded: [],
    renamed: [],
    copies: [],
    skipped: [],
    fourYear: {
      uploaded: [],
      renamed: [],
      copies: [],
      skipped: [],
      open: null,
    },
  };
  const upload = (plan: Plan) => {
    out.push(plan);
    docs[planDocKey(plan.id)] = {
      rev: tombstones.get(plan.id) ?? 0,
      dirty: true,
      inFlight: false,
    };
  };
  // Names to avoid when renaming: every name in the term, on either side, so
  // a rename never makes a new clash.
  const avoid = (termId: TermId) => [
    ...inTerm(termId).map((p) => p.name),
    ...localNames(termId),
  ];

  for (const plan of [...local.plans].sort(byTermAndOrder)) {
    const onAccount = serverPlans.get(plan.id);
    if (onAccount) {
      if (samePlanContent(onAccount, plan)) continue;
      const copy: Plan = {
        ...plan,
        id: input.newId(),
        name: conflictCopyName(plan.name, avoid(plan.termId)),
        order: nextOrder(inTerm(plan.termId)),
        createdAt: now,
        updatedAt: now,
      };
      upload(copy);
      result.copies.push({ id: copy.id, of: plan.id });
      continue;
    }
    if (accountTerms.has(plan.termId) && isUntouchedPlan(plan)) {
      result.skipped.push(plan.id);
      continue;
    }
    const clash = inTerm(plan.termId).some((p) => p.name === plan.name);
    const name = clash
      ? conflictCopyName(plan.name, avoid(plan.termId))
      : plan.name;
    const order = accountTerms.has(plan.termId)
      ? nextOrder(inTerm(plan.termId))
      : plan.order;
    const next: Plan =
      name === plan.name && order === plan.order
        ? plan
        : { ...plan, name, order, updatedAt: now };
    if (clash) result.renamed.push({ id: plan.id, from: plan.name, to: name });
    upload(next);
    result.uploaded.push(plan.id);
  }

  const fourYear = fourYearUnion({
    local: local.fourYear,
    server: serverFourYear,
    tombstones: fourYearTombstones,
    docs,
    result: result.fourYear,
    newId: input.newId,
    now,
  });

  // A chat plan choice for a plan that was left out would point at nothing.
  const skipped = new Set(result.skipped);
  const localSettings = settingsDocOf(local);
  localSettings.chatPlans = Object.fromEntries(
    Object.entries(localSettings.chatPlans).filter(
      ([, id]) => !skipped.has(id),
    ),
  );
  const settings = serverSettings
    ? mergeSettings({
        base: null,
        local: localSettings,
        server: serverSettings.body,
      })
    : localSettings;
  docs[SETTINGS_DOC_KEY] = {
    rev: serverSettings?.rev ?? 0,
    dirty: !serverSettings || !sameJson(settings, serverSettings.body),
    inFlight: false,
  };

  const plans = out.sort(byTermAndOrder);
  const tables = withSettingsDoc({ ...local, plans, fourYear }, settings);
  return { ...result, tables, sync: { cursor: input.cursor, docs } };
}

/** `firstSignInUnion`'s four-year half: every doc is in one list, and names clash across it. */
function fourYearUnion(input: {
  local: readonly FourYearDoc[];
  server: ReadonlyMap<LocalId, FourYearDoc>;
  tombstones: ReadonlyMap<LocalId, Rev>;
  docs: Partial<Record<DocKey, DocSync>>;
  result: FirstSignInResult<SyncedTables>["fourYear"];
  newId: () => LocalId;
  now: IsoDateTime;
}): FourYearDoc[] {
  const { result, now } = input;
  const out: FourYearDoc[] = [...input.server.values()];
  const accountHasOne = out.length > 0;
  result.open =
    [...out].sort(
      (a, b) =>
        (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0) ||
        byCreation(a, b),
    )[0]?.id ?? null;
  const avoid = () => [
    ...out.map((d) => d.name),
    ...input.local.map((d) => d.name),
  ];
  const upload = (doc: FourYearDoc) => {
    out.push(doc);
    input.docs[fourYearDocKey(doc.id)] = {
      rev: input.tombstones.get(doc.id) ?? 0,
      dirty: true,
      inFlight: false,
    };
  };
  for (const doc of [...input.local].sort(byCreation)) {
    const onAccount = input.server.get(doc.id);
    if (onAccount) {
      if (sameFourYearContent(onAccount, doc)) continue;
      const copy: FourYearDoc = {
        ...doc,
        id: input.newId(),
        name: conflictCopyName(doc.name, avoid()),
        createdAt: now,
        updatedAt: now,
      };
      upload(copy);
      result.copies.push({ id: copy.id, of: doc.id });
      continue;
    }
    if (accountHasOne && isUntouchedFourYear(doc)) {
      result.skipped.push(doc.id);
      continue;
    }
    const clash = out.some((d) => d.name === doc.name);
    const next: FourYearDoc = clash
      ? { ...doc, name: conflictCopyName(doc.name, avoid()), updatedAt: now }
      : doc;
    if (clash)
      result.renamed.push({ id: doc.id, from: doc.name, to: next.name });
    upload(next);
    result.uploaded.push(doc.id);
  }
  return out.sort(byCreation);
}
