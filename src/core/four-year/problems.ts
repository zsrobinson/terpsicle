import {
  type CourseCode,
  type Message,
  SEVERITY_ORDER,
  type TermId,
} from "../schema";
import {
  FOUR_YEAR_PROBLEM_SEVERITY,
  type FourYearCourseEntry,
  type FourYearCreditEntry,
  type FourYearDoc,
  type FourYearEntry,
  type FourYearFix,
  type FourYearProblem,
  type FourYearProblemKind,
  type FourYearSubject,
} from "../schema/four-year";
import {
  countsAsCode,
  detailsFromCourse,
  type FourYearCourses,
  honorsBase,
  isRepeatable,
  isUnknownCourse,
} from "./course-lookup";
import { columnSummary, earnedNothing, FULL_TIME_CREDITS } from "./credits";
import { displayTitle } from "./display-title";
import { firstSemesterMeetingPrereqs, unmetPrereqGroups } from "./prereqs";
import { moveEntry, removeEntry, setEntryDetails } from "./reducer";
import type { StatusOf } from "./status";
import {
  compareFourYearTerms,
  fourYearColumns,
  fourYearTermLabel,
  isSemester,
  previousSemester,
} from "./terms";

// Plan's problems (docs/V3.md §2.8): information, never a block. A fix is
// offered only when applying it creates no new problem, the scheduler's rule.

export type FourYearProblemsInput = {
  readonly doc: FourYearDoc;
  readonly lookup: FourYearCourses;
  readonly statusOf: StatusOf;
  /** The newest term Testudo lists, for `not-offered-lately`; null skips that check. */
  readonly latestTermId: TermId | null;
};

/** How many recent fall and spring semesters `not-offered-lately` looks back. */
export const RECENT_SEMESTERS = 4;

const text = (t: string) => ({ kind: "text", text: t }) as const;
const course = (courseCode: CourseCode) =>
  ({ kind: "course", courseCode }) as const;

function subjectId(s: FourYearSubject): string {
  return s.kind === "entry" ? s.entryId : s.term;
}

function problem(
  kind: FourYearProblemKind,
  subjects: [FourYearSubject, ...FourYearSubject[]],
  title: Message,
  detail: Message,
  fix: FourYearFix | null = null,
): FourYearProblem {
  return {
    id: `${kind}:${subjects.map(subjectId).join(":")}`,
    severity: FOUR_YEAR_PROBLEM_SEVERITY[kind],
    kind,
    subjects,
    title,
    detail,
    fix,
  };
}

/** "CMSC131 or CMSC133", with each code as a course part. */
function alternatives(group: readonly CourseCode[]): Message {
  return group.flatMap((code, i) =>
    i === 0 ? [course(code)] : [text(" or "), course(code)],
  );
}

function testudoSays(sentence: string | null): Message {
  return sentence ? [text(`Testudo says: ${sentence}`)] : [];
}

function prereqProblems(
  { doc, lookup, statusOf }: FourYearProblemsInput,
  entry: FourYearCourseEntry,
): FourYearProblem[] {
  // History can't be fixed, and AP and transfer credit has no order to check.
  if (entry.term === "before" || statusOf(entry.term) === "done") return [];
  const unmet = unmetPrereqGroups(doc, entry, lookup);
  const first = unmet[0];
  if (!first) return [];
  const later = doc.entries.flatMap((e) => {
    const code = countsAsCode(lookup, e);
    return code !== null &&
      first.includes(code) &&
      compareFourYearTerms(e.term, entry.term) >= 0
      ? [{ term: e.term, code }]
      : [];
  })[0];
  let title: Message;
  if (unmet.length === 1 && later)
    title = [
      course(entry.code),
      text(
        later.term === entry.term
          ? " is in the same semester as "
          : " is before ",
      ),
      course(later.code),
    ];
  else {
    const needs: Message = unmet.flatMap((group, i) => [
      ...(i === 0
        ? []
        : [text(unmet.some((g) => g.length > 1) ? ", and " : " and ")]),
      ...alternatives(group),
    ]);
    title = [course(entry.code), text(" needs "), ...needs, text(" first")];
  }
  const target = firstSemesterMeetingPrereqs(doc, entry, lookup);
  const fix: FourYearFix | null =
    target && target !== entry.term
      ? {
          kind: "move",
          entryId: entry.id,
          term: target,
          label: `Move ${entry.code} to ${fourYearTermLabel(target)}`,
        }
      : null;
  const sentence = lookup.courses.get(entry.code)?.prerequisite ?? null;
  return [
    problem(
      "prereq-order",
      [{ kind: "entry", entryId: entry.id }],
      title,
      testudoSays(sentence),
      fix,
    ),
  ];
}

