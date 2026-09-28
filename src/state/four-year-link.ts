import { liveQuery } from "dexie";
import { useEffect, useRef, useState } from "react";
import {
  fourYearColumnFor,
  type HandoffEntry,
  pickFourYearDoc,
} from "~/core/four-year/handoff";
import { mainPlanFor } from "~/core/plans/main-plan";
import {
  type CourseCode,
  MainPlansSchema,
  type Plan,
  PlanSchema,
  type TermId,
  type Wildcard,
} from "~/core/schema";
import {
  FourYearLinkDocSchema,
  FourYearLinkEntrySchema,
} from "~/core/schema/four-year-link";
import { FourYearPrefsSchema } from "~/core/schema/local";
import { TerpsicleDb } from "./db";

// The link between a four-year plan and the scheduler (docs/V3.md §2.12),
// read straight from IndexedDB so neither page loads the other's stores:
// the scheduler reads the four-year doc's column for a term, and Plan reads
// the term's main plan (V2 §5.5). Both are Dexie live queries, so a change
// in another tab (Plan open beside the scheduler) shows without a reload.

/**
 * A Dexie query's latest answer, run again whenever a table it read changes,
 * in this tab or another. `key` names what's asked (a new key asks again);
 * null asks nothing. `undefined` until the first answer.
 * dexie-react-hooks' `useLiveQuery` is these few lines, so it isn't a
 * dependency.
 */
export function useLiveQuery<T>(
  key: string | null,
  query: () => Promise<T>,
): T | undefined {
  const [answer, setAnswer] = useState<{ key: string; value: T } | null>(null);
  const latest = useRef(query);
  latest.current = query;
  useEffect(() => {
    if (key === null) return;
    const subscription = liveQuery(() => latest.current()).subscribe({
      next: (value) => setAnswer({ key, value }),
      // A browser that refuses IndexedDB reads as no link at all.
      error: (error: unknown) => console.warn("four-year link", error),
    });
    return () => subscription.unsubscribe();
  }, [key]);
  // An answer to an earlier key isn't this one's.
  return answer !== null && answer.key === key ? answer.value : undefined;
}

let shared: TerpsicleDb | null = null;

/** The scheduler's handle for reading four-year docs; opened on first use. */
export function fourYearLinkDb(): TerpsicleDb {
  shared ??= new TerpsicleDb();
  return shared;
}

/** A term's column in the four-year plan open in Plan, as the scheduler takes it. */
export type FourYearColumn = {
  /** Whether this browser has a four-year plan at all. */
  readonly hasDoc: boolean;
  readonly courses: readonly CourseCode[];
  readonly placeholders: readonly Wildcard[];
};

export const NO_FOUR_YEAR_COLUMN: FourYearColumn = {
  hasDoc: false,
  courses: [],
  placeholders: [],
};

export async function readFourYearColumn(
  db: TerpsicleDb,
  termId: TermId,
): Promise<FourYearColumn> {
  const [rows, prefsRow] = await Promise.all([
    db.fourYear.toArray(),
    db.settings.get("fourYear"),
  ]);
  const docs = rows.flatMap((row) => {
    const parsed = FourYearLinkDocSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
  const prefs = FourYearPrefsSchema.safeParse(prefsRow?.value);
  const doc = pickFourYearDoc(docs, prefs.success ? prefs.data.activeId : null);
  if (!doc) return NO_FOUR_YEAR_COLUMN;
  // "Before UMD" and credit entries never match a term: skipped.
  const entries: HandoffEntry[] = doc.entries.flatMap((entry) => {
    const parsed = FourYearLinkEntrySchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
  return { hasDoc: true, ...fourYearColumnFor({ entries }, termId) };
}

/** A term's main plan, and whether it has other plans (drafts) beside it. */
export type TermMainPlan = { readonly plan: Plan; readonly drafts: boolean };

/** The term's main plan (`mainPlanFor`), or null when it has no plan. */
export async function readMainPlan(
  db: TerpsicleDb,
  termId: TermId,
): Promise<TermMainPlan | null> {
  const [rows, mainPlansRow] = await Promise.all([
    db.plans.where("termId").equals(termId).toArray(),
    db.settings.get("mainPlans"),
  ]);
  const plans = rows.flatMap((row) => {
    const parsed = PlanSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
  const mainPlans = MainPlansSchema.safeParse(mainPlansRow?.value);
  const plan = mainPlanFor(
    termId,
    plans,
    mainPlans.success ? mainPlans.data : {},
  );
  return plan ? { plan, drafts: plans.length > 1 } : null;
}
