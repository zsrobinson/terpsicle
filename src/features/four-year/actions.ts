import { track } from "~/app/analytics";
import { wildcardLabel } from "~/core/catalog/wildcard";
import type { FourYearAction } from "~/core/four-year/reducer";
import {
  templateAddedLabel,
  templateFit,
  templateRef,
  templateSemesters,
} from "~/core/four-year/templates";
import { fourYearTermLabel } from "~/core/four-year/terms";
import { importSummary } from "~/core/four-year/transcript";
import { choicesForWildcard } from "~/core/four-year/wildcards";
import type {
  CourseCode,
  CourseIndexEntry,
  GenEdCode,
  Grade,
  LocalId,
  TermId,
  Wildcard,
} from "~/core/schema";
import {
  type FourYearCourseDetails,
  type FourYearCreditEntry,
  type FourYearDoc,
  type FourYearEntry,
  type FourYearProblem,
  type FourYearTemplate,
  type FourYearTerm,
  WILDCARD_CREDITS,
} from "~/core/schema/four-year";
import { courseIndexEntry, useCourseIndex } from "~/state/course-index-store";
import { newLocalId, nowIso } from "~/state/ids";
import { activeDoc, useFourYear } from "./store";

// Plan's actions as people name them: each one dispatches to the core
// reducer with an id and the time, says what happened for the undo toast,
// and counts itself for analytics (never with a course code, V3 §6).

const dispatch = (
  ...args: Parameters<ReturnType<typeof useFourYear.getState>["dispatch"]>
) => useFourYear.getState().dispatch(...args);

/** What a block is called in a toast: its code, or the placeholder's pattern. */
export function entryName(entry: FourYearEntry): string {
  if (entry.kind === "course") return entry.code;
  if (entry.kind === "wildcard")
    return entry.wildcard.kind === "pattern"
      ? entry.wildcard.pattern
      : wildcardLabel(entry.wildcard);
  return entry.title;
}

export function createDoc(firstTermId: TermId): void {
  if (
    dispatch({ type: "create", id: newLocalId(), firstTermId, now: nowIso() })
  )
    track("four_year_created", { source: "empty" });
}

/** The empty state's "Import your transcript": a plan to import into. */
export function createDocForImport(firstTermId: TermId): void {
  if (
    dispatch({ type: "create", id: newLocalId(), firstTermId, now: nowIso() })
  )
    track("four_year_created", { source: "import" });
}

/** The empty state's "Start from a sample plan": a plan to add one to. */
export function createDocForTemplates(firstTermId: TermId): void {
  if (
    dispatch({ type: "create", id: newLocalId(), firstTermId, now: nowIso() })
  )
    track("four_year_created", { source: "template" });
}

export function duplicateDoc(doc: FourYearDoc): void {
  if (
    dispatch(
      { type: "duplicate", docId: doc.id, id: newLocalId(), now: nowIso() },
      `Made a copy of ${doc.name}`,
    )
  )
    track("four_year_created", { source: "copy" });
}

export function newDoc(firstTermId: TermId): void {
  if (
    dispatch(
      { type: "create", id: newLocalId(), firstTermId, now: nowIso() },
      "Started a new four-year plan",
    )
  )
    track("four_year_created", { source: "empty" });
}

export function deleteDoc(doc: FourYearDoc): void {
  dispatch({ type: "delete", docId: doc.id }, `Deleted ${doc.name}`);
}

export function renameDoc(doc: FourYearDoc, name: string): void {
  dispatch(
    { type: "rename", docId: doc.id, name, now: nowIso() },
    `Renamed to ${name.trim()}`,
  );
}

export function setFirstTerm(doc: FourYearDoc, firstTermId: TermId): void {
  dispatch(
    { type: "set-first-term", docId: doc.id, firstTermId, now: nowIso() },
    `Starts in ${fourYearTermLabel(firstTermId)} now`,
  );
}

/** Adds a course to a semester; the new entry's id, or null when it didn't. */
export function addCourse(
  doc: FourYearDoc,
  code: string,
  term: FourYearTerm,
  via: "search" | "column",
): LocalId | null {
  const entry: FourYearEntry = {
    kind: "course",
    id: newLocalId(),
    term,
    code,
    credits: null,
    genEdChoices: {},
    source: "typed",
    transcript: null,
  };
  if (
    !dispatch(
      { type: "add", docId: doc.id, entry, now: nowIso() },
      `Added ${code} to ${fourYearTermLabel(term)}`,
    )
  )
    return null;
  track("four_year_course_added", { via });
  return entry.id;
}

