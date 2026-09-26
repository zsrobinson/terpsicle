// Terpsicle Reviews end to end through the real router and D1 (docs/V2.md
// §7): writing, the instructor registry, stage 0, moderation and its later
// decisions, reports, limits, the switch, and housekeeping. The models are
// mocked; anonymity has its own file (anonymity.test.ts).
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type MyReview,
  PublicReviewSchema,
  ReportCreateResultSchema,
  ResolveResultSchema,
  ReviewListResultSchema,
  ReviewsMineResultSchema,
  ReviewWriteResultSchema,
} from "~/core/schema";
import {
  anIdentity,
  anInstructor,
  aPlanetTerpDept,
  aReviewSubmitInput,
} from "~/fixtures";
import { runDailyJob } from "~/jobs/daily";
import { handleApi } from "../api/router";
import { markDeleting } from "../auth/store";
import { retryHeld } from "../moderation/service";
import { decisionsFor } from "../moderation/store";
import {
  advance,
  ai,
  apiEnv,
  call,
  DAY,
  HOUR,
  idOf,
  models,
  now,
  openQueue,
  Person,
  publishPlanetTerp,
  resetTables,
  setClock,
} from "./test-harness";

/** CMSC's PlanetTerp file: "Ada Brandt" is `brandt`, "Clyde Kruskal" `kruskal`. */
const cmscPlanetTerp = () =>
  aPlanetTerpDept({
    instructors: {
      brandt: anInstructor(),
      kruskal: anInstructor({ slug: "kruskal", name: "Clyde Kruskal" }),
    },
    names: { "ada brandt": "brandt", "clyde kruskal": "kruskal" },
  });

const signIn = (id: string, name = `Person ${id}`) =>
  Person.signIn(
    anIdentity({
      directoryId: id,
      email: `${id}@terpmail.umd.edu`,
      name,
      sub: null,
    }),
  );

let author: Person;
let reader: Person;
let admin: Person;

beforeEach(async () => {
  setClock("2027-02-10T15:00:00.000Z");
  await resetTables();
  await publishPlanetTerp(cmscPlanetTerp());
  author = await signIn("tstudent", "Test Student");
  reader = await signIn("tclassmate", "Test Classmate");
  admin = await signIn("tadmin", "Test Admin");
});

const BODY_2 =
  "Exams were long but fair, and the TA sections cleared up the proofs every week.";