function lightSemesterProblems({
  doc,
  lookup,
  statusOf,
}: FourYearProblemsInput): FourYearProblem[] {
  const out: FourYearProblem[] = [];
  for (const term of fourYearColumns(doc)) {
    if (!isSemester(term) || statusOf(term) !== "planned") continue;
    const { credits } = columnSummary(doc, term, lookup);
    if (credits <= 0 || credits >= FULL_TIME_CREDITS) continue;
    out.push(
      problem(
        "light-semester",
        [{ kind: "term", term }],
        [
          text(
            `${fourYearTermLabel(term)} has ${credits} ${credits === 1 ? "credit" : "credits"}.`,
          ),
        ],
        [text(`Full time is ${FULL_TIME_CREDITS}.`)],
      ),
    );
  }
  return out;
}

function repeatedProblems({
  doc,
  lookup,
  statusOf,
}: FourYearProblemsInput): FourYearProblem[] {
  const out: FourYearProblem[] = [];
  const firstSeen = new Map<CourseCode, FourYearEntry>();
  for (const entry of doc.entries) {
    // Credit that counts as a course repeats it like the course would.
    const code = countsAsCode(lookup, entry);
    if (code === null) continue;
    const info = lookup.courses.get(code);
    if (info && isRepeatable(info)) continue;
    const earlier = firstSeen.get(code);
    // Retaking a course that earned nothing is the point of a retake.
    if (!earlier || earnedNothing(doc, earlier)) {
      firstSeen.set(code, entry);
      continue;
    }
    const fix: FourYearFix | null =
      statusOf(entry.term) === "done"
        ? null
        : { kind: "remove", entryId: entry.id, label: "Remove the later one" };
    out.push(
      problem(
        "repeated-course",
        [
          { kind: "entry", entryId: entry.id },
          { kind: "entry", entryId: earlier.id },
        ],
        [
          course(code),
          text(
            earlier.term === entry.term
              ? ` is in ${fourYearTermLabel(entry.term)} twice`
              : ` is in ${fourYearTermLabel(earlier.term)} and ${fourYearTermLabel(entry.term)}`,
          ),
        ],
        [
          text(
            "It counts once toward your credits. Testudo doesn't list it as repeatable.",
          ),
        ],
        fix,
      ),
    );
  }
  return out;
}

function unknownProblem(
  lookup: FourYearCourses,
  entry: FourYearCourseEntry,
): FourYearProblem {
  const base = honorsBase(lookup, entry.code);
  if (base)
    return problem(
      "unknown-course",
      [{ kind: "entry", entryId: entry.id }],
      [course(entry.code), text(" isn't in Testudo")],
      [
        text("Testudo doesn't list it anymore, but it lists "),
        course(base.code),
        text(
          `, ${base.title}. Count it as that for its GenEds and prerequisites.`,
        ),
      ],
      {
        kind: "details",
        code: entry.code,
        details: detailsFromCourse(base),
        credits: entry.credits ?? base.credits.min,
        label: `Count it as ${base.code}`,
      },
    );
  return problem(
    "unknown-course",
    [{ kind: "entry", entryId: entry.id }],
    [course(entry.code), text(" isn't in Testudo")],
    [
      text(
        "Check the code. If it's an older course Testudo doesn't list anymore, add its course info so its credits and GenEds count, and say what it counts as.",
      ),
    ],
  );
}

/** "CHEM1XX" → "CHEM 1XX", as Testudo prints it. */
function patternLabel(pattern: string): string {
  return `${pattern.slice(0, 4)} ${pattern.slice(4)}`;
}

