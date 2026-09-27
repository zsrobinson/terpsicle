import { formatStars } from "../reviews/combine";
import type { CoursePageData, InstructorPageData } from "../reviews/pages";
import { coursePath, instructorPath, siteUrl } from "./site";

// Structured data (schema.org JSON-LD) for the public Reviews pages, checked
// against Google's review-snippet guidelines (2026-09):
// - Person isn't a type review snippets support, so instructor pages carry
//   no rating in their markup, only who they are;
// - "Don't aggregate reviews or ratings from other websites": PlanetTerp's
//   numbers never go into `aggregateRating`. A course's rating is
//   Terpsicle's own published reviews of it, and only when there are some;
// - Terpsicle isn't UMD, so the ratings aren't self-serving.

export type JsonLd = Record<string, unknown>;

const UMD = {
  "@type": "CollegeOrUniversity",
  name: "University of Maryland",
  sameAs: "https://umd.edu",
} as const;

export interface Crumb {
  name: string;
  path: string;
}

/** "Reviews › CMSC351 › Clyde Kruskal", as search results show it. */
export function breadcrumbJsonLd(crumbs: readonly Crumb[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: siteUrl(c.path),
    })),
  };
}

export function courseJsonLd(
  data: CoursePageData,
  description: string,
): JsonLd {
  const ours = data.terpsicle;
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    name: data.title ? `${data.code}: ${data.title}` : data.code,
    courseCode: data.code,
    description,
    url: siteUrl(coursePath(data.code)),
    provider: UMD,
    ...(ours && ours.reviewCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: formatStars(ours.rating),
            bestRating: 5,
            worstRating: 1,
            ratingCount: ours.reviewCount,
          },
        }
      : {}),
  };
}

export function personJsonLd(
  data: InstructorPageData & { name: string },
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: data.name,
    url: siteUrl(instructorPath(data.id)),
    jobTitle: data.ta ? "Teaching assistant" : "Instructor",
    worksFor: UMD,
  };
}