async function list(instructorId = "brandt", course: string | null = null) {
  const response = await call("reviews/list", {
    instructorId,
    course,
    cursor: null,
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  return ReviewListResultSchema.parse(await response.json());
}

async function mine(person: Person): Promise<MyReview[]> {
  return ReviewsMineResultSchema.parse(await person.json("reviews/mine", {}))
    .reviews;
}

async function edit(
  person: Person,
  reviewId: string,
  body: string,
  rating = 3,
) {
  return ReviewWriteResultSchema.parse(
    await person.json("reviews/edit", {
      reviewId,
      termId: "202601",
      rating,
      grade: null,
      body,
    }),
  );
}

async function report(person: Person, ref: string, reason = "off-topic") {
  return ReportCreateResultSchema.parse(
    await person.json("reports/create", {
      surface: "review",
      ref,
      reason,
      note: null,
    }),
  );
}

async function resolve(id: string, action: "approve" | "remove") {
  return ResolveResultSchema.parse(
    await admin.json("admin/moderation/resolve", {
      id,
      action,
      reason: action === "approve" ? "fine" : "targets-person",
    }),
  );
}

const reviewRow = (id: string) =>
  env.DB.prepare("SELECT * FROM reviews WHERE id = ?1").bind(id).first();

describe("writing and reading", () => {
  it("publishes a clean review, and anyone can read it", async () => {
    const result = await author.submit(aReviewSubmitInput());
    expect(result.status).toBe("published");
    const page = await list();
    expect(page).toEqual({
      reviews: [
        {
          id: idOf(result),
          course: "CMSC351",
          termId: "202601",
          rating: 4,
          grade: "A-",
          body: aReviewSubmitInput().body,
          createdMonth: "2027-02",
          edited: false,
        },
      ],
      next: null,
    });
    // Both models read it, once each.
    expect(ai.run).toHaveBeenCalledTimes(2);
  });

  it("filters by course and pages newest first", async () => {
    const courses = ["CMSC351", "CMSC330", "CMSC351", "CMSC216"];
    const ids: string[] = [];
    for (const [i, course] of courses.entries()) {
      const person = await signIn(`tpager${i}`);
      ids.push(
        idOf(
          await person.submit(
            aReviewSubmitInput({ course, body: `${BODY_2} Take ${i}.` }),
          ),
        ),
      );
      advance(HOUR);
    }
    const first = ReviewListResultSchema.parse(
      await (
        await call("reviews/list", {
          instructorId: "brandt",
          course: null,
          cursor: null,
          limit: 3,
        })
      ).json(),
    );
    expect(first.reviews.map((r) => r.id)).toEqual(ids.slice(1).reverse());
    expect(first.next).toBe(ids[1]);
    const second = ReviewListResultSchema.parse(
      await (
        await call("reviews/list", {
          instructorId: "brandt",
          course: null,
          cursor: first.next,
          limit: 3,
        })
      ).json(),
    );
    expect(second).toEqual({
      reviews: [expect.objectContaining({ id: ids[0] })],
      next: null,
    });
    expect((await list("brandt", "CMSC351")).reviews.map((r) => r.id)).toEqual([
      ids[2],
      ids[0],
    ]);
  });

  it("makes a second review of the same instructor and course an edit of the first", async () => {
    const first = idOf(await author.submit(aReviewSubmitInput()));
    advance(DAY);
    const second = await author.submit(
      aReviewSubmitInput({ body: BODY_2, rating: 2 }),
    );
    expect(second).toEqual({ status: "published", reviewId: first });
    const [review] = (await list()).reviews;
    expect(review).toMatchObject({
      id: first,
      body: BODY_2,
      rating: 2,
      edited: true,
    });
    expect(await mine(author)).toHaveLength(1);
  });

  it("lists your own reviews with where each stands", async () => {
    const id = idOf(await author.submit(aReviewSubmitInput()));
    expect(await mine(author)).toEqual([
      {
        id,
        instructorId: "brandt",
        instructorName: "Ada Brandt",
        reviewedName: "Ada Brandt",
        course: "CMSC351",
        termId: "202601",
        rating: 4,
        grade: "A-",
        body: aReviewSubmitInput().body,
        status: "published",
        reason: null,
        pendingEdit: null,
        createdAt: now().toISOString(),
        publishedAt: now().toISOString(),
        editedAt: null,
      },
    ]);
    expect(await mine(reader)).toEqual([]);
  });

  it("deletes your own review: gone for readers and from the owner's queue", async () => {
    models("targets-person");
    const held = idOf(await author.submit(aReviewSubmitInput()));
    expect(await openQueue(admin)).toHaveLength(1);
    expect(await reader.json("reviews/delete", { reviewId: held })).toEqual({
      status: "not-found",
    });
    expect(await author.json("reviews/delete", { reviewId: held })).toEqual({
      status: "deleted",
    });
    expect(await openQueue(admin)).toEqual([]);
    expect(await mine(author)).toEqual([]);
    expect(await reviewRow(held)).toMatchObject({
      status: "deleted",
      body: "",
    });
    expect(await author.json("reviews/delete", { reviewId: held })).toEqual({
      status: "not-found",
    });
  });
});

describe("the instructor registry", () => {
  it("joins the Testudo name through PlanetTerp's names map", async () => {
    await author.submit(aReviewSubmitInput({ reviewedName: "Clyde  Kruskal" }));
    const [review] = await mine(author);
    expect(review?.instructorId).toBe("kruskal");
    expect(
      await env.DB.prepare("SELECT * FROM instructor_names").all(),
    ).toMatchObject({
      results: [
        {
          name_key: "clyde kruskal",
          dept: "CMSC",
          instructor_id: "kruskal",
          rule: "planetterp",
        },
      ],
    });
  });

  it("mints one id per unknown name and department, and reuses it", async () => {
    const newcomer = aReviewSubmitInput({
      reviewedName: "Imani Okafor",
      course: "CMSC132",
    });
    await author.submit(newcomer);
    await reader.submit({ ...newcomer, body: BODY_2 });
    const [a] = await mine(author);
    const [b] = await mine(reader);
    expect(a?.instructorId).toMatch(/^t~[a-z2-7]{10}$/);
    expect(b?.instructorId).toBe(a?.instructorId);
    // The page can send the minted id back later.
    const third = await signIn("tthird");
    await third.submit({
      ...newcomer,
      instructorId: a?.instructorId ?? null,
      reviewedName: "I. Okafor",
      body: `${BODY_2} Again.`,
    });
    expect((await mine(third))[0]?.instructorId).toBe(a?.instructorId);
    // Another department's file, another person as far as we can tell.
    await third.submit({
      ...newcomer,
      dept: "MATH",
      course: "MATH140",
      body: `${BODY_2} Math.`,
    });
    const math = (await mine(third)).find((r) => r.course === "MATH140");
    expect(math?.instructorId).not.toBe(a?.instructorId);
  });

  it("trusts a given id only if it's known, and lets a manual fix beat PlanetTerp", async () => {
    await author.submit(
      aReviewSubmitInput({
        instructorId: "not-a-real-slug",
        reviewedName: "Ada Brandt",
      }),
    );
    expect((await mine(author))[0]?.instructorId).toBe("brandt");
    // The owner decided this Testudo name is someone else.
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO instructors (id, name, planetterp_slug, created_at) VALUES ('t~manualfix2', 'Ada Brandt-Lee', NULL, ?1)",
      ).bind(now().toISOString()),
      env.DB.prepare(
        "UPDATE instructor_names SET instructor_id = 't~manualfix2', rule = 'manual' WHERE name_key = 'ada brandt'",
      ),
    ]);
    await reader.submit(aReviewSubmitInput());
    expect((await mine(reader))[0]?.instructorId).toBe("t~manualfix2");
  });
});

