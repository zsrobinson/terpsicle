// `fits_with` and `days_off` (docs/MCP.md): "what fits around these
// classes", by the scheduler's own fit check (Search's "Fits my plan",
// src/core/fit): overlaps, and enough time to walk between buildings at
// the given pace. A tight walk still fits there, as in the app; only
// umd_check_schedule flags it.
import { buildCatalogIndex } from "~/core/catalog/catalog-index";
import {
  buildFitContext,
  type FitContext,
  fitLabel,
  sectionFits,
} from "~/core/fit";
import { planOfSections } from "~/core/mcp/schedule";
import type {
  Course,
  CourseCode,
  Day,
  Section,
  TermId,
  TravelSettings,
} from "~/core/schema";
import { resultFitWords } from "~/core/search";
import { meetsOnAny } from "~/core/time/week";
import type { McpData } from "./data";
import { inBatches, readSectionKey, ToolInputError } from "./lookup";

/** Sections to fit around, ready to check others against. */
export type FitsWith = {
  readonly ctx: FitContext;
  /** Their courses: never a result of their own. */
  readonly courses: ReadonlySet<CourseCode>;
};

/** One section per course, all in the term, or an error that says which isn't. */
export async function fitsWith(
  data: McpData,
  termId: TermId,
  termName: string,
  keys: readonly string[],
  travel: TravelSettings,
  now: string,
): Promise<FitsWith | null> {
  if (keys.length === 0) return null;
  const parsed = keys.map(readSectionKey);
  const codes = parsed.map((k) => k.slice(0, k.indexOf("-")));
  const twice = codes.find((c, i) => codes.indexOf(c) !== i);
  if (twice)
    throw new ToolInputError(
      `fits_with names two sections of ${twice}; give one section per course.`,
    );
  const courses = await inBatches(codes, 8, (c) => data.course(termId, c));
  const placed: { course: Course; section: Section }[] = [];
  const missing: string[] = [];
  parsed.forEach((key, i) => {
    const course = courses[i];
    const section = course?.sections.find(
      (s) => s.code === key.slice(key.indexOf("-") + 1),
    );
    if (course && section) placed.push({ course, section });
    else missing.push(key);
  });
  if (missing.length > 0)
    throw new ToolInputError(
      `${termName} has no section ${missing.join(", ")}. umd_get_sections lists a course's sections.`,
    );
  const ctx = buildFitContext({
    plan: planOfSections(termId, placed, now),
    index: buildCatalogIndex(
      termId,
      placed.map((p) => p.course),
    ),
    blocks: [],
    travel,
    campus: await data.campus(),
  });
  return { ctx, courses: new Set(codes) };
}

/** A section passes both: it fits around `fits` (when given) and meets on none of `daysOff`. */
export function passes(
  fits: FitsWith | null,
  daysOff: readonly Day[],
  course: Course,
  section: Section,
): boolean {
  if (meetsOnAny(course.code, section, daysOff)) return false;
  return !fits || sectionFits(fits.ctx, course, section);
}

/** "Fits", "Overlaps CMSC330", "Not enough time after ARTT210", "No set times". */
export function fitWords(
  fits: FitsWith,
  course: Course,
  section: Section,
): string {
  const label = fitLabel(fits.ctx, course, section);
  return (
    resultFitWords(label) ??
    (label.kind === "no-set-times" ? "No set times" : "Already in fits_with")
  );
}

/** The scheduler's travel settings from a tool's `pace` and `accessible`. */
export function travelOf(input: {
  pace?: TravelSettings["pace"] | undefined;
  accessible?: boolean | undefined;
}): TravelSettings {
  return {
    pace: input.pace ?? "typical",
    accessible: input.accessible ?? false,
    extraMinutes: 0,
  };
}
