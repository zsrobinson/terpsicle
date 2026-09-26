// Test-only: drives Reviews through the real router and D1, with the AI
// binding mocked (docs/MODERATION.md: tests mock `AI`). Used by the worker
// tests beside it; nothing in the app imports it.
import { env } from "cloudflare:workers";
import { vi } from "vitest";
import {
  type Identity,
  PLANETTERP_MANIFEST_KEY,
  type PlanetTerpDept,
  planetTerpDeptKey,
  type QueueItem,
  QueueListResultSchema,
  type ReviewSubmitInput,
  type ReviewWriteResult,
  ReviewWriteResultSchema,
} from "~/core/schema";
import { type ApiEnv, handleApi } from "../api/router";
import { startSession } from "../auth/session";
import { upsertUser } from "../auth/store";
import { GUARD_MODEL, POLICY_MODELS } from "../moderation/models";

export const ORIGIN = "http://localhost:3000";

let clock = Date.parse("2027-02-10T15:00:00.000Z");
export const now = () => new Date(clock);
export const setClock = (iso: string) => {
  clock = Date.parse(iso);
};
export const advance = (ms: number) => {
  clock += ms;
};
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

/** What the mocked models say about the next posts. */
export type Verdict = "clean" | "targets-person" | "spam" | "down";

const CLEAN = {
  academic_integrity: 0.02,
  targets_person: 0,
  personal_info: 0,
  misconduct_claim: 0,
  spam: 0,
  off_topic: 0.05,
};

let verdict: Verdict = "clean";
export const models = (v: Verdict) => {
  verdict = v;
};

export const ai = {
  run: vi.fn(async (model: string, _input: unknown) => {
    if (verdict === "down") throw new Error("Workers AI is down");
    if (model === GUARD_MODEL) return { response: { safe: true } };
    if (model === POLICY_MODELS.review || model === POLICY_MODELS.chat)
      return {
        response:
          verdict === "spam"
            ? { ...CLEAN, spam: 0.97 }
            : verdict === "targets-person"
              ? { ...CLEAN, targets_person: 0.85 }
              : CLEAN,
      };
    throw new Error(`unexpected model ${model}`);
  }),
};

export const apiEnv = (overrides: Partial<ApiEnv> = {}): ApiEnv => ({
  ...env,
  AI: ai as unknown as Ai,
  SIGN_IN_ENABLED: "true",
  AUTH_TEST_MODE: "true",
  AUTH_SECRET: "test-auth-secret-0123456789abcdefghijklmnopq",
  REVIEWS_ENABLED: "on",
  ...overrides,
});

export async function resetTables(): Promise<void> {
  models("clean");
  ai.run.mockClear();
  await env.DB.batch(
    [
      "reports",
      "moderation_queue",
      "moderation_decisions",
      "reviews",
      "instructor_names",
      "instructors",
      "counters",
      "sessions",
      "user_identities",
      "users",
    ].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  );
}

/**
 * Publishes a department's PlanetTerp file as the only one in the manifest.
 * (The tests build it with ~/fixtures, which only test files may import.)
 */
export async function publishPlanetTerp(file: PlanetTerpDept): Promise<void> {
  const hash = "00000000000000aa";
  await env.DATA.put(planetTerpDeptKey(file.dept, hash), JSON.stringify(file));
  await env.DATA.put(
    PLANETTERP_MANIFEST_KEY,
    JSON.stringify({
      schemaVersion: 1,
      generatedAt: now().toISOString(),
      gradesThrough: null,
      departments: [{ code: file.dept, hash }],
    }),
  );
}

/** A signed-in browser. `tadmin` is the admin in test mode. */
export class Person {
  private constructor(
    readonly id: string,
    readonly cookie: string,
  ) {}

  static async signIn(identity: Identity): Promise<Person> {
    await upsertUser(env.DB, identity, now());
    const id = identity.directoryId;
    const setCookie = await startSession(env.DB, id, now());
    return new Person(id, setCookie.split(";")[0] ?? "");
  }

  call(path: string, body: unknown, envOverrides: Partial<ApiEnv> = {}) {
    return call(path, body, this.cookie, envOverrides);
  }

  async json(path: string, body: unknown): Promise<unknown> {
    const response = await this.call(path, body);
    if (response.status !== 200)
      throw new Error(`${path}: ${response.status} ${await response.text()}`);
    return response.json();
  }

  async submit(input: ReviewSubmitInput): Promise<ReviewWriteResult> {
    return ReviewWriteResultSchema.parse(
      await this.json("reviews/submit", input),
    );
  }
}

export function call(
  path: string,
  body: unknown,
  cookie = "",
  envOverrides: Partial<ApiEnv> = {},
): Promise<Response> {
  return handleApi(
    new Request(`${ORIGIN}/api/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: ORIGIN,
        "Sec-Fetch-Site": "same-origin",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
    apiEnv(envOverrides),
    { waitUntil: () => undefined },
    now(),
  );
}

/** The owner's open queue items. */
export async function openQueue(admin: Person): Promise<QueueItem[]> {
  return QueueListResultSchema.parse(
    await admin.json("admin/moderation/queue", { status: "open" }),
  ).items;
}

/** The review id of a published, held or rejected write. */
export function idOf(result: ReviewWriteResult): string {
  if ("reviewId" in result) return result.reviewId;
  throw new Error(`no review id: ${JSON.stringify(result)}`);
}