describe("stage 0", () => {
  it("sends back what to fix, and stores nothing", async () => {
    const body = `${BODY_2} Notes at https://example.com/notes.`;
    const result = await author.submit(aReviewSubmitInput({ body }));
    if (result.status !== "invalid") throw new Error(result.status);
    const [problem] = result.problems;
    expect(problem?.code).toBe("link");
    // The span points at the link, so the form can mark those words.
    expect(problem?.span && body.slice(...problem.span)).toMatch(
      /^https:\/\/example\.com\/notes/,
    );
    expect(
      await author.submit(aReviewSubmitInput({ body: "Great class." })),
    ).toEqual({
      status: "invalid",
      problems: [{ code: "too-short" }],
    });
    expect(ai.run).not.toHaveBeenCalled();
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS n FROM reviews").first("n"),
    ).toBe(0);
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS n FROM instructors").first("n"),
    ).toBe(0);
  });

  it("refuses words that are already up for this instructor", async () => {
    await author.submit(aReviewSubmitInput());
    const copy = aReviewSubmitInput({
      course: "CMSC330",
      body: aReviewSubmitInput().body.toUpperCase(),
    });
    expect(await reader.submit(copy)).toEqual({
      status: "invalid",
      problems: [{ code: "duplicate" }],
    });
    // Another instructor may get the same words.
    expect(
      (await reader.submit({ ...copy, reviewedName: "Clyde Kruskal" })).status,
    ).toBe("published");
  });

  it("answers 400 for a body far past the limit, and too-long up to it", async () => {
    expect(
      await author.submit(aReviewSubmitInput({ body: "a".repeat(2_500) })),
    ).toEqual({ status: "invalid", problems: [{ code: "too-long" }] });
    const response = await author.call(
      "reviews/submit",
      aReviewSubmitInput({ body: "a".repeat(4_001) }),
    );
    expect(response.status).toBe(400);
  });
});

