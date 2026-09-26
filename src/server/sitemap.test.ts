// The sitemap (sitemap.ts): an index, and parts built from what's published.
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  COURSE_INDEX_MANIFEST_KEY,
  courseSearchKey,
  PLANETTERP_MANIFEST_KEY,
  planetTerpIndexKey,
} from "~/core/schema";
import {
  aCourseIndexManifest,
  aCourseSearchFile,
  aPlanetTerpIndex,
  aPlanetTerpManifest,
  FIXTURE_HASH,
} from "~/fixtures";
import { serveSitemap } from "./sitemap";

const get = async (path: string, bindings: Env = env) => {
  const response = await serveSitemap(
    new Request(`https://terpsicle.com${path}`),
    bindings,
  );
  if (!response) throw new Error(`${path} isn't a sitemap`);
  return response;
};

beforeEach(async () => {
  await env.DATA.put(
    COURSE_INDEX_MANIFEST_KEY,
    JSON.stringify(aCourseIndexManifest()),
  );
  await env.DATA.put(
    courseSearchKey(aCourseIndexManifest().search.hash),
    JSON.stringify(aCourseSearchFile()),
  );
  await env.DATA.put(
    PLANETTERP_MANIFEST_KEY,
    JSON.stringify(aPlanetTerpManifest({ index: { hash: FIXTURE_HASH } })),
  );
  await env.DATA.put(
    planetTerpIndexKey(FIXTURE_HASH),
    JSON.stringify(
      aPlanetTerpIndex({
        instructors: { kruskal: ["Clyde Kruskal", ["CMSC"]] },
      }),
    ),
  );
});

describe("sitemap", () => {
  it("indexes its parts, cached at the edge for an hour", async () => {
    const response = await get("/sitemap.xml");
    expect(response.headers.get("Content-Type")).toBe(
      "application/xml; charset=utf-8",
    );
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=3600");
    const xml = await response.text();
    for (const part of ["pages", "courses", "instructors"])
      expect(xml).toContain(
        `<loc>https://terpsicle.com/sitemaps/${part}.xml</loc>`,
      );
  });

  it("lists every course in the course index", async () => {
    const xml = await (await get("/sitemaps/courses.xml")).text();
    for (const [code] of aCourseSearchFile().courses)
      expect(xml).toContain(
        `<loc>https://terpsicle.com/reviews/courses/${code}</loc>`,
      );
  });

  it("lists every instructor PlanetTerp's index knows", async () => {
    const xml = await (
      await get("/sitemaps/instructors.xml", {
        ...env,
        // Env types each var as its wrangler.jsonc value.
        REVIEWS_ENABLED: "off",
      } as unknown as Env)
    ).text();
    expect(xml).toContain(
      "<loc>https://terpsicle.com/reviews/instructors/kruskal</loc>",
    );
  });

  it("lists the public pages, and leaves other paths alone", async () => {
    const xml = await (await get("/sitemaps/pages.xml")).text();
    expect(xml).toContain("<loc>https://terpsicle.com/reviews</loc>");
    expect(xml).not.toContain("/reviews/mine");
    expect(
      await serveSitemap(
        new Request("https://terpsicle.com/sitemaps/other.xml"),
        env,
      ),
    ).toBeNull();
  });
});
