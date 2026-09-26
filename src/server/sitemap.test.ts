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
  it("lists the site's pages, then every course and instructor, cached for an hour", async () => {
    const response = await get("/sitemap.xml");
    expect(response.headers.get("Content-Type")).toBe(
      "application/xml; charset=utf-8",
    );
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=3600");
    const locs = [
      ...(await response.text()).matchAll(/<loc>([^<]+)<\/loc>/g),
    ].map((m) => m[1]);
    expect(locs.slice(0, 5)).toEqual([
      "https://terpsicle.com/",
      "https://terpsicle.com/schedule",
      "https://terpsicle.com/reviews",
      "https://terpsicle.com/privacy",
      "https://terpsicle.com/reviews/policy",
    ]);
    for (const [code] of aCourseSearchFile().courses)
      expect(locs).toContain(`https://terpsicle.com/reviews/courses/${code}`);
    expect(locs).toContain("https://terpsicle.com/reviews/instructors/kruskal");
    expect(locs).not.toContain("https://terpsicle.com/reviews/mine");
  });

  it("leaves minted instructors out while Reviews is off, and other paths alone", async () => {
    const xml = await (
      await get("/sitemap.xml", {
        ...env,
        // Env types each var as its wrangler.jsonc value.
        REVIEWS_ENABLED: "off",
      } as unknown as Env)
    ).text();
    expect(xml).toContain(
      "<loc>https://terpsicle.com/reviews/instructors/kruskal</loc>",
    );
    expect(
      await serveSitemap(
        new Request("https://terpsicle.com/sitemaps/other.xml"),
        env,
      ),
    ).toBeNull();
  });
});