describe("moderation", () => {
  it("holds what the models hold, and tells the author why", async () => {
    models("targets-person");
    const result = await author.submit(aReviewSubmitInput());
    expect(result).toEqual({
      status: "held",
      reviewId: idOf(result),
      reason: "targets-person",
    });
    expect((await list()).reviews).toEqual([]);
    expect((await mine(author))[0]).toMatchObject({
      status: "held",
      reason: "targets-person",
    });
    const [item] = await openQueue(admin);
    expect(item).toMatchObject({
      kind: "review",
      targetId: idOf(result),
      course: "CMSC351",
    });
  });

  it("removes clear spam and keeps it off the queue", async () => {
    models("spam");
    const result = await author.submit(aReviewSubmitInput());
    expect(result).toMatchObject({ status: "rejected", reason: "spam" });
    expect(await openQueue(admin)).toEqual([]);
    expect((await mine(author))[0]).toMatchObject({
      status: "rejected",
      reason: "spam",
    });
    // A removed review doesn't block writing a better one.
    models("clean");
    const again = await author.submit(aReviewSubmitInput({ body: BODY_2 }));
    expect(again.status).toBe("published");
    expect(idOf(again)).not.toBe(idOf(result));
  });

  it("publishes a held review when the owner approves it, and hides it again on undo", async () => {
    models("targets-person");
    const id = idOf(await author.submit(aReviewSubmitInput()));
    const [item] = await openQueue(admin);
    if (!item) throw new Error("expected a queue item");
    expect((await resolve(item.id, "approve")).status).toBe("ok");
    expect((await list()).reviews.map((r) => r.id)).toEqual([id]);
    await admin.json("admin/moderation/undo", { id: item.id });
    expect((await list()).reviews).toEqual([]);
    expect((await mine(author))[0]?.status).toBe("held");
  });

  it("lets the author edit a held review while it waits", async () => {
    models("targets-person");
    const id = idOf(await author.submit(aReviewSubmitInput()));
    models("clean");
    expect(await edit(author, id, BODY_2)).toEqual({
      status: "published",
      reviewId: id,
    });
    expect(await openQueue(admin)).toEqual([]);
    // Readers never saw the first words, so it isn't "edited".
    expect((await list()).reviews[0]).toMatchObject({
      body: BODY_2,
      edited: false,
    });
  });

  it("keeps a published review up while its edit waits, then applies the owner's call", async () => {
    const id = idOf(await author.submit(aReviewSubmitInput()));
    models("targets-person");
    expect(await edit(author, id, BODY_2)).toEqual({
      status: "held",
      reviewId: id,
      reason: "targets-person",
    });
    expect((await list()).reviews[0]?.body).toBe(aReviewSubmitInput().body);
    expect((await mine(author))[0]?.pendingEdit).toMatchObject({
      body: BODY_2,
      state: "waiting",
      reason: "targets-person",
    });

    const [item] = await openQueue(admin);
    if (!item) throw new Error("expected a queue item");
    expect(item.text).toBe(BODY_2);
    await resolve(item.id, "remove");
    // The edit goes; the review stays up with its old words.
    expect((await list()).reviews[0]?.body).toBe(aReviewSubmitInput().body);
    expect((await mine(author))[0]?.pendingEdit).toMatchObject({
      state: "rejected",
      reason: "admin",
    });

    await admin.json("admin/moderation/undo", { id: item.id });
    expect((await mine(author))[0]?.pendingEdit?.state).toBe("waiting");
    await resolve(item.id, "approve");
    expect((await list()).reviews[0]).toMatchObject({
      body: BODY_2,
      rating: 3,
      edited: true,
    });
    expect((await mine(author))[0]?.pendingEdit).toBeNull();
  });

  it("turns down an edit the models remove, keeping the review up", async () => {
    const id = idOf(await author.submit(aReviewSubmitInput()));
    models("spam");
    expect(await edit(author, id, BODY_2)).toMatchObject({
      status: "rejected",
      reason: "spam",
    });
    expect((await list()).reviews[0]?.body).toBe(aReviewSubmitInput().body);
  });

  it("retries a check that failed, and publishes through the handler when it passes", async () => {
    models("down");
    const result = await author.submit(aReviewSubmitInput());
    expect(result).toMatchObject({
      status: "held",
      reason: "model-unavailable",
    });
    // Waiting for the cron, not the owner.
    expect(await openQueue(admin)).toEqual([]);
    models("clean");
    advance(5 * 60_000);
    const retried = await retryHeld(apiEnv(), { now: now() });
    expect(retried).toMatchObject({ retried: 1, published: 1 });
    expect((await list()).reviews.map((r) => r.id)).toEqual([idOf(result)]);
  });
});

