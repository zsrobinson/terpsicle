import {
  type Course,
  CourseCodeSchema,
  type DeptChunk,
  DeptChunkSchema,
  SCHEMA_VERSIONS,
  type SeatTuple,
  type SectionKey,
  sectionKey,
} from "~/core/schema";
import { normalizeCourse, normalizeSections } from "./normalize";
import type { RawDepartmentPage } from "./parse-department";
import type { RawCourseSections } from "./parse-sections";

export interface BuiltDepartment {
  chunk: DeptChunk;
  seats: Map<SectionKey, SeatTuple>;
  /** Courses and sections that couldn't be published, with why. */
  skipped: string[];
}

/**
 * A department page plus its sections → a validated chunk. Throws a specific
 * error if the result doesn't match the schema; the caller keeps the old chunk.
 */
export function buildDeptChunk(
  termId: string,
  dept: string,
  page: RawDepartmentPage,
  sections: readonly RawCourseSections[],
): BuiltDepartment {
  const byCourse = new Map(sections.map((s) => [s.course.toUpperCase(), s]));
  const seats = new Map<SectionKey, SeatTuple>();
  const skipped: string[] = [];
  const courses: Course[] = [];
  const seen = new Set<string>();

  for (const raw of page.courses) {
    const code = raw.code.toUpperCase();
    if (!CourseCodeSchema.safeParse(code).success || !code.startsWith(dept)) {
      skipped.push(`course id "${raw.code}" isn't a ${dept} course code`);
      continue;
    }
    if (seen.has(code)) continue;
    seen.add(code);
    const rawSections = byCourse.get(code);
    const normalized = rawSections
      ? normalizeSections(rawSections)
      : { sections: [], seats: new Map<string, SeatTuple>(), skipped: [] };
    skipped.push(...normalized.skipped);
    for (const [section, tuple] of normalized.seats) {
      seats.set(sectionKey(code, section), tuple);
    }
    courses.push(normalizeCourse(raw, normalized.sections));
  }
  courses.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));

  const candidate = {
    schemaVersion: SCHEMA_VERSIONS.catalog,
    termId,
    dept,
    courses,
  };
  const parsed = DeptChunkSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue ? describePath(candidate, issue.path) : "";
    throw new Error(
      `${termId} ${dept}: the parsed department doesn't match DeptChunkSchema at ${where}: ${issue?.message ?? "unknown"}`,
    );
  }
  return { chunk: parsed.data, seats, skipped };
}

/** "courses[3] CMSC131 → sections[2] 0103 → meetings[0].end" for error messages. */
function describePath(root: unknown, path: readonly PropertyKey[]): string {
  let node: unknown = root;
  const parts: string[] = [];
  for (const key of path) {
    node = (node as Record<PropertyKey, unknown> | undefined)?.[key];
    const code = (node as { code?: unknown } | undefined)?.code;
    parts.push(
      typeof key === "number"
        ? `[${key}]${typeof code === "string" ? ` ${code}` : ""}`
        : `.${String(key)}`,
    );
  }
  return parts.join("") || "(root)";
}