/** Adds a placeholder to a semester; the new entry's id, or null. */
export function addPlaceholder(
  doc: FourYearDoc,
  wildcard: Wildcard,
  term: FourYearTerm,
): LocalId | null {
  const entry: FourYearEntry = {
    kind: "wildcard",
    id: newLocalId(),
    term,
    wildcard,
    credits: WILDCARD_CREDITS.default,
    source: "typed",
  };
  if (
    !dispatch(
      { type: "add", docId: doc.id, entry, now: nowIso() },
      `Added ${entryName(entry)} to ${fourYearTermLabel(term)}`,
    )
  )
    return null;
  track("four_year_wildcard_added", { kind: wildcard.kind });
  return entry.id;
}

/**
 * "Pick" in Search: loads the course's department first, so a GenEd
 * placeholder's choice comes from the catalog's groups, not the search row.
 */
export async function pickForPlaceholder(
  entryId: LocalId,
  code: CourseCode,
): Promise<void> {
  await useCourseIndex.getState().ensureDepts([code.slice(0, 4)]);
  const doc = activeDoc(useFourYear.getState());
  if (!doc) return;
  const course = courseIndexEntry(useCourseIndex.getState(), code);
  resolvePlaceholder(doc, entryId, course ?? { code, genEds: [] });
}

export function resolvePlaceholder(
  doc: FourYearDoc,
  entryId: LocalId,
  course: Pick<CourseIndexEntry, "code" | "genEds">,
): void {
  const entry = doc.entries.find((e) => e.id === entryId);
  if (entry?.kind !== "wildcard") return;
  if (
    dispatch(
      {
        type: "resolve-wildcard",
        docId: doc.id,
        entryId,
        code: course.code,
        credits: null,
        genEdChoices: choicesForWildcard(entry.wildcard, course),
        now: nowIso(),
      },
      `Picked ${course.code} for ${entryName(entry)}`,
    )
  ) {
    track("four_year_wildcard_resolved", { kind: entry.wildcard.kind });
    track("four_year_course_added", { via: "wildcard-resolve" });
  }
}

export function moveEntry(
  doc: FourYearDoc,
  entry: FourYearEntry,
  term: FourYearTerm,
  via: "drag" | "menu",
  index?: number,
): void {
  const moved = dispatch(
    {
      type: "move",
      docId: doc.id,
      entryId: entry.id,
      term,
      ...(index === undefined ? {} : { index }),
      now: nowIso(),
    },
    entry.term === term
      ? `Moved ${entryName(entry)} within ${fourYearTermLabel(term)}`
      : `Moved ${entryName(entry)} to ${fourYearTermLabel(term)}`,
  );
  if (moved) track("four_year_course_moved", { via });
}

export function removeEntry(doc: FourYearDoc, entry: FourYearEntry): void {
  dispatch(
    { type: "remove", docId: doc.id, entryId: entry.id, now: nowIso() },
    `Removed ${entryName(entry)} from ${fourYearTermLabel(entry.term)}`,
  );
}

export function setCredits(
  doc: FourYearDoc,
  entry: FourYearEntry,
  credits: number | null,
): void {
  dispatch(
    {
      type: "set-credits",
      docId: doc.id,
      entryId: entry.id,
      credits,
      now: nowIso(),
    },
    credits === null
      ? `${entryName(entry)} counts Testudo's credits`
      : `${entryName(entry)} counts ${credits} ${credits === 1 ? "credit" : "credits"}`,
  );
}

export function setGenEdChoice(
  doc: FourYearDoc,
  entry: FourYearEntry,
  group: number,
  code: GenEdCode | null,
): void {
  dispatch(
    {
      type: "set-choice",
      docId: doc.id,
      entryId: entry.id,
      group,
      code,
      now: nowIso(),
    },
    code === null
      ? `${entryName(entry)} counts where it helps most`
      : `${entryName(entry)} counts as ${code}`,
  );
}