describe("reports", () => {
  it("hides a review after three different people report it, until the owner decides", async () => {
    const id = idOf(await author.submit(aReviewSubmitInput()));
    expect(await report(author, id)).toEqual({ status: "own" });
    expect(await report(reader, id)).toEqual({ status: "reported" });
    // One report per person: asking again changes nothing.
    expect(await report(reader, id)).toEqual({ status: "reported" });
    expect(await reviewRow(id)).toMatchObject({
      report_count: 1,
      status: "published",
    });
    const [flagged] = await openQueue(admin);
    expect(flagged?.reasons).toEqual([
      {
        code: "reported",
        source: "reports",
        action: "flag",
        report: "off-topic",
      },
    ]);
    // While readers' reports wait, the author can't change what was reported.
    expect(await edit(author, id, BODY_2)).toEqual({ status: "under-review" });

    await report(await signIn("tthird"), id, "other");
    expect((await list()).reviews).toHaveLength(1);
    await report(await signIn("tfourth"), id);
    expect((await list()).reviews).toEqual([]);
    expect((await mine(author))[0]?.status).toBe("hidden");
    expect(
      (await decisionsFor(env.DB, "review", id)).map(
        (d) => `${d.stage}:${d.verdict}`,
      ),
    ).toEqual(["model:allow", "reports:hide"]);
    const queue = await openQueue(admin);
    expect(queue).toHaveLength(1);
    expect(queue[0]?.reasons.map((r) => `${r.report}:${r.action}`)).toEqual([
      "off-topic:hold",
      "other:hold",
    ]);

    // The owner approves: it's back, and those reports are settled.
    if (!queue[0]) throw new Error("expected a queue item");
    await resolve(queue[0].id, "approve");
    expect((await list()).reviews).toHaveLength(1);
    advance(HOUR);
    await report(await signIn("tfifth"), id);
    expect((await list()).reviews).toHaveLength(1);
  });

  it("hides at once for a threat, sorts it first, and the owner can remove it", async () => {
    const calm = idOf(
      await author.submit(
        aReviewSubmitInput({ reviewedName: "Clyde Kruskal" }),
      ),
    );
    models("targets-person");
    await reader.submit(aReviewSubmitInput({ body: BODY_2 }));
    models("clean");
    const id = idOf(await author.submit(aReviewSubmitInput()));
    advance(HOUR);
    await report(reader, calm);
    expect(await report(await signIn("tthird"), id, "threat")).toEqual({
      status: "reported",
    });
    expect((await list()).reviews).toEqual([]);
    const queue = await openQueue(admin);
    expect(queue[0]).toMatchObject({ targetId: id, urgent: true });
    if (!queue[0]) throw new Error("expected a queue item");
    await resolve(queue[0].id, "remove");
    expect((await mine(author)).find((r) => r.id === id)).toMatchObject({
      status: "rejected",
      reason: "admin",
    });
  });

  it("finds nothing to report among held, deleted or unknown reviews", async () => {
    models("targets-person");
    const held = idOf(await author.submit(aReviewSubmitInput()));
    expect(await report(reader, held)).toEqual({ status: "not-found" });
    expect(await report(reader, "AAAAAAAAAAAAAAAAAAAAAA")).toEqual({
      status: "not-found",
    });
    expect(
      await reader.json("reports/create", {
        surface: "chat",
        ref: "202701:CMSC351:m1",
        reason: "other",
        note: "Not a thing yet.",
      }),
    ).toEqual({ status: "not-found" });
  });
});

describe("limits", () => {
  it("refuses an author the owner stopped", async () => {
    const until = new Date(now().getTime() + 30 * DAY).toISOString();
    await env.DB.prepare(
      "UPDATE users SET reviews_blocked_until = ?1 WHERE id = ?2",
    )
      .bind(until, author.id)
      .run();
    expect(await author.submit(aReviewSubmitInput())).toEqual({
      status: "blocked",
      until,
    });
  });

  it("allows ten new reviews a week", async () => {
    // Different instructors, so no one instructor sees a burst.
    const nth = (i: number, body: string) =>
      aReviewSubmitInput({
        reviewedName: `Visiting Lecturer ${i}`,
        course: `CMSC${400 + i}`,
        body,
      });
    for (let i = 0; i < 10; i++) {
      const result = await author.submit(nth(i, `${BODY_2} Course ${i}.`));
      expect(result.status).toBe("published");
      advance(HOUR);
    }
    expect(await author.submit(nth(10, `${BODY_2} Last.`))).toEqual({
      status: "limit",
      retryAfterSeconds: 7 * 24 * 3600 - 10 * 3600,
    });
    // Editing one of them is still fine.
    expect((await author.submit(nth(0, `${BODY_2} Edit.`))).status).toBe(
      "published",
    );
  });

  it("sends a burst of reviews for one instructor to the owner", async () => {
    for (let i = 0; i < 5; i++) {
      const person = await signIn(`tburst${i}`);
      const result = await person.submit(
        aReviewSubmitInput({ body: `${BODY_2} Burst ${i}.` }),
      );
      expect(result.status).toBe("published");
    }
    const sixth = await reader.submit(
      aReviewSubmitInput({ body: `${BODY_2} Burst 5.` }),
    );
    expect(sixth).toMatchObject({ status: "held", reason: "burst" });
    const [item] = await openQueue(admin);
    expect(item?.reasons).toEqual([
      { code: "burst", source: "system", action: "hold" },
    ]);
    // A retry can't publish it: it's the owner's.
    expect(await retryHeld(apiEnv(), { now: now() })).toMatchObject({
      retried: 0,
    });
  });

  it("limits requests per person per hour", async () => {
    const short = aReviewSubmitInput({ body: "Too short." });
    for (let i = 0; i < 20; i++)
      expect((await author.submit(short)).status).toBe("invalid");
    const response = await author.call("reviews/submit", short);
    expect(response.status).toBe(429);
    // Someone else isn't affected.
    expect((await reader.submit(short)).status).toBe("invalid");
  });
});