/**
 * Transfer or AP credit Testudo gave as a department's level ("CHEM 1XX")
 * rather than a course: it meets no prerequisite until the person says which
 * course it counts as. Saying (a course, or none) answers it.
 */
function unmatchedCreditProblem(entry: FourYearCreditEntry): FourYearProblem[] {
  const pattern = entry.equivalentPattern;
  if (!pattern || entry.countsAs !== undefined) return [];
  const dept = pattern.slice(0, 4);
  const digit = pattern.charAt(4);
  const kind = /\d/.test(digit) ? `${digit}00-level ${dept}` : dept;
  return [
    problem(
      "unmatched-credit",
      [{ kind: "entry", entryId: entry.id }],
      [
        text(
          `${displayTitle(entry.title)} came in as ${patternLabel(pattern)}`,
        ),
      ],
      [
        text(
          `Testudo counts it as a ${kind} course without naming one, so it meets no prerequisites. If your degree audit names the course, say which.`,
        ),
      ],
    ),
  ];
}

/** The last `RECENT_SEMESTERS` fall and spring semesters up to `latest`. */
export function recentSemesters(latest: TermId): TermId[] {
  const out: TermId[] = [];
  let term = isSemester(latest) ? latest : previousSemester(latest);
  while (out.length < RECENT_SEMESTERS) {
    out.push(term);
    term = previousSemester(term);
  }
  return out;
}

function notOfferedProblem(
  { lookup, statusOf, latestTermId }: FourYearProblemsInput,
  entry: FourYearCourseEntry,
): FourYearProblem[] {
  if (latestTermId === null || statusOf(entry.term) !== "planned") return [];
  const info = lookup.courses.get(entry.code);
  const last = info?.offered[0];
  if (!info || last === undefined) return [];
  const recent = new Set(recentSemesters(latestTermId));
  if (info.offered.some((t) => recent.has(t))) return [];
  return [
    problem(
      "not-offered-lately",
      [{ kind: "entry", entryId: entry.id }],
      [
        course(entry.code),
        text(` was last offered ${fourYearTermLabel(last)}`),
      ],
      [
        text(
          `Testudo hasn't listed it in the last ${RECENT_SEMESTERS} fall and spring semesters.`,
        ),
      ],
    ),
  ];
}

/** Every problem, before fixes are checked. */
function rawProblems(input: FourYearProblemsInput): FourYearProblem[] {
  const out: FourYearProblem[] = [];
  for (const entry of input.doc.entries) {
    if (entry.kind === "credit") out.push(...unmatchedCreditProblem(entry));
    if (entry.kind !== "course") continue;
    if (isUnknownCourse(input.lookup, entry.code)) {
      // Details answer it: the person has said what the course was.
      if (!entry.details) out.push(unknownProblem(input.lookup, entry));
      continue;
    }
    out.push(
      ...prereqProblems(input, entry),
      ...notOfferedProblem(input, entry),
    );
  }
  out.push(...repeatedProblems(input), ...lightSemesterProblems(input));
  return out;
}

/** The doc with a fix applied: what "Move", "Remove" and "Count it as" would do. */
export function applyFourYearFix(
  doc: FourYearDoc,
  fix: FourYearFix,
): FourYearDoc {
  if (fix.kind === "move") return moveEntry(doc, fix.entryId, fix.term);
  if (fix.kind === "remove") return removeEntry(doc, fix.entryId);
  return setEntryDetails(doc, fix.code, fix.details, fix.credits);
}

/**
 * The doc's problems, warnings first and then in plan order. A fix stays
 * only when applying it adds no problem that wasn't there before.
 */
export function detectFourYearProblems(
  input: FourYearProblemsInput,
): FourYearProblem[] {
  const raw = rawProblems(input);
  const before = new Set(raw.map((p) => p.id));
  const checked = raw.map((p) => {
    if (!p.fix) return p;
    const after = rawProblems({
      ...input,
      doc: applyFourYearFix(input.doc, p.fix),
    });
    const adds = after.some((q) => !before.has(q.id));
    return adds ? { ...p, fix: null } : p;
  });
  const rank = (p: FourYearProblem) => SEVERITY_ORDER.indexOf(p.severity);
  return checked
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i)
    .map(({ p }) => p);
}
