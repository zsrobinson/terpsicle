// An instructor the nightly job hasn't stored reviews for yet (Magdalene
// Ngeve, PlanetTerp's most reviewed, showed "No reviews yet" on 2026-09-29).
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { replacePlanetTerpReviews } from "./planetterp";
import { pageReviews } from "./public";

/** PlanetTerp's answer for a professor, with `n` invented reviews. */
function professor(slug: string, n: number) {
  return {
    name: "Magdalene Ngeve",
    slug,
    type: "professor",
    courses: ["BSCI160"],
    average_rating: 4.22,
    reviews: Array.from({ length: n }, (_, i) => ({
      professor: "Magdalene Ngeve",
      course: i % 5 === 0 ? null : "BSCI160",
      review: `Invented review number ${i}. The labs were long but fair.`,
      rating: (i % 5) + 1,
      expected_grade: i % 2 ? "A" : "",
      created: new Date(Date.UTC(2021, 0, 1 + i)).toISOString(),
    })),
  };
}

const fakePlanetTerp = (body: unknown, status = 200) =>
  vi.fn<typeof fetch>(async () => Response.json(body, { status }));

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM planetterp_reviews"),
    env.DB.prepare("DELETE FROM planetterp_review_sets"),
  ]);
});

describe("PlanetTerp reviews the nightly job hasn't stored", () => {
  it("are fetched once by the page's name, stored, and shown", async () => {
    const fetcher = fakePlanetTerp(professor("ngeve", 25));
    const input = {
      instructorId: "ngeve",
      course: null,
      planetTerpName: "Magdalene Ngeve",
    };
    const first = await pageReviews(env, input, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe(
      "https://planetterp.com/api/v1/professor?name=Magdalene%20Ngeve&reviews=true",
    );
    // PlanetTerp's first page, newest first, and more after it.
    expect(first.planetTerp).toHaveLength(20);
    expect(first.planetTerp[0]?.body).toContain("number 24");
    expect(first.next).not.toBeNull();

    // Stored: the next visit reads D1 and asks PlanetTerp nothing.
    const second = await pageReviews(env, input, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(second.planetTerp.map((r) => r.id)).toEqual(
      first.planetTerp.map((r) => r.id),
    );
  });

  it("leaves reviews the job stored alone", async () => {
    await env.DB.batch(
      replacePlanetTerpReviews(
        env.DB,
        "ngeve",
        [
          {
            id: "0123456789abcdef",
            course: "BSCI160",
            rating: 4,
            expectedGrade: null,
            body: "Stored by the job.",
            created: "2026-04-29T15:02:11.000Z",
          },
        ],
        "hash",
        new Date("2026-09-29T05:17:00.000Z"),
      ),
    );
    const fetcher = fakePlanetTerp(professor("ngeve", 25));
    const page = await pageReviews(
      env,
      {
        instructorId: "ngeve",
        course: null,
        planetTerpName: "Magdalene Ngeve",
      },
      fetcher,
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(page.planetTerp.map((r) => r.body)).toEqual(["Stored by the job."]);
  });

  it("stores nothing for a name that's someone else's, or one PlanetTerp doesn't know", async () => {
    const someoneElse = fakePlanetTerp(professor("ngeve_m", 25));
    const page = await pageReviews(
      env,
      {
        instructorId: "ngeve",
        course: null,
        planetTerpName: "Magdalene Ngeve",
      },
      someoneElse,
    );
    expect(page.planetTerp).toEqual([]);
    const unknown = fakePlanetTerp({ error: "professor not found" }, 400);
    await pageReviews(
      env,
      { instructorId: "ngeve", course: null, planetTerpName: "Nobody Here" },
      unknown,
    );
    const { results } = await env.DB.prepare(
      "SELECT * FROM planetterp_review_sets",
    ).all();
    expect(results).toEqual([]);
  });

  it("still answers when PlanetTerp is down", async () => {
    const down = fakePlanetTerp({}, 503);
    const page = await pageReviews(
      env,
      {
        instructorId: "ngeve",
        course: null,
        planetTerpName: "Magdalene Ngeve",
      },
      down,
    );
    expect(page.planetTerp).toEqual([]);
  });

  it("asks nothing without a name: the API's callers that don't know it", async () => {
    const fetcher = fakePlanetTerp(professor("ngeve", 25));
    await pageReviews(env, { instructorId: "ngeve", course: null }, fetcher);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
