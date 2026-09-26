// The anonymity payload tests (docs/V2.md §7.5). The backend stores who wrote
// a review, so people can edit and delete their own and limits work; nothing
// returned to readers, to the admin, or to moderation may carry it. This
// walks a review through every state and every route, and checks each
// answer, the moderation tables and the models' input for the author's
// directory ID, name and email, and for author-shaped fields.
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  PublicReviewSchema,
  QueueItemSchema,
  ReviewListResultSchema,
  ReviewWriteResultSchema,
} from "~/core/schema";
import {
  anIdentity,
  anInstructor,
  aPlanetTerpDept,
  aReviewSubmitInput,
} from "~/fixtures";
import { retryHeld } from "../moderation/service";
import {
  advance,
  ai,
  apiEnv,
  call,
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

// Distinctive, so a match anywhere means a leak.
const AUTHOR_ID = "zqanonauthor";
const AUTHOR_NAME = "Quillon Vantablack";
const AUTHOR_EMAIL = `${AUTHOR_ID}@terpmail.umd.edu`;

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

/** Field names that would carry someone's identity, anywhere in a payload. */
const IDENTITY_KEY =
  /author|user|email|directory|reporter|name$|^name|picture|avatar|sub$/i;

/** Fields that do belong in a payload even though they match the pattern. */
const ALLOWED_KEYS = new Set([
  // The instructor's names, in the author's own reviews/mine.
  "instructorName",
  "reviewedName",
]);

function identityKeys(value: unknown, path = "$"): string[] {
  if (Array.isArray(value))
    return value.flatMap((v, i) => identityKeys(v, `${path}[${i}]`));
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, v]) => [
    ...(IDENTITY_KEY.test(key) && !ALLOWED_KEYS.has(key)
      ? [`${path}.${key}`]
      : []),
    ...identityKeys(v, `${path}.${key}`),
  ]);
}

/** Asserts a payload says nothing about who wrote the review. */
function expectAnonymous(label: string, payload: unknown): void {
  const text = JSON.stringify(payload);
  expect(identityKeys(payload), `${label}: identity fields`).toEqual([]);
  for (const secret of [AUTHOR_ID, AUTHOR_NAME, AUTHOR_EMAIL, "Quillon"])
    expect(text, `${label}: mentions the author`).not.toContain(secret);
}

let author: Person;
let reader: Person;
let admin: Person;
/** Every answer collected on the way, by route. */
let seen: [string, unknown][];

async function record(
  label: string,
  person: Person | null,
  path: string,
  body: unknown,
) {
  const response = person
    ? await person.call(path, body)
    : await call(path, body);
  const payload: unknown = await response.json();
  seen.push([label, payload]);
  return payload;
}

beforeEach(async () => {
  setClock("2027-03-03T18:00:00.000Z");
  await resetTables();
  await publishPlanetTerp(cmscPlanetTerp());
  author = await signIn(AUTHOR_ID, AUTHOR_NAME);
  reader = await signIn("tclassmate", "Test Classmate");
  admin = await signIn("tadmin", "Test Admin");
  seen = [];
});

const BODY_2 =
  "Exams were long but fair, and the TA sections cleared up the proofs every week.";
const BODY_3 =
  "Projects took forever, though the autograder feedback taught me a lot about testing.";