export function applyFix(doc: FourYearDoc, problem: FourYearProblem): void {
  const fix = problem.fix;
  if (!fix) return;
  // The same step the reducer takes, so undo takes it back in one go.
  const now = nowIso();
  const action: FourYearAction =
    fix.kind === "move"
      ? {
          type: "move",
          docId: doc.id,
          entryId: fix.entryId,
          term: fix.term,
          now,
        }
      : fix.kind === "remove"
        ? { type: "remove", docId: doc.id, entryId: fix.entryId, now }
        : {
            type: "set-details",
            docId: doc.id,
            code: fix.code,
            details: fix.details,
            credits: fix.credits,
            now,
          };
  if (dispatch(action, fix.label))
    track("four_year_problem_fix_applied", { kind: problem.kind });
}

/**
 * What someone says a course Testudo doesn't list was: every entry of its
 * code takes the details and credits. Null details clear them.
 */
export function setDetails(
  doc: FourYearDoc,
  code: CourseCode,
  details: FourYearCourseDetails | null,
  credits: number | null,
): void {
  const saved = dispatch(
    {
      type: "set-details",
      docId: doc.id,
      code,
      details,
      credits,
      now: nowIso(),
    },
    details === null
      ? `Cleared ${code}'s course info`
      : details.countsAs
        ? `${code} counts as ${details.countsAs}`
        : `Saved ${code}'s course info`,
  );
  if (saved)
    track("four_year_details_saved", {
      genEds: details?.genEds.length ?? 0,
      countsAs: !!details?.countsAs,
      of: "course",
    });
}

/**
 * What AP, exam or transfer credit with no UMD course counts as, and its
 * credits and GenEds. Null `countsAs` says it's no UMD course.
 */
export function setCreditInfo(
  doc: FourYearDoc,
  entry: FourYearCreditEntry,
  info: {
    countsAs: CourseCode | null;
    credits: number;
    genEds: readonly GenEdCode[];
  },
): void {
  const saved = dispatch(
    {
      type: "set-credit",
      docId: doc.id,
      entryId: entry.id,
      ...info,
      now: nowIso(),
    },
    info.countsAs
      ? `${entry.title} counts as ${info.countsAs}`
      : `Saved ${entry.title}`,
  );
  if (saved)
    track("four_year_details_saved", {
      genEds: info.genEds.length,
      countsAs: info.countsAs !== null,
      of: "credit",
    });
}

/**
 * The Import tab's one step (V3 §2.10): the transcript replaces the done and
 * in-progress semesters, in one action that Undo takes back whole.
 */
export function importTranscript(
  doc: FourYearDoc,
  imported: {
    replace: readonly FourYearTerm[];
    entries: readonly FourYearEntry[];
    grades: Readonly<Record<LocalId, Grade>>;
    keptGrades: boolean;
  },
): boolean {
  const changed = dispatch(
    {
      type: "import",
      docId: doc.id,
      replace: imported.replace,
      entries: imported.entries,
      grades: imported.grades,
      now: nowIso(),
    },
    importSummary(imported.entries),
  );
  if (changed)
    track("transcript_imported", {
      lines: imported.entries.length,
      keptGrades: imported.keptGrades,
    });
  return changed;
}

/** The ▾ menu's "Remove grades" (V3 §2.5): every grade in the plan, with Undo. */
export function removeGrades(doc: FourYearDoc): void {
  dispatch(
    { type: "remove-grades", docId: doc.id, now: nowIso() },
    `Removed the grades from ${doc.name}`,
  );
}

/**
 * The Samples tab's "Add" (V3 §2.11): fills the plan's empty semesters from
 * its first one, and never touches a semester that has something.
 */
export function applyTemplate(
  doc: FourYearDoc,
  template: FourYearTemplate,
): boolean {
  const { fills } = templateFit(doc, template);
  const changed = dispatch(
    {
      type: "apply-template",
      docId: doc.id,
      template: templateRef(template),
      semesters: templateSemesters(template, newLocalId),
      now: nowIso(),
    },
    templateAddedLabel(template, fills.length),
  );
  if (changed) track("template_applied", { template: template.id });
  return changed;
}

/** "Start a new four-year plan from it": a new four-year plan with the sample, in one step Undo takes back. */
export function newDocFromTemplate(
  template: FourYearTemplate,
  firstTermId: TermId,
): void {
  if (
    dispatch(
      {
        type: "create",
        id: newLocalId(),
        firstTermId,
        now: nowIso(),
        template: {
          ref: templateRef(template),
          semesters: templateSemesters(template, newLocalId),
        },
      },
      `Started a new four-year plan from the ${template.name} sample plan`,
    )
  ) {
    track("four_year_created", { source: "template" });
    track("template_applied", { template: template.id });
  }
}
