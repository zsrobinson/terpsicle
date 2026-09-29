import { describe, expect, it } from "vitest";
import type { CoursePageData, InstructorPageData } from "~/core/reviews/pages";
import { aGradeRecord, someGrades } from "~/fixtures";
import {
  clipSentences,
  courseHead,
  DESCRIPTION_MAX,
  editDistance,
  instructorHead,
  type PageHead,
  pageHead,
  SITE_ORIGIN,
  SITEMAP_MAX_URLS,
  sitemapXml,
  suggestCourses,
  suggestInstructors,
} from "./index";

const course: CoursePageData = {
  code: "CMSC351",
  title: "Algorithms",
  term: { id: "202608", name: "Fall 2026" },
  grades: aGradeRecord(),
  gradesThrough: "202501",
  source: null,
  instructors: [
    {
      id: "kruskal",
      name: "Clyde Kruskal",
      teaching: true,
      planetTerp: { rating: 3.4, reviewCount: 210 },
      terpsicle: null,
      gpa: 2.6,
      overallGpa: 2.7,
      lastTermId: "202608",
    },
    {
      id: "brandt",
      name: "Ada Brandt",
      teaching: false,
      planetTerp: { rating: 4.2, reviewCount: 61 },
      terpsicle: null,
      gpa: 3.1,
      overallGpa: 3.2,
      lastTermId: "202501",
    },
  ],
  terms: [],
  terpsicle: null,
};

const instructor: InstructorPageData = {
  id: "kruskal",
  name: "Clyde Kruskal",
  ta: false,
  slug: "kruskal",
  planetTerp: { rating: 3.4, reviewCount: 210 },
  depts: ["CMSC"],
  courses: [
    {
      code: "CMSC351",
      grades: aGradeRecord({ counts: someGrades({ A: 300 }) }),
      students: 500,
    },
    { code: "CMSC250", grades: aGradeRecord(), students: 200 },
  ],
  course: null,
  gradesThrough: "202501",
  source: null,
  terpsicle: null,
};

const meta = (head: PageHead, key: string) =>
  head.meta.find(
    (m) =>
      ("name" in m && m.name === key) ||
      ("property" in m && m.property === key),
  );
const title = (head: PageHead) =>
  head.meta.find((m): m is { title: string } => "title" in m)?.title;
const jsonLd = (head: PageHead) =>
  head.meta.flatMap((m) =>
    "script:ld+json" in m ? [m["script:ld+json"]] : [],
  );
const content = (m: ReturnType<typeof meta>) =>
  m && "content" in m ? m.content : undefined;

describe("clipSentences", () => {
  it("keeps the sentences that fit, skipping empty ones", () => {
    expect(clipSentences(["One.", null, "Two.", "x".repeat(200)], 20)).toBe(
      "One. Two.",
    );
  });
});

describe("pageHead", () => {
  it("gives the canonical URL on the production origin, with link previews", () => {
    const head = pageHead({ title: "T", description: "D", path: "/reviews" });
    expect(head.links).toEqual([
      { rel: "canonical", href: "https://terpsicle.com/reviews" },
    ]);
    expect(content(meta(head, "og:url"))).toBe("https://terpsicle.com/reviews");
    expect(content(meta(head, "twitter:title"))).toBe("T");
  });

  it("keeps private pages out of search results, with no canonical", () => {
    const head = pageHead({
      title: "T",
      description: "D",
      path: "/reviews/mine",
      noindex: true,
    });
    expect(content(meta(head, "robots"))).toBe("noindex");
    expect(head.links).toEqual([]);
  });
});

describe("courseHead", () => {
  const head = courseHead(course);

  it("names the course, its grades and its instructors", () => {
    expect(title(head)).toBe(
      "CMSC351 Algorithms reviews and grades · Terpsicle",
    );
    const description = content(meta(head, "description")) ?? "";
    expect(description).toMatch(
      /^CMSC351 Algorithms at UMD: \d+% of [\d,]+ students got an A or B, average GPA \d\.\d\d\./,
    );
    expect(description).toContain("2 instructors, rated 3.4 to 4.2 out of 5.");
    expect(description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
    expect(head.links[0]?.href).toBe("https://terpsicle.com/reviews/cmsc351");
  });

  it("marks up the course and its breadcrumbs, with no borrowed rating", () => {
    const [crumbs, courseLd] = jsonLd(head);
    expect(crumbs).toMatchObject({
      "@type": "BreadcrumbList",
      itemListElement: [
        { position: 1, name: "Reviews", item: "https://terpsicle.com/reviews" },
        {
          position: 2,
          name: "CMSC351",
          item: "https://terpsicle.com/reviews/cmsc351",
        },
      ],
    });
    expect(courseLd).toMatchObject({
      "@type": "Course",
      courseCode: "CMSC351",
      provider: { name: "University of Maryland" },
    });
    // PlanetTerp's ratings are another site's: never in aggregateRating.
    expect(courseLd).not.toHaveProperty("aggregateRating");
  });

  it("rates the course from Terpsicle's own reviews only", () => {
    const [, courseLd] = jsonLd(
      courseHead({ ...course, terpsicle: { rating: 4.25, reviewCount: 8 } }),
    );
    expect(courseLd).toMatchObject({
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "4.3",
        ratingCount: 8,
        bestRating: 5,
        worstRating: 1,
      },
    });
  });
});