describe("the route table", () => {
  it("needs a session and our origin to write", async () => {
    expect((await call("reviews/submit", aReviewSubmitInput())).status).toBe(
      401,
    );
    expect(
      (
        await call("reports/create", {
          surface: "review",
          ref: "AAAAAAAAAAAAAAAAAAAAAA",
          reason: "other",
          note: null,
        })
      ).status,
    ).toBe(401);
    const crossSite = await handleCrossSite();
    expect(crossSite.status).toBe(403);
  });

  it("follows REVIEWS_ENABLED: off is unavailable, read lists but doesn't write", async () => {
    const id = idOf(await author.submit(aReviewSubmitInput()));
    for (const level of ["off", "nonsense"]) {
      const off = { REVIEWS_ENABLED: level };
      expect(
        (
          await call(
            "reviews/list",
            { instructorId: "brandt", course: null, cursor: null },
            "",
            off,
          )
        ).status,
      ).toBe(503);
      expect((await author.call("reviews/mine", {}, off)).status).toBe(503);
    }
    const read = { REVIEWS_ENABLED: "read" };
    expect(
      (
        await call(
          "reviews/list",
          { instructorId: "brandt", course: null, cursor: null },
          "",
          read,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await author.call(
          "reviews/submit",
          aReviewSubmitInput({ body: BODY_2 }),
          read,
        )
      ).status,
    ).toBe(503);
    expect(
      (
        await author.call(
          "reviews/edit",
          { reviewId: id, termId: null, rating: 1, grade: null, body: BODY_2 },
          read,
        )
      ).status,
    ).toBe(503);
    expect(
      (
        await reader.call(
          "reports/create",
          { surface: "review", ref: id, reason: "other", note: null },
          read,
        )
      ).status,
    ).toBe(200);
    expect(
      (await author.call("reviews/delete", { reviewId: id }, read)).status,
    ).toBe(200);
  });
});

function handleCrossSite(): Promise<Response> {
  return handleApi(
    new Request("http://localhost:3000/api/reviews/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://evil.example",
        Cookie: author.cookie,
      },
      body: JSON.stringify(aReviewSubmitInput()),
    }),
    apiEnv(),
    { waitUntil: () => undefined },
    now(),
  );
}

describe("housekeeping", () => {
  it("clears rejected words after 30 days and removes deleted reviews", async () => {
    models("spam");
    const rejected = idOf(await author.submit(aReviewSubmitInput()));
    models("clean");
    const deleted = idOf(
      await author.submit(aReviewSubmitInput({ body: BODY_2 })),
    );
    await report(reader, deleted);
    await author.json("reviews/delete", { reviewId: deleted });
    advance(29 * DAY);
    await runDailyJob({ env: apiEnv() as unknown as Env, now: now() });
    expect(await reviewRow(rejected)).toMatchObject({
      body: aReviewSubmitInput().body,
    });
    advance(2 * DAY);
    await runDailyJob({ env: apiEnv() as unknown as Env, now: now() });
    expect(await reviewRow(rejected)).toMatchObject({
      status: "rejected",
      body: "",
    });
    expect(await reviewRow(deleted)).toBeNull();
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS n FROM reports WHERE ref = ?1")
        .bind(deleted)
        .first("n"),
    ).toBe(0);
  });

  it("keeps a purged account's reviews up, without an author", async () => {
    const id = idOf(await author.submit(aReviewSubmitInput()));
    await markDeleting(env.DB, author.id, now());
    advance(8 * DAY);
    await runDailyJob({ env: apiEnv() as unknown as Env, now: now() });
    expect(
      await env.DB.prepare("SELECT id FROM users WHERE id = ?1")
        .bind(author.id)
        .first(),
    ).toBeNull();
    expect(await reviewRow(id)).toMatchObject({
      author_id: null,
      status: "published",
    });
    expect((await list()).reviews.map((r) => r.id)).toEqual([id]);
    expect(
      PublicReviewSchema.safeParse({
        ...(await list()).reviews[0],
        author: "x",
      }).success,
    ).toBe(false);
  });
});
