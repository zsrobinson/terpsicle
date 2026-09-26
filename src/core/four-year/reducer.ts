import { cleanPlanName, copyName } from "../plans/naming";
import type {
  CourseCode,
  GenEdCode,
  Grade,
  IsoDateTime,
  LocalId,
  TermId,
} from "../schema";
import {
  FOUR_YEAR_MAX_ENTRIES,
  type FourYearCourseEntry,
  type FourYearDoc,
  type FourYearEntry,
  type FourYearTerm,
  type FourYearWildcardEntry,
  WILDCARD_CREDITS,
} from "../schema/four-year";
import { compareFourYearTerms, firstSemesterOf, semesterIds } from "./terms";

// The pure reducer behind Plan's store (docs/V3.md §2.3), in the scheduler's
// pattern (`src/core/plans/reducer.ts`): ids and times come in on the
// action, and an action that changes nothing returns the same state object,
// so it isn't pushed on the undo stack. Undo and redo are the scheduler's
// `History` (`src/core/plans/history.ts`) over this state.

export type FourYearState = {
  readonly docs: readonly FourYearDoc[];
};

export const EMPTY_FOUR_YEAR_STATE: FourYearState = { docs: [] };

/** A new doc's name. */
export const DEFAULT_FOUR_YEAR_NAME = "My plan";

type WithoutTerm<T> = T extends unknown ? Omit<T, "term"> : never;

/** A template's entry: its semester says the term. */
export type FourYearEntryDraft = WithoutTerm<
  FourYearCourseEntry | FourYearWildcardEntry
>;

export type FourYearTemplateRef = NonNullable<FourYearDoc["template"]>;

export type FourYearAction =
  /** A new, empty doc. Name defaults to "My plan" ("My plan 2" when that's taken). */
  | {
      type: "create";
      id: LocalId;
      firstTermId: TermId;
      now: IsoDateTime;
      name?: string;
    }
  /** "Copy of My plan", with the same entries and grades. */
  | { type: "duplicate"; docId: LocalId; id: LocalId; now: IsoDateTime }
  | { type: "delete"; docId: LocalId }
  | { type: "rename"; docId: LocalId; name: string; now: IsoDateTime }
  /**
   * The first semester shown. Entries stay where they are: a term that's
   * no longer one of the eight still shows while it has an entry.
   */
  | {
      type: "set-first-term";
      docId: LocalId;
      firstTermId: TermId;
      now: IsoDateTime;
    }
  /** Adds at `index` in its term's column, or at the end. */
  | {
      type: "add";
      docId: LocalId;
      entry: FourYearEntry;
      index?: number;
      now: IsoDateTime;
    }
  /** Moves to `index` in `term`'s column, or to its end. Credit entries stay in "Before UMD". */
  | {
      type: "move";
      docId: LocalId;
      entryId: LocalId;
      term: FourYearTerm;
      index?: number;
      now: IsoDateTime;
    }
  | { type: "remove"; docId: LocalId; entryId: LocalId; now: IsoDateTime }
  /** Replaces a placeholder with a course, in place. `genEdChoices` from `choicesForWildcard`. */
  | {
      type: "resolve-wildcard";
      docId: LocalId;
      entryId: LocalId;
      code: CourseCode;
      credits: number | null;
      genEdChoices?: Readonly<Record<string, GenEdCode>>;
      now: IsoDateTime;
    }
  /** Picks the option of a course's GenEd group; null goes back to automatic. */
  | {
      type: "set-choice";
      docId: LocalId;
      entryId: LocalId;
      group: number;
      code: GenEdCode | null;
      now: IsoDateTime;
    }
  /** A variable-credit course's credits (null: the index's), or a placeholder's (1–6). */
  | {
      type: "set-credits";
      docId: LocalId;
      entryId: LocalId;
      credits: number | null;
      now: IsoDateTime;
    }
  /**
   * Fills empty semesters only, semester `index` counted from `firstTermId`,
   * and never moves or removes anything already there.
   */
  | {
      type: "apply-template";
      docId: LocalId;
      template: FourYearTemplateRef;
      semesters: readonly {
        readonly index: number;
        readonly entries: readonly FourYearEntryDraft[];
      }[];
      now: IsoDateTime;
    }
  /**
   * A transcript import: replaces the `replace` terms (the done and
   * in-progress ones) and every term the transcript has with its entries.
   * Typed entries there stay unless the transcript has the same course;
   * planned terms are left alone. An empty doc starts at the transcript's
   * first fall or spring. `grades` only for kept grades.
   */
  | {
      type: "import";
      docId: LocalId;
      replace: readonly FourYearTerm[];
      entries: readonly FourYearEntry[];
      grades: Readonly<Record<LocalId, Grade>>;
      now: IsoDateTime;
    }
  | { type: "remove-grades"; docId: LocalId; now: IsoDateTime };

