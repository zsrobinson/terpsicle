import { liveQuery } from "dexie";
import { useEffect, useRef, useState } from "react";
import {
  fourYearColumnFor,
  type HandoffEntry,
  linkedSchedulePlan,
  pickFourYearDoc,
} from "~/core/four-year/handoff";
import {
  type CourseCode,
  type Plan,
  PlanSchema,
  type TermId,
  UiPrefsSchema,
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
// the term's linked scheduler plan. Both are Dexie live queries, so a change
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

/** The part of the scheduler's `ui` settings row the link needs. */
const OpenPlansSchema = UiPrefsSchema.pick({ activePlanByTerm: true });

/** The term's linked scheduler plan (`linkedSchedulePlan`), or null when it has none. */
export async function readLinkedSchedulePlan(
  db: TerpsicleDb,
  termId: TermId,
): Promise<Plan | null> {
  const [rows, uiRow] = await Promise.all([
    db.plans.where("termId").equals(termId).toArray(),
    db.settings.get("ui"),
  ]);
  const plans = rows.flatMap((row) => {
    const parsed = PlanSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
  const ui = OpenPlansSchema.safeParse(uiRow?.value);
  return linkedSchedulePlan(
    termId,
    plans,
    ui.success ? ui.data.activePlanByTerm : {},
  );
}
