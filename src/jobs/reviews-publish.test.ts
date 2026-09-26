import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  REVIEWS_MANIFEST_KEY,
  type ReviewsDept,
  ReviewsDeptSchema,
  type ReviewsManifest,
  ReviewsManifestSchema,
  reviewsDeptKey,
} from "~/core/schema";
import { resetTables } from "~/server/reviews/test-harness";
import { runReviewsPublishJob } from "./reviews-publish";

// The hourly job end to end: D1's reviews in, R2's `reviews/` out.

const NOW = new Date("2027-02-10T15:37:00.000Z");

let n = 0;
async function addReview(
  instructorId: string,
  fields: {
    course?: string;
    rating?: number;
    status?: string;
    publishedAt?: string;
  } = {},
) {
  const id = `review-${String(++n).padStart(15, "0")}`;
  const at = fields.publishedAt ?? "2027-02-01T12:00:00.000Z";
  await env.DB.prepare(
    `INSERT INTO reviews (id, author_id, instructor_id, reviewed_name, course, term_id,
       rating, grade, body, text_hash, status, created_at, published_at, updated_at)
     VALUES (?1, NULL, ?2, 'Some Name', ?3, NULL, ?4, NULL, ?5, ?6, ?7, ?8, ?8, ?8)`,
  )
    .bind(
      id,
      instructorId,
      fields.course ?? "CMSC351",
      fields.rating ?? 4,
      "SECRET WORDS that must never reach R2, however the review is published.",
      "0".repeat(64),
      fields.status ?? "published",
      at,
    )
    .run();
  return id;
}

async function addInstructor(id: string, name: string, slug: string | null) {
  await env.DB.prepare(
    "INSERT INTO instructors (id, name, planetterp_slug, created_at) VALUES (?1, ?2, ?3, ?4)",
  )
    .bind(id, name, slug, "2027-01-01T00:00:00.000Z")
    .run();
}

async function addName(
  nameKey: string,
  dept: string,
  instructorId: string,
  rule: string,
) {
  await env.DB.prepare(
    "INSERT INTO instructor_names (name_key, dept, instructor_id, rule, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
  )
    .bind(nameKey, dept, instructorId, rule, "2027-01-01T00:00:00.000Z")
    .run();
}

async function run(now = NOW) {
  await runReviewsPublishJob({ env, now });
}

async function manifest(): Promise<ReviewsManifest> {
  const object = await env.DATA.get(REVIEWS_MANIFEST_KEY);
  if (!object) throw new Error("no manifest");
  return ReviewsManifestSchema.parse(await object.json());
}

async function dept(code: string): Promise<ReviewsDept | null> {
  const entry = (await manifest()).departments.find((d) => d.code === code);
  if (!entry) return null;
  const object = await env.DATA.get(reviewsDeptKey(code, entry.hash));
  if (!object) throw new Error(`${code} is missing`);
  return ReviewsDeptSchema.parse(await object.json());
}

beforeEach(async () => {
  await resetTables();
  const listed = await env.DATA.list({ prefix: "reviews/" });
  await Promise.all(listed.objects.map((o) => env.DATA.delete(o.key)));
  await env.DATA.delete("_jobs/reviews/state.json");
  await addInstructor("kruskal", "Clyde Kruskal", "kruskal");
  await addInstructor("t~abcde23456", "Pat Quill", null);
});

describe("reviews-publish", () => {
  it("publishes published reviews' numbers, and nothing else", async () => {
    await addReview("kruskal", { rating: 5 });
    await addReview("kruskal", { rating: 4, course: "MATH141" });
    await addReview("kruskal", { rating: 1, status: "held" });
    await addReview("kruskal", { rating: 1, status: "hidden" });
    await addReview("kruskal", { rating: 1, status: "rejected" });
    await addReview("kruskal", { rating: 1, status: "deleted" });
    await addReview("t~abcde23456", { rating: 3, course: "ENGL101" });
    await addName("pat quill", "ENGL", "t~abcde23456", "minted");
    await addName("clyde kruskal", "CMSC", "kruskal", "planetterp");
    await run();

    const numbers = {
      rating: 4.5,
      reviewCount: 2,
      latestReviewMonth: "2027-02",
    };
    expect(await dept("CMSC")).toEqual({
      schemaVersion: 1,
      dept: "CMSC",
      instructors: { kruskal: numbers },
      names: {},
    });
    expect((await dept("MATH"))?.instructors).toEqual({ kruskal: numbers });
    expect(await dept("ENGL")).toEqual({
      schemaVersion: 1,
      dept: "ENGL",
      instructors: {
        "t~abcde23456": {
          rating: 3,
          reviewCount: 1,
          latestReviewMonth: "2027-02",
        },
      },
      names: { "pat quill": "t~abcde23456" },
    });
    const m = await manifest();
    expect(m.generatedAt).toBe(NOW.toISOString());
    expect(m.departments.map((d) => d.code)).toEqual(["CMSC", "ENGL", "MATH"]);
    const head = await env.DATA.head(REVIEWS_MANIFEST_KEY);
    expect(head?.httpMetadata?.contentType).toBe(
      "application/json; charset=utf-8",
    );

    // Nothing under reviews/ carries a review's words.
    const listed = await env.DATA.list({ prefix: "reviews/" });
    for (const o of listed.objects)
      expect(await (await env.DATA.get(o.key))?.text()).not.toContain("SECRET");
  });

  it("takes a removed review's numbers down on the next run", async () => {
    const id = await addReview("kruskal", { rating: 5 });
    await addReview("kruskal", { rating: 3, course: "MATH141" });
    await run();
    await env.DB.prepare("UPDATE reviews SET status = 'hidden' WHERE id = ?1")
      .bind(id)
      .run();
    const next = new Date(NOW.getTime() + 3_600_000);
    await run(next);
    expect(await dept("CMSC")).toBeNull();
    expect((await dept("MATH"))?.instructors.kruskal?.reviewCount).toBe(1);
    expect((await manifest()).generatedAt).toBe(next.toISOString());
  });

  it("leaves the manifest alone when nothing changed", async () => {
    await addReview("kruskal");
    await run();
    const first = await env.DATA.head(REVIEWS_MANIFEST_KEY);
    await run(new Date(NOW.getTime() + 3_600_000));
    const second = await env.DATA.head(REVIEWS_MANIFEST_KEY);
    expect(second?.etag).toBe(first?.etag);
  });

  it("publishes an empty manifest with no reviews yet", async () => {
    await run();
    expect((await manifest()).departments).toEqual([]);
  });
});
