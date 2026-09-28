import type {
  CourseCode,
  GenEdCode,
  Grade,
  LocalId,
  TranscriptLine,
  TranscriptParse,
  TranscriptSkipReason,
} from "../../schema";
import { CourseCodeSchema } from "../../schema";
import type {
  FourYearCourseDetails,
  FourYearEntry,
  FourYearTerm,
} from "../../schema/four-year";
import type { FourYearCourses } from "../course-lookup";
import type { StatusOf } from "../status";
import { compareFourYearTerms } from "../terms";

// The Import tab's check step, pure (docs/V3.md §2.10): what a paste turns
// into once the person has looked it over. Three fix-ups only: pick the
// GenEd where Testudo says "or", tick a line in or out, and say what AP,
// exam or transfer credit with no UMD course counts as. The result is one
// `import` action.

/** A line the check step shows: one the parser read, or one it left out but can bring back. */
export type TranscriptRow = {
  /** Stable within one parse: `line:3`, `skipped:1`. */
  readonly key: string;
  /** What it imports as. */
  readonly line: TranscriptLine;
  /** Why the parser left it out; null for a line it read. */
  readonly skipped: TranscriptSkipReason | null;
};

/** What the person decided on the check step. */
export type TranscriptChecks = {
  /** Rows switched from their default: read lines left out, skipped lines brought in. */
  readonly toggled: ReadonlySet<string>;
  /** Per row, the option chosen for each of the transcript's GenEd groups with an "or". */
  readonly choices: Readonly<
    Record<string, Readonly<Record<number, GenEdCode>>>
  >;
  /** Per row, the UMD course credit without one counts as ("Counts as"). */
  readonly mappings: Readonly<Record<string, CourseCode>>;
  /** "Keep grades" (V3 §2.5): on unless the person turns it off. */
  readonly keepGrades: boolean;
};

export const EMPTY_TRANSCRIPT_CHECKS: TranscriptChecks = {
  toggled: new Set(),
  choices: {},
  mappings: {},
  keepGrades: true,
};

/**
 * The rows to check, in column order; within a term, what was read comes
 * before what was left out. `unreadable` is the lines nothing could be made
 * of, as pasted, so the check step can say which.
 */
export function transcriptRows(parse: TranscriptParse): {
  rows: TranscriptRow[];
  unreadable: string[];
} {
  const read: TranscriptRow[] = parse.lines.map((line, i) => ({
    key: `line:${i}`,
    line,
    skipped: null,
  }));
  const left: TranscriptRow[] = [];
  const unreadable: string[] = [];
  parse.skipped.forEach((s, i) => {
    if (s.line)
      left.push({ key: `skipped:${i}`, line: s.line, skipped: s.reason });
    else unreadable.push(s.raw);
  });
  // A stable sort keeps transcript order within a term.
  const rows = [...read, ...left].sort((a, b) =>
    compareFourYearTerms(a.line.term, b.line.term),
  );
  return { rows, unreadable };
}

export function rowIncluded(
  row: TranscriptRow,
  checks: TranscriptChecks,
): boolean {
  return (row.skipped === null) !== checks.toggled.has(row.key);
}

/** The transcript's GenEd groups with an "or" that still need a choice. */
export function openChoices(
  row: TranscriptRow,
  checks: TranscriptChecks,
): number[] {
  const chosen = checks.choices[row.key] ?? {};
  const open: number[] = [];
  row.line.genEds.forEach((group, i) => {
    if (group.length > 1 && chosen[i] === undefined) open.push(i);
  });
  return open;
}

/** How many rows being imported still wait on a GenEd choice; Import waits for 0. */
export function pendingChoices(
  rows: readonly TranscriptRow[],
  checks: TranscriptChecks,
): number {
  return rows.filter(
    (r) => rowIncluded(r, checks) && openChoices(r, checks).length > 0,
  ).length;
}

/**
 * The UMD course a row counts as: the line's own (for AP and transfer, the
 * equivalent the transcript names), else what the person said it counts
 * as, else null.
 */
export function rowCode(
  row: TranscriptRow,
  checks: TranscriptChecks,
): CourseCode | null {
  return row.line.code ?? checks.mappings[row.key] ?? null;
}

/** "chem 131" → "CHEM131"; null when it isn't a course code. */
export function normalizeCourseCode(input: string): CourseCode | null {
  const code = input.replace(/\s+/g, "").toUpperCase();
  return CourseCodeSchema.safeParse(code).success ? code : null;
}

/** Whether a course code fits a generic equivalent: CHEM131 fits "CHEM1XX". */
export function fitsEquivalentPattern(code: string, pattern: string): boolean {
  if (!/^[A-Z]{4}[0-9X]{3}$/.test(pattern)) return false;
  return new RegExp(`^${pattern.replace(/X/g, "\\d")}[A-Z]?$`).test(code);
}

/**
 * The option each group counts for: the chosen one where Testudo says
 * "or", else the only one.
 */
function pickedCodes(
  row: TranscriptRow,
  checks: TranscriptChecks,
): Map<number, GenEdCode> {
  const chosen = checks.choices[row.key] ?? {};
  const picks = new Map<number, GenEdCode>();
  row.line.genEds.forEach((group, i) => {
    const code = group.length === 1 ? group[0]?.code : chosen[i];
    if (code !== undefined) picks.set(i, code);
  });
  return picks;
}