describe("instructorHead", () => {
  it("names them and their courses, most taken first", () => {
    const head = instructorHead(instructor);
    expect(title(head)).toBe(
      "Clyde Kruskal reviews: CMSC351, CMSC250 · Terpsicle",
    );
    expect(content(meta(head, "description"))).toMatch(
      /^Clyde Kruskal at UMD is rated 3\.4 out of 5 from 210 student reviews on PlanetTerp\. Average GPA in CMSC351 \(\d\.\d\d\) and CMSC250 \(\d\.\d\d\)\.$/,
    );
  });

  it("combines PlanetTerp's rating with Terpsicle's", () => {
    const head = instructorHead({
      ...instructor,
      terpsicle: { rating: 5, reviewCount: 10 },
    });
    expect(content(meta(head, "description"))).toContain(
      "is rated 3.5 out of 5 from 220 student reviews on PlanetTerp and Terpsicle.",
    );
  });

  it("canonicalizes ?course= to the instructor's page", () => {
    const head = instructorHead({ ...instructor, course: "CMSC351" });
    expect(title(head)).toBe(
      "Clyde Kruskal in CMSC351: reviews and grades · Terpsicle",
    );
    expect(head.links).toEqual([
      {
        rel: "canonical",
        href: "https://terpsicle.com/reviews/kruskal",
      },
    ]);
  });

  it("marks them up as a Person, with no rating (not a review-snippet type)", () => {
    const [, person] = jsonLd(instructorHead(instructor));
    expect(person).toEqual({
      "@context": "https://schema.org",
      "@type": "Person",
      name: "Clyde Kruskal",
      url: "https://terpsicle.com/reviews/kruskal",
      jobTitle: "Instructor",
      worksFor: {
        "@type": "CollegeOrUniversity",
        name: "University of Maryland",
        sameAs: "https://umd.edu",
      },
    });
  });

  it("says so when nobody's reviewed them", () => {
    const head = instructorHead({
      ...instructor,
      planetTerp: { rating: null, reviewCount: 0 },
      courses: [],
    });
    expect(content(meta(head, "description"))).toBe(
      "Clyde Kruskal at UMD: no student reviews yet.",
    );
  });
});

describe("sitemaps", () => {
  it("lists absolute, escaped URLs", () => {
    const xml = sitemapXml(SITE_ORIGIN, [
      { path: "/reviews" },
      { path: "/reviews/instructors/t~a&b", lastModified: "2026-09-01" },
    ]);
    expect(xml).toContain("<loc>https://terpsicle.com/reviews</loc>");
    expect(xml).toContain(
      "<url><loc>https://terpsicle.com/reviews/instructors/t~a&amp;b</loc><lastmod>2026-09-01</lastmod></url>",
    );
  });

  it("holds at most 50,000 URLs", () => {
    const entries = Array.from({ length: SITEMAP_MAX_URLS + 1 }, (_, i) => ({
      path: `/reviews/courses/C${i}`,
    }));
    expect(() => sitemapXml(SITE_ORIGIN, entries)).toThrow();
    expect(() =>
      sitemapXml(SITE_ORIGIN, entries.slice(0, SITEMAP_MAX_URLS)),
    ).not.toThrow();
  });
});

describe("suggestions", () => {
  const index = {
    kruskal: ["Clyde Kruskal", ["CMSC"]],
    brandt: ["Ada Brandt", ["CMSC"]],
    kruskal_jan: ["Jan Kruskal", ["MATH"]],
  } as const satisfies Record<string, readonly [string, readonly string[]]>;
  const writable = Object.fromEntries(
    Object.entries(index).map(([k, [n, d]]) => [k, [n, [...d]]]),
  ) as Record<string, [string, string[]]>;

  it("finds Clyde Kruskal from a first-last slug, best match first", () => {
    expect(suggestInstructors("clyde-kruskal", writable)).toEqual([
      { kind: "instructor", id: "kruskal", label: "Clyde Kruskal" },
      { kind: "instructor", id: "kruskal_jan", label: "Jan Kruskal" },
    ]);
  });

  it("forgives a typo in a long name, and suggests nothing for noise", () => {
    expect(
      suggestInstructors("kruskall", writable).map((s) => s.label),
    ).toEqual(["Clyde Kruskal", "Jan Kruskal"]);
    expect(suggestInstructors("clyde-kruskall", writable)[0]?.label).toBe(
      "Clyde Kruskal",
    );
    expect(suggestInstructors("zzz", writable)).toEqual([]);
  });

  it("suggests courses a typo away", () => {
    expect(
      suggestCourses("cmsc-315", [
        ["CMSC351", "Algorithms", 3, 3, []],
        ["CMSC330", "Organization of Programming Languages", 3, 3, []],
        ["ENGL101", "Academic Writing", 3, 3, []],
      ]),
    ).toEqual([
      { kind: "course", code: "CMSC351", label: "CMSC351 Algorithms" },
    ]);
  });

  it("counts edits", () => {
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("", "abc")).toBe(3);
    expect(editDistance("CMSC315", "CMSC351")).toBe(1);
  });
});
