import { formatGpa, formatShare, gradeSummary } from "../grades/grades";
import { combineRatings, formatStars } from "../reviews/combine";
import type { CoursePageData, InstructorPageData } from "../reviews/pages";
import type { TaughtOnlyPageData } from "../reviews/taught-only";
import { countWords, listWords } from "../words";
import {
  breadcrumbJsonLd,
  courseJsonLd,
  type JsonLd,
  personJsonLd,
} from "./json-ld";
import {
  coursePath,
  instructorPath,
  reviewsHomePath,
  SITE_NAME,
  siteUrl,
} from "./site";

// Each public page's <head>: title, description, canonical URL, link previews
// (Open Graph, Twitter) and JSON-LD, in the shape a TanStack route's `head()`
// returns. Pure, so the words are tested once and the server and the browser
// agree.

export type HeadMeta =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string }
  | { "script:ld+json": JsonLd };

export interface PageHead {
  meta: HeadMeta[];
  links: { rel: string; href: string }[];
}

/** Search engines cut descriptions at about this many characters. */
export const DESCRIPTION_MAX = 160;

/** The sentences that fit in `max` characters, in order; the first always. */
export function clipSentences(
  sentences: readonly (string | null)[],
  max = DESCRIPTION_MAX,
): string {
  let out = "";
  for (const s of sentences) {
    if (!s) continue;
    const next = out ? `${out} ${s}` : s;
    if (out && next.length > max) continue;
    out = next;
  }
  return out;
}

export interface HeadInput {
  title: string;
  description: string;
  /** The canonical path: what this page is, without view-only params. */
  path: string;
  jsonLd?: readonly JsonLd[];
  /** Pages only one person can see: search engines leave them out. */
  noindex?: boolean;
}

export function pageHead(input: HeadInput): PageHead {
  const url = siteUrl(input.path);
  return {
    meta: [
      { title: input.title },
      { name: "description", content: input.description },
      ...(input.noindex ? [{ name: "robots", content: "noindex" }] : []),
      { property: "og:title", content: input.title },
      { property: "og:description", content: input.description },
      { property: "og:url", content: url },
      { name: "twitter:title", content: input.title },
      { name: "twitter:description", content: input.description },
      ...(input.jsonLd ?? []).map((json) => ({ "script:ld+json": json })),
    ],
    links: input.noindex ? [] : [{ rel: "canonical", href: url }],
  };
}

const suffix = ` · ${SITE_NAME}`;

// ---------- /reviews ----------

export function reviewsHomeHead(): PageHead {
  return pageHead({
    title: `UMD course and instructor reviews${suffix}`,
    description:
      "Ratings, grades and student reviews for University of Maryland courses and instructors, with PlanetTerp's numbers. Free to read, no sign-in.",
    path: reviewsHomePath,
    jsonLd: [breadcrumbJsonLd([{ name: "Reviews", path: reviewsHomePath }])],
  });
}

// ---------- courses ----------

export function courseTitle(data: CoursePageData): string {
  const name = data.title ? `${data.code} ${data.title}` : data.code;
  return `${name} reviews and grades${suffix}`;
}

export function courseDescription(data: CoursePageData): string {
  const name = data.title ? `${data.code} ${data.title}` : data.code;
  const summary = data.grades ? gradeSummary(data.grades.counts) : null;
  const grades =
    summary?.averageGpa != null && summary.aOrBShare !== null
      ? `${name} at UMD: ${formatShare(summary.aOrBShare)} of ${summary.students.toLocaleString("en-US")} students got an A or B, average GPA ${formatGpa(summary.averageGpa)}.`
      : `${name} at UMD: grades, instructors and student reviews.`;
  const rated = data.instructors.flatMap((r) =>
    r.planetTerp?.rating != null && r.planetTerp.reviewCount > 0
      ? [r.planetTerp.rating]
      : [],
  );
  const low = Math.min(...rated);
  const high = Math.max(...rated);
  const instructors =
    data.instructors.length === 0
      ? null
      : rated.length === 0
        ? `${countWords(data.instructors.length, "instructor")}.`
        : rated.length === 1 || formatStars(low) === formatStars(high)
          ? `${countWords(data.instructors.length, "instructor")}, rated ${formatStars(high)} out of 5.`
          : `${countWords(data.instructors.length, "instructor")}, rated ${formatStars(low)} to ${formatStars(high)} out of 5.`;
  const teaching = data.instructors
    .filter((r) => r.teaching)
    .map((r) => r.name);
  const now =
    data.term && teaching.length > 0
      ? `${data.term.name}: ${listWords(teaching.slice(0, 2))}${teaching.length > 2 ? " and more" : ""}.`
      : data.term
        ? `Offered in ${data.term.name}.`
        : null;
  const ours = data.terpsicle
    ? `${countWords(data.terpsicle.reviewCount, "review")} on Terpsicle.`
    : null;
  return clipSentences([grades, instructors, now, ours]);
}

