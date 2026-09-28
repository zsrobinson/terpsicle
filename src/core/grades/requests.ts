import { seasonSpan, termLabel } from "../catalog/terms";
import type { IsoDate, TermId } from "../schema";

// Grade data comes from the university itself: PlanetTerp asks for each
// semester's grade distributions with a Maryland Public Information Act
// request, which the Office of General Counsel handles and the Office of
// Institutional Research, Planning and Assessment (IRPA) fills with a
// spreadsheet (planetterp.com/about; PlanetTerp's importgradedata command,
// github.com/planetterp/PlanetTerp). The admin's Grade data page lists the
// semesters nobody has imported yet and the words of a standard request.

/** Where a request goes (ogc.umd.edu, "Public Information Requests"). */
export const PIA_EMAIL = "PublicInformationAct@umd.edu";
export const PIA_PORTAL = "https://www.umd.edu/pia";

/**
 * The columns IRPA's spreadsheet has, one row per section, as PlanetTerp's
 * import reads them.
 */
export const GRADE_REPORT_COLUMNS = [
  "Course",
  "Section",
  "Instructor (Last, First)",
  "Students",
  "A+",
  "A",
  "A-",
  "B+",
  "B",
  "B-",
  "C+",
  "C",
  "C-",
  "D+",
  "D",
  "D-",
  "F",
  "W",
  "Other",
] as const;

/** The semester after this one that has grade data: spring and fall only. */
function nextGradedTerm(termId: TermId): TermId {
  const year = Number(termId.slice(0, 4));
  return termId.slice(4) === "08" ? `${year + 1}01` : `${year}08`;
}

/**
 * Fall and spring semesters that are over by `today` and newer than
 * `gradesThrough`, oldest first: the ones to ask for. Summer and winter
 * aren't in the university's releases. With nothing imported yet, the last
 * two finished semesters.
 */
export function semestersMissingGrades(
  gradesThrough: TermId | null,
  today: IsoDate,
): TermId[] {
  const over = (termId: TermId) => seasonSpan(termId).end < today;
  const year = Number(today.slice(0, 4));
  let termId: TermId = gradesThrough
    ? nextGradedTerm(gradesThrough)
    : `${year - 1}01`;
  const out: TermId[] = [];
  while (over(termId)) {
    out.push(termId);
    termId = nextGradedTerm(termId);
  }
  return gradesThrough ? out : out.slice(-2);
}

/** "Fall 2025 and Spring 2026" */
function termList(terms: readonly TermId[]): string {
  const names = terms.map(termLabel);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** The subject and body of a standard request for `terms`. */
export function gradeRequestText(terms: readonly TermId[]): {
  subject: string;
  body: string;
} {
  const which = termList(terms);
  return {
    subject: `Public Information Act request: grade distributions, ${which}`,
    body: [
      "Hello,",
      "",
      `Under the Maryland Public Information Act (General Provisions Article, § 4-101 et seq.), I'm requesting the grade distribution of every course section at the University of Maryland, College Park, for ${which}.`,
      "",
      `For each section, please include the course, the section number, the instructor of record, the number of students, and how many of each grade were given: ${GRADE_REPORT_COLUMNS.slice(4).join(", ")}. I'm not asking for any student's name or other identifying information.`,
      "",
      "This is the report the Office of Institutional Research, Planning and Assessment has provided for earlier semesters. A spreadsheet (CSV or Excel) is ideal.",
      "",
      "The data will be published for free on a student-run course planning site, so I ask that fees be waived as in the public interest. If there will be a fee, please tell me the amount before the work begins.",
      "",
      "Thank you,",
    ].join("\n"),
  };
}