/** Entries in column order; stable, so positions within a column keep. */
export function sortEntries(
  entries: readonly FourYearEntry[],
): FourYearEntry[] {
  return [...entries].sort((a, b) => compareFourYearTerms(a.term, b.term));
}

function insertAt(
  entries: readonly FourYearEntry[],
  entry: FourYearEntry,
  index: number | undefined,
): FourYearEntry[] {
  const out = sortEntries(entries);
  const column = out.filter((e) => e.term === entry.term);
  const at = index === undefined ? column.length : Math.max(0, index);
  const before = column[at];
  if (before) out.splice(out.indexOf(before), 0, entry);
  else {
    // The column's end: after its last entry, or where the column would sort.
    const next = out.findIndex(
      (e) => compareFourYearTerms(e.term, entry.term) > 0,
    );
    out.splice(next === -1 ? out.length : next, 0, entry);
  }
  return out;
}

/** Adds an entry; the same doc when its id is taken or the doc is full. */
export function addEntry(
  doc: FourYearDoc,
  entry: FourYearEntry,
  index?: number,
): FourYearDoc {
  if (doc.entries.length >= FOUR_YEAR_MAX_ENTRIES) return doc;
  if (doc.entries.some((e) => e.id === entry.id)) return doc;
  return { ...doc, entries: insertAt(doc.entries, entry, index) };
}

/** Moves an entry; never drops one, and the same doc when nothing moves. */
export function moveEntry(
  doc: FourYearDoc,
  entryId: LocalId,
  term: FourYearTerm,
  index?: number,
): FourYearDoc {
  const entry = doc.entries.find((e) => e.id === entryId);
  if (!entry) return doc;
  if (entry.kind === "credit" && term !== "before") return doc;
  const rest = doc.entries.filter((e) => e !== entry);
  const moved = { ...entry, term } as FourYearEntry;
  const entries = insertAt(rest, moved, index);
  const same =
    entry.term === term &&
    entries.indexOf(moved) === doc.entries.indexOf(entry);
  return same ? doc : { ...doc, entries };
}

/** Removes an entry and its grade. */
export function removeEntry(doc: FourYearDoc, entryId: LocalId): FourYearDoc {
  if (!doc.entries.some((e) => e.id === entryId)) return doc;
  const { [entryId]: _removed, ...grades } = doc.grades;
  return {
    ...doc,
    entries: doc.entries.filter((e) => e.id !== entryId),
    grades,
  };
}

function nextDocName(taken: Iterable<string>): string {
  const names = new Set(taken);
  for (let i = 1; ; i++) {
    const name =
      i === 1 ? DEFAULT_FOUR_YEAR_NAME : `${DEFAULT_FOUR_YEAR_NAME} ${i}`;
    if (!names.has(name)) return name;
  }
}

function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}

function updateDoc(
  state: FourYearState,
  docId: LocalId,
  now: IsoDateTime,
  change: (doc: FourYearDoc) => FourYearDoc,
): FourYearState {
  const doc = state.docs.find((d) => d.id === docId);
  if (!doc) return state;
  const next = change(doc);
  if (next === doc) return state;
  return {
    docs: state.docs.map((d) => (d === doc ? { ...next, updatedAt: now } : d)),
  };
}

function updateEntry(
  doc: FourYearDoc,
  entryId: LocalId,
  change: (entry: FourYearEntry) => FourYearEntry,
): FourYearDoc {
  const i = doc.entries.findIndex((e) => e.id === entryId);
  const entry = doc.entries[i];
  if (!entry) return doc;
  const next = change(entry);
  if (next === entry) return doc;
  return { ...doc, entries: doc.entries.map((e, k) => (k === i ? next : e)) };
}

function applyTemplate(
  doc: FourYearDoc,
  action: Extract<FourYearAction, { type: "apply-template" }>,
): FourYearDoc {
  const semesters = semesterIds(doc.firstTermId);
  const filled = new Set<FourYearTerm>(doc.entries.map((e) => e.term));
  let next = doc;
  for (const { index, entries } of action.semesters) {
    const term = semesters[index];
    if (term === undefined || filled.has(term)) continue;
    for (const draft of entries)
      next = addEntry(next, { ...draft, term } as FourYearEntry);
  }
  return next === doc ? doc : { ...next, template: { ...action.template } };
}

function importTranscript(
  doc: FourYearDoc,
  action: Extract<FourYearAction, { type: "import" }>,
): FourYearDoc {
  const replaced = new Set<FourYearTerm>(action.replace);
  for (const e of action.entries) replaced.add(e.term);
  const imported = new Set(
    action.entries.flatMap((e) => (e.kind === "course" ? [e.code] : [])),
  );
  const kept = doc.entries.filter(
    (e) =>
      !replaced.has(e.term) ||
      (e.source === "typed" && !(e.kind === "course" && imported.has(e.code))),
  );
  const keptIds = new Set(kept.map((e) => e.id));
  const incoming = action.entries.filter((e) => !keptIds.has(e.id));
  const entries = sortEntries([...kept, ...incoming]);
  if (entries.length > FOUR_YEAR_MAX_ENTRIES) return doc;
  const grades: Record<LocalId, Grade> = {};
  for (const [id, grade] of Object.entries(doc.grades))
    if (keptIds.has(id)) grades[id] = grade;
  for (const e of incoming) {
    const grade = action.grades[e.id];
    if (grade !== undefined) grades[e.id] = grade;
  }
  const firstTermId =
    doc.entries.length === 0
      ? (firstSemesterOf(incoming.map((e) => e.term)) ?? doc.firstTermId)
      : doc.firstTermId;
  return { ...doc, firstTermId, entries, grades };
}

