// Reading an agent's arguments against the data (docs/MCP.md): terms,
// course codes and instructors, each with an error that says what to try
// instead. An error here becomes the tool's answer with `isError`, so the
// agent can correct itself; it is never a protocol error.
import { termLabel } from "~/core/catalog/terms";
import { defaultTerm, readTermInput } from "~/core/mcp/terms";
import { matchCourses } from "~/core/reviews/find";
import {
  type CourseCode,
  CourseCodeSchema,
  type DeptCode,
  parseSectionKey,
  type SectionKey,
  type Term,
  type TermId,
} from "~/core/schema";
import type { McpData } from "./data";

/** A mistake in what the agent asked for, in words it can act on. */
export class ToolInputError extends Error {}

/** "Spring 2027 (<id>), Fall 2026 (<id>)": the terms Testudo lists, by name and id. */
export function listedTermsWords(terms: readonly Term[]): string {
  return terms
    .filter((t) => t.status === "active")
    .map((t) => `${t.name} (${t.id})`)
    .join(", ");
}

/**
 * The term a catalog tool reads: the one asked for, which must be a term
 * Testudo has listed, or the default one.
 */
export async function catalogTerm(
  data: McpData,
  input: string | undefined,
): Promise<{ term: Term; terms: Term[] }> {
  const terms = await data.terms();
  if (terms.length === 0)
    throw new Error("The term list didn't load. Try again in a minute.");
  if (input === undefined || input.trim() === "") {
    const term = defaultTerm(terms);
    if (!term) throw new Error("No term to read.");
    return { term, terms };
  }
  const id = readTermInput(input);
  if (!id)
    throw new ToolInputError(
      `"${input}" isn't a term. Write a name like "Fall 2027" or an id (YYYYMM: the year, then 01 spring, 05 summer, 08 fall or 12 winter). Terms with sections: ${listedTermsWords(terms)}.`,
    );
  const term = terms.find((t) => t.id === id);
  if (!term)
    throw new ToolInputError(
      `Testudo doesn't list sections for ${termLabel(id)}. Terms with sections: ${listedTermsWords(terms)}. For whether a course is likely to run in a later term, use umd_check_offerings.`,
    );
  return { term, terms };
}

/** Any term id, listed or not (check_offerings looks ahead). */
export function anyTerm(input: string): TermId {
  const id = readTermInput(input);
  if (!id)
    throw new ToolInputError(
      `"${input}" isn't a term. Write a name like "Fall 2027" or an id (YYYYMM: the year, then 01 spring, 05 summer, 08 fall or 12 winter).`,
    );
  return id;
}

/** "cmsc 351" → "CMSC351"; an error that names the format otherwise. */
export function readCourseCode(input: string): CourseCode {
  const compact = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const parsed = CourseCodeSchema.safeParse(compact);
  if (!parsed.success)
    throw new ToolInputError(
      `"${input}" isn't a course code. Codes are a 4-letter department and 3 digits, sometimes with a letter: CMSC351, ENGL101, CMSC250H. To find a course by name, use umd_search_courses.`,
    );
  return parsed.data;
}

/** "No course CMSC13X. Did you mean CMSC131, CMSC132?": codes near `code` in the course index. */
export async function unknownCourse(
  data: McpData,
  code: CourseCode,
): Promise<ToolInputError> {
  const search = await data.courseSearchRows();
  const near = search
    ? matchCourses(search.rows, code.slice(0, 7))
        .slice(0, 5)
        .map(([c, title]) => `${c} (${title})`)
    : [];
  return new ToolInputError(
    `No course ${code} on record.${near.length > 0 ? ` Did you mean ${near.join(", ")}?` : ""} Use umd_search_courses to find a course by name.`,
  );
}

export function deptOf(code: CourseCode): DeptCode {
  return code.slice(0, 4);
}

/** Up to `limit` at once, in order: a bounded fan-out over R2. */
export async function inBatches<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += limit)
    out.push(...(await Promise.all(items.slice(i, i + limit).map(run))));
  return out;
}

/** "cmsc351 0101", "CMSC 351-0101", "CMSC351-0101" → "CMSC351-0101". */
export function readSectionKey(input: string): SectionKey {
  const text = input.trim().toUpperCase();
  // The section is the last group of letters and digits; the course is the rest.
  const match = /^(.*?)[\s-]*([A-Z0-9]{3,4})$/.exec(text);
  const course = (match?.[1] ?? "").replace(/[^A-Z0-9]/g, "");
  const section = match?.[2] ?? "";
  if (!match || course.length < 7)
    throw new ToolInputError(
      `"${input}" isn't a section. Write the course and its section, like CMSC351-0101; umd_get_sections lists a course's sections.`,
    );
  const key = `${course}-${section.padStart(4, "0")}`;
  if (!parseSectionKey(key))
    throw new ToolInputError(
      `"${input}" isn't a section. Write the course and its section, like CMSC351-0101; umd_get_sections lists a course's sections.`,
    );
  return key;
}