/**
 * A course entry's `genEdChoices` are keyed by the catalog's group index
 * (V3 §2.3), and the catalog may list groups in another order than the
 * transcript. A course the index doesn't have keeps the transcript's.
 */
function genEdChoices(
  row: TranscriptRow,
  code: CourseCode,
  checks: TranscriptChecks,
  lookup: FourYearCourses,
): Record<string, GenEdCode> {
  const out: Record<string, GenEdCode> = {};
  const catalog = lookup.courses.get(code)?.genEds;
  for (const [i, pick] of pickedCodes(row, checks)) {
    if ((row.line.genEds[i]?.length ?? 0) < 2) continue;
    if (!catalog) {
      out[String(i)] = pick;
      continue;
    }
    const at = catalog.findIndex(
      (group) => group.length > 1 && group.some((o) => o.code === pick),
    );
    if (at !== -1) out[String(at)] = pick;
  }
  return out;
}

/**
 * The entry's own credits: the transcript's, where the index would count
 * something else (a variable-credit course, AP credit worth less than the
 * course, a course the index doesn't have); null to count the index's.
 */
function courseCredits(
  code: CourseCode,
  credits: number,
  lookup: FourYearCourses,
): number | null {
  const course = lookup.courses.get(code);
  if (
    course &&
    course.credits.min === credits &&
    course.credits.max === credits
  )
    return null;
  return Math.min(credits, 20);
}

/**
 * A code the index doesn't have (an honors seminar that rotated out) keeps
 * the GenEds the transcript lists for it as its details, so they count. Only
 * a code the transcript itself names: a mapping someone typed could be off.
 */
function transcriptDetails(
  row: TranscriptRow,
  code: CourseCode,
  checks: TranscriptChecks,
  lookup: FourYearCourses,
): { details: FourYearCourseDetails } | Record<string, never> {
  if (row.line.code === null || lookup.courses.has(code)) return {};
  const genEds = [...new Set(pickedCodes(row, checks).values())].slice(0, 8);
  return genEds.length === 0 ? {} : { details: { title: null, genEds } };
}

/**
 * The entries and grades to import, in the order the rows came. Grades go
 * only on course entries, only when kept, and only for lines that have one
 * (in-progress, withdrawn and dropped lines don't).
 */
export function buildTranscriptImport(
  rows: readonly TranscriptRow[],
  checks: TranscriptChecks,
  options: { readonly lookup: FourYearCourses; readonly newId: () => LocalId },
): { entries: FourYearEntry[]; grades: Record<LocalId, Grade> } {
  const entries: FourYearEntry[] = [];
  const grades: Record<LocalId, Grade> = {};
  for (const row of rows) {
    if (!rowIncluded(row, checks)) continue;
    const { line } = row;
    const code = line.code;
    const id = options.newId();
    if (code !== null) {
      entries.push({
        kind: "course",
        id,
        term: line.term,
        code,
        credits: courseCredits(code, line.credits, options.lookup),
        genEdChoices: genEdChoices(row, code, checks, options.lookup),
        source: "transcript",
        transcript: { title: line.title, via: line.via },
        ...transcriptDetails(row, code, checks, options.lookup),
      });
      // A skipped line brought back never carries a grade (V3 §2.5), even
      // when the parser saw a grade-shaped mark on it.
      if (checks.keepGrades && row.skipped === null && line.grade !== null)
        grades[id] = line.grade;
    } else if (line.term === "before") {
      // Credit keeps its own title, credits and GenEds; "Counts as" adds
      // the course it stands for (V3 §2.10), and the block shows both.
      const countsAs = checks.mappings[row.key];
      entries.push({
        kind: "credit",
        id,
        term: "before",
        title: line.title.slice(0, 120),
        credits: line.credits,
        genEds: [...new Set(pickedCodes(row, checks).values())],
        source: "transcript",
        via: line.via === "umd" ? "transfer" : line.via,
        equivalentPattern: line.equivalentPattern,
        ...(countsAs ? { countsAs } : {}),
      });
    }
    // A UMD term's line always has a code; nothing else can reach here.
  }
  return { entries, grades };
}

/** The columns an import replaces: the doc's done and in-progress ones (V3 §2.10). */
export function importReplaceTerms(
  columns: readonly FourYearTerm[],
  statusOf: StatusOf,
): FourYearTerm[] {
  return columns.filter((t) => statusOf(t) !== "planned");
}

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** The import's toast: "Imported 16 courses from 4 semesters". */
export function importSummary(entries: readonly FourYearEntry[]): string {
  const semesters = new Set(
    entries.filter((e) => e.term !== "before").map((e) => e.term),
  ).size;
  const before = entries.some((e) => e.term === "before");
  const from = [
    semesters > 0 ? plural(semesters, "semester", "semesters") : null,
    before ? "Before UMD" : null,
  ]
    .filter((s) => s !== null)
    .join(" and ");
  return `Imported ${plural(entries.length, "course", "courses")} from ${from}`;
}