export function fourYearReducer(
  state: FourYearState,
  action: FourYearAction,
): FourYearState {
  switch (action.type) {
    case "create": {
      if (state.docs.some((d) => d.id === action.id)) return state;
      const taken = state.docs.map((d) => d.name);
      const name =
        (action.name !== undefined ? cleanPlanName(action.name) : null) ??
        nextDocName(taken);
      const doc: FourYearDoc = {
        id: action.id,
        name,
        firstTermId: action.firstTermId,
        entries: [],
        grades: {},
        template: null,
        createdAt: action.now,
        updatedAt: action.now,
      };
      return { docs: [...state.docs, doc] };
    }
    case "duplicate": {
      const source = state.docs.find((d) => d.id === action.docId);
      if (!source || state.docs.some((d) => d.id === action.id)) return state;
      const copy: FourYearDoc = {
        ...source,
        id: action.id,
        name: copyName(
          source.name,
          state.docs.map((d) => d.name),
        ),
        entries: source.entries.map((e) => ({ ...e })),
        grades: { ...source.grades },
        createdAt: action.now,
        updatedAt: action.now,
      };
      const docs = [...state.docs];
      docs.splice(docs.indexOf(source) + 1, 0, copy);
      return { docs };
    }
    case "delete":
      if (!state.docs.some((d) => d.id === action.docId)) return state;
      return { docs: state.docs.filter((d) => d.id !== action.docId) };
    case "rename":
      return updateDoc(state, action.docId, action.now, (doc) => {
        const name = cleanPlanName(action.name);
        return name === null || name === doc.name ? doc : { ...doc, name };
      });
    case "set-first-term":
      return updateDoc(state, action.docId, action.now, (doc) =>
        doc.firstTermId === action.firstTermId
          ? doc
          : { ...doc, firstTermId: action.firstTermId },
      );
    case "add":
      return updateDoc(state, action.docId, action.now, (doc) =>
        addEntry(doc, action.entry, action.index),
      );
    case "move":
      return updateDoc(state, action.docId, action.now, (doc) =>
        moveEntry(doc, action.entryId, action.term, action.index),
      );
    case "remove":
      return updateDoc(state, action.docId, action.now, (doc) =>
        removeEntry(doc, action.entryId),
      );
    case "resolve-wildcard":
      return updateDoc(state, action.docId, action.now, (doc) =>
        updateEntry(doc, action.entryId, (entry) =>
          entry.kind !== "wildcard"
            ? entry
            : {
                kind: "course",
                id: entry.id,
                term: entry.term,
                code: action.code,
                credits:
                  action.credits === null ? null : clamp(action.credits, 0, 20),
                genEdChoices: { ...action.genEdChoices },
                source: entry.source,
                transcript: null,
              },
        ),
      );
    case "set-choice":
      return updateDoc(state, action.docId, action.now, (doc) =>
        updateEntry(doc, action.entryId, (entry) => {
          if (entry.kind !== "course") return entry;
          const key = String(action.group);
          if ((entry.genEdChoices[key] ?? null) === action.code) return entry;
          const { [key]: _old, ...rest } = entry.genEdChoices;
          return {
            ...entry,
            genEdChoices:
              action.code === null ? rest : { ...rest, [key]: action.code },
          };
        }),
      );
    case "set-credits":
      return updateDoc(state, action.docId, action.now, (doc) =>
        updateEntry(doc, action.entryId, (entry) => {
          if (entry.kind === "course") {
            const credits =
              action.credits === null ? null : clamp(action.credits, 0, 20);
            return credits === entry.credits ? entry : { ...entry, credits };
          }
          if (entry.kind === "wildcard" && action.credits !== null) {
            const credits = clamp(
              action.credits,
              WILDCARD_CREDITS.min,
              WILDCARD_CREDITS.max,
            );
            return credits === entry.credits ? entry : { ...entry, credits };
          }
          return entry;
        }),
      );
    case "apply-template":
      return updateDoc(state, action.docId, action.now, (doc) =>
        applyTemplate(doc, action),
      );
    case "import":
      return updateDoc(state, action.docId, action.now, (doc) =>
        importTranscript(doc, action),
      );
    case "remove-grades":
      return updateDoc(state, action.docId, action.now, (doc) =>
        Object.keys(doc.grades).length === 0 ? doc : { ...doc, grades: {} },
      );
  }
}