describe("anonymity payloads (V2 §7.5)", () => {
  it("no answer to readers, the admin or moderation names the author", async () => {
    // Published, then an edit held and approved.
    const published = idOf(
      ReviewWriteResultSchema.parse(
        await record(
          "submit (published)",
          author,
          "reviews/submit",
          aReviewSubmitInput(),
        ),
      ),
    );
    models("targets-person");
    await record("edit (held)", author, "reviews/edit", {
      reviewId: published,
      termId: null,
      rating: 2,
      grade: "B",
      body: BODY_2,
    });
    // Held on submit; then a failed check, retried.
    await record(
      "submit (held)",
      author,
      "reviews/submit",
      aReviewSubmitInput({ reviewedName: "Clyde Kruskal" }),
    );
    models("down");
    await record(
      "submit (retry)",
      author,
      "reviews/submit",
      aReviewSubmitInput({ course: "CMSC330", body: BODY_3 }),
    );
    models("clean");
    advance(HOUR);
    expect(await retryHeld(apiEnv(), { now: now() })).toMatchObject({
      published: 1,
    });
    // Removed by the models.
    models("spam");
    await record(
      "submit (rejected)",
      author,
      "reviews/submit",
      aReviewSubmitInput({ course: "CMSC216", body: `${BODY_3} Spam.` }),
    );
    models("clean");
    // Stage 0 and limits.
    await record(
      "submit (invalid)",
      author,
      "reviews/submit",
      aReviewSubmitInput({ body: "Short." }),
    );

    // Readers report it; three hide it.
    for (const [i, reason] of (
      ["off-topic", "other", "hate"] as const
    ).entries()) {
      const person = i === 0 ? reader : await signIn(`treporter${i}`);
      await record(`report ${reason}`, person, "reports/create", {
        surface: "review",
        ref: published,
        reason,
        note: `Reported by ${person.id}.`,
      });
    }
    await record("report (own)", author, "reports/create", {
      surface: "review",
      ref: published,
      reason: "other",
      note: null,
    });

    // What readers see, signed out, signed in, and as the author.
    const listInput = { instructorId: "kruskal", course: null, cursor: null };
    await record("list (signed out)", null, "reviews/list", listInput);
    await record("list (reader)", reader, "reviews/list", listInput);
    await record("list (author)", author, "reviews/list", listInput);

    // Everything the admin sees, and every admin answer.
    const queue = await openQueue(admin);
    expect(queue.length).toBeGreaterThanOrEqual(2);
    seen.push(["admin queue (open)", queue]);
    const [first, second] = queue;
    if (!first || !second) throw new Error("expected two queue items");
    await record("admin resolve (approve)", admin, "admin/moderation/resolve", {
      id: first.id,
      action: "approve",
      reason: "fine",
    });
    await record("admin resolve (remove)", admin, "admin/moderation/resolve", {
      id: second.id,
      action: "remove",
      reason: "hate",
    });
    await record("admin undo", admin, "admin/moderation/undo", {
      id: second.id,
    });
    await record("admin queue (closed)", admin, "admin/moderation/queue", {
      status: "closed",
    });
    await record("list (after approval)", null, "reviews/list", {
      ...listInput,
      instructorId: "brandt",
    });
    await record("delete", author, "reviews/delete", { reviewId: published });

    expect(seen.length).toBeGreaterThan(15);
    for (const [label, payload] of seen) expectAnonymous(label, payload);
    for (const item of queue) QueueItemSchema.parse(item);
  });

  it("keeps the author out of the moderation tables and the models' input", async () => {
    models("targets-person");
    const id = idOf(await author.submit(aReviewSubmitInput()));
    await reader.json("reports/create", {
      surface: "review",
      ref: id,
      reason: "personal-info",
      note: null,
    });
    for (const table of ["moderation_decisions", "moderation_queue"]) {
      const { results } = await env.DB.prepare(`SELECT * FROM ${table}`).all();
      expect(results.length).toBeGreaterThan(0);
      expectAnonymous(table, results);
    }
    expect(ai.run).toHaveBeenCalled();
    expectAnonymous("model input", ai.run.mock.calls);
  });

  it("gives the author their own reviews without an author field", async () => {
    await author.submit(aReviewSubmitInput());
    const mine = await author.json("reviews/mine", {});
    expect(identityKeys(mine)).toEqual([]);
    expect(JSON.stringify(mine)).not.toContain(AUTHOR_ID);
  });

  it("rounds dates to the month and refuses extra fields in a public review", async () => {
    await author.submit(aReviewSubmitInput());
    const page = ReviewListResultSchema.parse(
      await (
        await call("reviews/list", {
          instructorId: "brandt",
          course: null,
          cursor: null,
        })
      ).json(),
    );
    const [review] = page.reviews;
    expect(review?.createdMonth).toBe("2027-03");
    expect(Object.keys(review ?? {}).sort()).toEqual([
      "body",
      "course",
      "createdMonth",
      "edited",
      "grade",
      "id",
      "rating",
      "termId",
    ]);
    expect(
      PublicReviewSchema.safeParse({ ...review, authorId: AUTHOR_ID }).success,
    ).toBe(false);
    // The cursor is a review id, never a timestamp that would undo the rounding.
    expect(page.next === null || /^[A-Za-z0-9_-]{22}$/.test(page.next)).toBe(
      true,
    );
  });
});
