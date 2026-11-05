import { termLabel } from "~/core/catalog/terms";
import { taughtBy } from "~/core/history/query";
import { gradesView, round } from "~/core/mcp/views";
import { matchInstructors } from "~/core/reviews/find";
import {
  instructorNameKey,
  type PlanetTerpDept,
  planetTerpUrl,
} from "~/core/schema";
import type { McpData } from "../data";
import { inBatches, ToolInputError } from "../lookup";

// Instructors: PlanetTerp's ratings and grades, joined to who taught what
// in the instructor history (DATA.md §3.5, §4.1).

async function planetTerpIndexOrFail(data: McpData) {
  const found = await data.planetTerpIndex();
  if (!found)
    throw new Error("The instructor index didn't load. Try again shortly.");
  return found.index;
}

export async function findInstructors(
  data: McpData,
  input: { name: string; limit?: number | undefined },
) {
  const index = await planetTerpIndexOrFail(data);
  const matches = matchInstructors(index.instructors, input.name).slice(
    0,
    input.limit ?? 10,
  );
  if (matches.length === 0)
    throw new ToolInputError(
      `No instructor matches "${input.name}". Try a last name alone. Someone who's never taught a section on record, or who PlanetTerp doesn't list, won't be found.`,
    );
  return {
    instructors: matches.map(([slug, name]) => {
      const entry = index.instructors[slug];
      return {
        slug,
        name,
        departments: entry?.[1] ?? [],
        planetTerpReviews: entry?.[2] ?? null,
      };
    }),
  };
}

export async function getInstructor(
  data: McpData,
  input: { instructor: string },
) {
  const index = await planetTerpIndexOrFail(data);
  const asSlug = input.instructor.trim().toLowerCase();
  let slug = Object.hasOwn(index.instructors, asSlug) ? asSlug : null;
  const matches = matchInstructors(index.instructors, input.instructor);
  // A bare surname can be a slug ("smith") and many people's name at once.
  const alsoMatching = slug
    ? matches
        .filter(([s]) => s !== slug)
        .slice(0, 6)
        .map(([s, n]) => `${n} (${s})`)
    : [];
  if (!slug) {
    const exact = matches.filter(
      ([, name]) =>
        name.toLowerCase() === input.instructor.trim().toLowerCase(),
    );
    if (exact.length === 1 || matches.length === 1)
      slug = (exact[0] ?? matches[0])?.[0] ?? null;
    else if (matches.length === 0)
      throw new ToolInputError(
        `No instructor matches "${input.instructor}". Use umd_find_instructors with part of the name.`,
      );
    else
      throw new ToolInputError(
        `"${input.instructor}" matches ${matches.length} instructors: ${matches
          .slice(0, 8)
          .map(([s, n]) => `${n} (${s})`)
          .join(", ")}. Pass one of their slugs.`,
      );
  }
  if (!slug) throw new ToolInputError("Pass an instructor's name or slug.");
  const entry = index.instructors[slug];
  const depts = entry?.[1] ?? [];
  const files = (
    await inBatches(depts, 8, (d) => data.planetTerpDept(d))
  ).filter((f): f is PlanetTerpDept => f !== null);
  const person = files
    .map((f) => f.instructors[slug])
    .find((p) => p !== undefined);

  // Every spelling the join gave this slug, Testudo's and PlanetTerp's.
  const names = new Set<string>([entry?.[0] ?? slug]);
  for (const f of files)
    for (const [key, s] of Object.entries(f.names))
      if (s === slug) names.add(key);
  const nameKeys = [...names].map(instructorNameKey);

  const grades = files
    .flatMap((f) =>
      Object.entries(f.courses).flatMap(([course, g]) => {
        const record = g.byInstructor[slug];
        return record ? [{ course, ...gradesView(record) }] : [];
      }),
    )
    .sort((a, b) => b.students - a.students)
    .slice(0, 25);

  const [history, terms] = await Promise.all([
    inBatches(depts, 8, (d) => data.historyDept(d)),
    data.terms(),
  ]);
  const rows = taughtBy(history, nameKeys);
  const listed = new Set(
    terms.filter((t) => t.status === "active").map((t) => t.id),
  );
  const byCourse = new Map<string, { title: string | null; terms: string[] }>();
  for (const row of rows) {
    const c = byCourse.get(row.course) ?? { title: row.title, terms: [] };
    c.terms.push(termLabel(row.termId));
    byCourse.set(row.course, c);
  }
  return {
    slug,
    name: person?.name ?? entry?.[0] ?? slug,
    type: person?.type ?? null,
    rating:
      person?.rating === null || person?.rating === undefined
        ? null
        : round(person.rating, 2),
    reviews: person?.reviewCount ?? 0,
    departments: depts,
    teachingNow: rows
      .filter((r) => listed.has(r.termId))
      .map(
        (r) =>
          `${termLabel(r.termId)}: ${r.course}${r.sections.length > 0 ? ` (sections ${r.sections.join(", ")})` : ""}`,
      ),
    courses: [...byCourse].slice(0, 30).map(([course, c]) => ({
      course,
      title: c.title,
      termsTaught: c.terms.length,
      latest: c.terms[0] ?? null,
    })),
    grades,
    links: { planetterp: planetTerpUrl(slug) },
    ...(alsoMatching.length > 0
      ? {
          alsoMatching: `"${input.instructor}" is this instructor's slug, and also matches: ${alsoMatching.join(", ")}. Pass one of their slugs for them.`,
        }
      : {}),
    note: "Ratings are PlanetTerp's student reviews (1–5). Grades are PlanetTerp's per-course totals for this instructor; they say what students got, not how hard the course is.",
  };
}
