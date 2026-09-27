import { KNOWN_GEN_EDS } from "../catalog/wildcard";
import type { LocalId, TermId } from "../schema";
import type {
  FourYearDoc,
  FourYearTemplate,
  FourYearTemplateEntry,
} from "../schema/four-year";
import type { FourYearCourses } from "./course-lookup";
import { FULL_TIME_CREDITS } from "./credits";
import type {
  FourYearEntryDraft,
  FourYearTemplateRef,
  FourYearTemplateSemesters,
} from "./reducer";
import { fourYearTermLabel, semesterIds } from "./terms";

// Sample plans (docs/V3.md §2.11): a major's semesters, hand-curated as JSON
// in `src/features/four-year/templates/`. A template's semesters count from
// the plan's first semester, and adding one fills empty semesters only: it
// never moves, replaces or removes anything a person has (the reducer's
// `apply-template`).

/** What a doc keeps about the template it came from, for its credit line. */
export function templateRef(template: FourYearTemplate): FourYearTemplateRef {
  return {
    id: template.id,
    department: template.department,
    year: template.year,
  };
}

/** The template's blocks, ready for `apply-template`: new ids, marked as from a template. */
export function templateSemesters(
  template: FourYearTemplate,
  newId: () => LocalId,
): FourYearTemplateSemesters {
  return template.semesters.map((semester) => ({
    index: semester.index,
    entries: semester.entries.map(
      (entry): FourYearEntryDraft =>
        entry.kind === "course"
          ? {
              kind: "course",
              id: newId(),
              code: entry.code,
              credits: null,
              genEdChoices: {},
              source: "template",
              transcript: null,
            }
          : {
              kind: "wildcard",
              id: newId(),
              wildcard: entry.wildcard,
              credits: entry.credits,
              source: "template",
            },
    ),
  }));
}

export type TemplateFit = {
  /** Empty semesters the template fills, in order. */
  readonly fills: readonly TermId[];
  /** Semesters it names that already have something, so it leaves them alone. */
  readonly keeps: readonly TermId[];
};

/** Where a template would land in a doc: which semesters it fills and which it leaves. */
export function templateFit(
  doc: Pick<FourYearDoc, "firstTermId" | "entries">,
  template: Pick<FourYearTemplate, "semesters">,
): TemplateFit {
  const semesters = semesterIds(doc.firstTermId);
  const used = new Set<string>(doc.entries.map((e) => e.term));
  const fills: TermId[] = [];
  const keeps: TermId[] = [];
  for (const { index } of [...template.semesters].sort(
    (a, b) => a.index - b.index,
  )) {
    const term = semesters[index];
    if (term === undefined) continue;
    (used.has(term) ? keeps : fills).push(term);
  }
  return { fills, keeps };
}

/** Every credit the template lays out, as its semesters say. */
export function templateCredits(
  template: Pick<FourYearTemplate, "semesters">,
): number {
  return template.semesters.reduce((sum, s) => sum + s.credits, 0);
}

function listTerms(terms: readonly TermId[]): string {
  const labels = terms.map(fourYearTermLabel);
  if (labels.length <= 2) return labels.join(" and ");
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

/** "Fills 6 empty semesters. Fall 2026 and Spring 2027 have courses, so they stay as they are." */
export function templateFitSentence(fit: TemplateFit): string {
  const n = fit.fills.length;
  const fills =
    n === 0
      ? "Every semester it covers already has courses, so there's nothing to fill."
      : `Fills ${n === 1 ? "1 empty semester" : `${n} empty semesters`}, from ${fourYearTermLabel(fit.fills[0] ?? "before")}.`;
  if (n === 0 || fit.keeps.length === 0) return fills;
  const kept =
    fit.keeps.length === 1
      ? "has courses, so it stays as it is."
      : "have courses, so they stay as they are.";
  return `${fills} ${listTerms(fit.keeps)} ${kept}`;
}

/** The toast after adding one: "Added the Computer Science sample plan to 8 semesters". */
export function templateAddedLabel(
  template: Pick<FourYearTemplate, "name">,
  semesters: number,
): string {
  return `Added the ${template.name} sample plan to ${semesters === 1 ? "1 semester" : `${semesters} semesters`}`;
}

function entryWords(entry: FourYearTemplateEntry): string {
  return entry.kind === "course"
    ? entry.code
    : entry.wildcard.kind === "pattern"
      ? entry.wildcard.pattern
      : `the ${entry.wildcard.code} placeholder`;
}

/**
 * What's wrong with a template against the course index, for the template
 * test and for anyone curating the next one: every course is one Testudo
 * knows with fixed credits, every GenEd placeholder is a GenEd UMD uses, each
 * semester's blocks add up to the credits it states and is full time, and the
 * source is https. Empty when it's sound.
 */
export function checkTemplate(
  template: FourYearTemplate,
  lookup: FourYearCourses,
): string[] {
  const out: string[] = [];
  if (!template.sourceUrl.startsWith("https://"))
    out.push(`${template.id}: the source link isn't https.`);
  for (const semester of template.semesters) {
    const where = `${template.id}, semester ${semester.index}`;
    let sum = 0;
    for (const entry of semester.entries) {
      if (entry.kind === "wildcard") {
        if (
          entry.wildcard.kind === "gen-ed" &&
          !KNOWN_GEN_EDS.includes(entry.wildcard.code)
        )
          out.push(`${where}: ${entry.wildcard.code} isn't a GenEd UMD uses.`);
        sum += entry.credits;
        continue;
      }
      const course = lookup.courses.get(entry.code);
      if (!course) {
        out.push(`${where}: ${entryWords(entry)} isn't in the course index.`);
        continue;
      }
      if (course.credits.min !== course.credits.max)
        out.push(
          `${where}: ${entry.code} has variable credits, so the sample can't say how many.`,
        );
      sum += course.credits.min;
    }
    if (sum !== semester.credits)
      out.push(
        `${where}: its blocks add up to ${sum} credits, not the ${semester.credits} it says.`,
      );
    if (semester.credits < FULL_TIME_CREDITS)
      out.push(
        `${where}: ${semester.credits} credits is less than full time (${FULL_TIME_CREDITS}).`,
      );
  }
  return out;
}
