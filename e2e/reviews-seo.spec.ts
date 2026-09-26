import { expect, test } from "@playwright/test";

// What a search engine gets from Terpsicle Reviews before any script runs
// (the server's HTML, fetched without a browser): each page's own title,
// description, canonical URL and JSON-LD, and real 404s for unknown pages.
// Mock data: Keiko Ashdown ("ashdown_keiko") teaches CMSC351 Algorithms.

/** The page's canonical URL, whatever other attributes the tag carries. */
const canonical = (html: string) =>
  /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];

const jsonLd = (html: string): unknown[] =>
  [
    ...html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    ),
  ].map((m) => JSON.parse(m[1] ?? "null"));

test.describe("the server's HTML", () => {
  test.skip(({ isMobile }) => isMobile, "it's the same on phones");

  test("a course page's head is in the server's HTML", async ({ request }) => {
    const response = await request.get("/reviews/courses/CMSC351");
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain(
      "<title>CMSC351 Algorithms reviews and grades · Terpsicle</title>",
    );
    expect(html).toMatch(
      /<meta name="description" content="CMSC351 Algorithms at UMD: \d+% of [\d,]+ students got an A or B/,
    );
    expect(canonical(html)).toBe(
      "https://terpsicle.com/reviews/courses/CMSC351",
    );
    expect(html).toContain('property="og:title"');
    expect(jsonLd(html)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ "@type": "BreadcrumbList" }),
        expect.objectContaining({ "@type": "Course", courseCode: "CMSC351" }),
      ]),
    );
    // The grades are drawn on the server: nothing shifts when scripts load.
    expect(html).toContain('data-testid="grade-bars"');
    expect(response.headers()["cache-control"]).toContain("s-maxage=");
  });

  test("an instructor page canonicalizes ?course= to the instructor", async ({
    request,
  }) => {
    const response = await request.get(
      "/reviews/instructors/ashdown_keiko?course=CMSC351",
    );
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain(
      "<title>Keiko Ashdown in CMSC351: reviews and grades · Terpsicle</title>",
    );
    expect(html).toContain(
      '<meta name="description" content="Keiko Ashdown at UMD is rated 3.1 out of 5 from 142 student reviews on PlanetTerp.',
    );
    expect(canonical(html)).toBe(
      "https://terpsicle.com/reviews/instructors/ashdown_keiko",
    );
    expect(jsonLd(html)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ "@type": "Person", name: "Keiko Ashdown" }),
      ]),
    );
  });

  test("unknown instructors and courses are real 404s, with suggestions", async ({
    request,
  }) => {
    const instructor = await request.get("/reviews/instructors/keiko-ashdown");
    expect(instructor.status()).toBe(404);
    const html = await instructor.text();
    expect(html).toContain("Instructor not found");
    expect(html).toMatch(/<meta name="robots" content="noindex"/);
    expect(html).toContain("Did you mean");
    expect(html).toContain('href="/reviews/instructors/ashdown_keiko"');

    const course = await request.get("/reviews/courses/CMSC999");
    expect(course.status()).toBe(404);
    expect(await course.text()).toContain("Course not found");
  });

  test("/reviews/mine stays out of search results", async ({ request }) => {
    const html = await (await request.get("/reviews/mine")).text();
    expect(html).toMatch(/<meta name="robots" content="noindex"/);
    expect(canonical(html)).toBeUndefined();
  });
});

test("a cached page's hash-based CSP allows every script it runs", async ({
  page,
}) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Content Security Policy"))
      violations.push(message.text());
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (event) => {
      console.log(`Content Security Policy: ${event.effectiveDirective}`);
    });
  });
  const response = await page.goto("/reviews/courses/CMSC351");
  const policy =
    (await response?.headerValue("content-security-policy-report-only")) ?? "";
  // No nonce to share between visitors, only hashes.
  expect(policy).not.toContain("'nonce-");
  expect(policy).toContain("'sha256-");
  await expect(
    page.getByRole("heading", { name: "CMSC351 · Algorithms", level: 1 }),
  ).toBeVisible();
  // Moving on in the app runs its scripts too.
  await page.getByRole("link", { name: "Keiko Ashdown" }).click();
  await expect(
    page.getByRole("heading", { name: "Keiko Ashdown", level: 1 }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(violations).toEqual([]);
});