export function courseHead(data: CoursePageData): PageHead {
  const description = courseDescription(data);
  return pageHead({
    title: courseTitle(data),
    description,
    path: coursePath(data.code),
    jsonLd: [
      breadcrumbJsonLd([
        { name: "Reviews", path: reviewsHomePath },
        { name: data.code, path: coursePath(data.code) },
      ]),
      courseJsonLd(data, description),
    ],
  });
}

// ---------- instructors ----------

/** Course codes a title names at most. */
const TITLE_COURSES = 3;
/** Titles longer than this get fewer course codes. */
const TITLE_MAX = 70;

export function instructorTitle(data: InstructorPageData): string {
  if (!data.name) return `Instructor reviews${suffix}`;
  if (data.course)
    return `${data.name} in ${data.course}: reviews and grades${suffix}`;
  const codes = data.courses.slice(0, TITLE_COURSES).map((c) => c.code);
  while (codes.length > 0) {
    const title = `${data.name} reviews: ${codes.join(", ")}${suffix}`;
    if (title.length <= TITLE_MAX || codes.length === 1) return title;
    codes.pop();
  }
  return `${data.name} reviews${suffix}`;
}

export function instructorDescription(data: InstructorPageData): string {
  const name = data.name ?? "This instructor";
  const combined = combineRatings([
    {
      source: "planetterp",
      rating: data.planetTerp?.rating ?? null,
      reviewCount: data.planetTerp?.reviewCount ?? 0,
    },
    {
      source: "terpsicle",
      rating: data.terpsicle?.rating ?? null,
      reviewCount: data.terpsicle?.reviewCount ?? 0,
    },
  ]);
  const where = listWords(
    combined.parts.map((p) =>
      p.source === "planetterp" ? "PlanetTerp" : "Terpsicle",
    ),
  );
  const rating =
    combined.rating === null
      ? `${name} at UMD: no student reviews yet.`
      : `${name} at UMD is rated ${formatStars(combined.rating)} out of 5 from ${countWords(combined.reviewCount, "student review")} on ${where}.`;
  const shown = data.course
    ? data.courses.filter((c) => c.code === data.course)
    : data.courses.slice(0, 2);
  const grades = shown.flatMap((c) => {
    const gpa = gradeSummary(c.grades.counts).averageGpa;
    return gpa === null ? [] : [`${c.code} (${formatGpa(gpa)})`];
  });
  const gradeWords =
    grades.length > 0
      ? `Average GPA in ${listWords(grades)}.`
      : data.course
        ? `Grades and reviews in ${data.course}.`
        : null;
  const teaches =
    !data.course && data.courses.length > 2
      ? `Also ${listWords(data.courses.slice(2, 4).map((c) => c.code))}.`
      : null;
  return clipSentences([rating, gradeWords, teaches]);
}

/**
 * `?course=` narrows the same reviews, so every view canonicalizes to the
 * instructor's page: one URL per instructor in search results.
 */
export function instructorHead(data: InstructorPageData): PageHead {
  const path = instructorPath(data.id);
  const crumbs = [
    { name: "Reviews", path: reviewsHomePath },
    ...(data.course
      ? [{ name: data.course, path: coursePath(data.course) }]
      : []),
    ...(data.name ? [{ name: data.name, path }] : []),
  ];
  const name = data.name;
  // Nothing published says who this is yet (before PlanetTerp's index, or a
  // minted id the browser can't look up): say nothing wrong, and keep it
  // out of search results until a render knows.
  if (!name)
    return pageHead({
      title: instructorTitle(data),
      description: "Ratings, grades and student reviews for a UMD instructor.",
      path,
      noindex: true,
    });
  return pageHead({
    title: instructorTitle(data),
    description: instructorDescription(data),
    path,
    jsonLd: [
      breadcrumbJsonLd(crumbs),
      ...(name ? [personJsonLd({ ...data, name })] : []),
    ],
  });
}

/**
 * An instructor only the history knows: a thin page (what they taught, no
 * reviews), reached from a course's page and addressed through it, so it
 * stays out of search results.
 */
export function taughtOnlyHead(data: TaughtOnlyPageData): PageHead {
  return pageHead({
    title: `${data.name}: courses taught at UMD${suffix}`,
    description: `What ${data.name} has taught at the University of Maryland. No reviews yet.`,
    path: `${instructorPath(data.slug)}?course=${data.course}`,
    noindex: true,
  });
}

// ---------- not found ----------

export function notFoundHead(what: string): PageHead {
  return {
    meta: [
      { title: `${what} not found${suffix}` },
      { name: "description", content: "There's nothing at this address." },
      { name: "robots", content: "noindex" },
    ],
    links: [],
  };
}
