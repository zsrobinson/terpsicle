import type { QueryClient } from "@tanstack/react-query";
import type {
  AcademicCalendar,
  Course,
  CourseCode,
  CourseSearchRow,
  Term,
  TermId,
} from "~/core/schema";
import { pageSource } from "~/lib/published-source";
import {
  calendarQuery,
  deptChunkQuery,
  manifestQuery,
  termsQuery,
} from "~/state/query/catalog";
import { ensureCourseSearch } from "~/state/query/course-index";

// What Chat reads from published data (DATA.md §2): the terms, a term's
// manifest and the departments of the courses the list shows, the course
// index's search file, and the academic calendars for Now and Next. Every
// file goes through its published query (~/state/query) in the page's one
// QueryClient (docs/decisions.md, "TanStack Query for server data"), so
// Chat shares Schedule's, Plan's and Home's copies, reads a manifest once
// a page (and again only once it's stale), and shows what this device
// saved at once. Loaded on first use (./chat-data.ts, ./queries.ts), so
// /chat's first load carries neither the stores nor the persister
// (scripts/check-bundle.ts).

/** Every term, newest first. */
export async function readTerms(client: QueryClient): Promise<Term[]> {
  const source = await pageSource();
  const file = await client.ensureQueryData({
    ...termsQuery(source),
    revalidateIfStale: true,
  });
  return [...file.terms].sort((a, b) => b.id.localeCompare(a.id));
}

/**
 * Some courses of a term, reading only their departments' files. Throws
 * when the manifest or one of those files can't be read.
 */
export async function readCourses(
  client: QueryClient,
  termId: TermId,
  codes: Iterable<CourseCode>,
): Promise<Map<CourseCode, Course>> {
  const source = await pageSource();
  const manifest = await client.ensureQueryData({
    ...manifestQuery(source, termId),
    revalidateIfStale: true,
  });
  const wanted = new Set(codes);
  const depts = new Set([...wanted].map((c) => c.slice(0, 4)));
  const out = new Map<CourseCode, Course>();
  await Promise.all(
    manifest.departments
      .filter((d) => depts.has(d.code))
      .map(async (d) => {
        const chunk = await client.ensureQueryData(
          deptChunkQuery(source, termId, d),
        );
        for (const course of chunk.courses)
          if (wanted.has(course.code)) out.set(course.code, course);
      }),
  );
  return out;
}

/** Every course's code and title, any term: the course index's search file. */
export async function readCourseSearch(
  client: QueryClient,
): Promise<readonly CourseSearchRow[]> {
  return ensureCourseSearch(client, await pageSource());
}

/** A term's academic calendar; null when there's none (yet), or it can't be read. */
export async function readCalendar(
  client: QueryClient,
  termId: TermId,
): Promise<AcademicCalendar | null> {
  try {
    return await client.ensureQueryData({
      ...calendarQuery(await pageSource(), termId),
      revalidateIfStale: true,
    });
  } catch {
    return null;
  }
}
