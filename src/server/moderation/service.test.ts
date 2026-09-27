import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import type { ModerationInput } from "~/core/schema";
import { DEFAULT_MODERATION_CONFIG, resolveConfig } from "./classify";
import {
  GUARD_MODEL,
  POLICY_MODELS,
  parseGuardOutput,
  parsePolicyOutput,
} from "./models";
import { currentDecision, type ModerationEnv, moderate } from "./service";
import {
  decisionsFor,
  getQueueRow,
  listQueueRows,
  listRetryRows,
} from "./store";

// Each test gets its own UTC day, so the daily-cap counter starts at zero.
let day = 0;
const nextDay = () => new Date(Date.UTC(2026, 9, 1 + day++, 15));

const CLEAN_SCORES = {
  academic_integrity: 0.05,
  targets_person: 0,
  personal_info: 0,
  misconduct_claim: 0,
  spam: 0,
  off_topic: 0.1,
};

type Reply = unknown | (() => Promise<unknown>);

/**
 * A stand-in for the AI binding: Llama Guard and the policy model answer
 * from their own queues (the last reply repeats), and every call is recorded.
 */
function mockAi(replies: { guard?: Reply[]; policy?: Reply[] } = {}): {
  ai: Ai;
  run: ReturnType<typeof vi.fn>;
} {
  const guard = [...(replies.guard ?? [{ safe: true }])];
  const policy = [...(replies.policy ?? [CLEAN_SCORES])];
  const next = async (queue: Reply[]) => {
    const reply = queue.length > 1 ? queue.shift() : queue[0];
    return typeof reply === "function"
      ? (reply as () => Promise<unknown>)()
      : { response: reply };
  };
  const run = vi.fn(async (model: string) => {
    if (model === GUARD_MODEL) return next(guard);
    if (Object.values(POLICY_MODELS).includes(model)) return next(policy);
    throw new Error(`unexpected model ${model}`);
  });
  return { ai: { run } as unknown as Ai, run };
}

const testEnv = (ai: Ai, cap?: string): ModerationEnv => ({
  ...env,
  AI: ai,
  ...(cap ? { MODERATION_DAILY_CAP: cap } : {}),
});

let target = 0;
const review = (text: string): ModerationInput => ({
  kind: "review",
  text,
  context: { targetId: `review-${++target}`, course: "CMSC351" },
});
const chat = (text: string, activeAssignments = false): ModerationInput => ({
  kind: "chat",
  text,
  context: {
    targetId: `msg-${++target}`,
    course: "CMSC351",
    activeAssignments,
  },
});

const GOOD_REVIEW =
  "Lectures were clear and well paced. Exams were hard but fair, and office hours helped a lot.";

const modelsCalled = (run: ReturnType<typeof vi.fn>) =>
  run.mock.calls.map((c) => c[0]);

describe("moderate", () => {
  it("publishes a clean review after both models, and records it without queueing", async () => {
    const { ai, run } = mockAi();
    const input = review(GOOD_REVIEW);
    const result = await moderate(testEnv(ai), input, { now: nextDay() });
    expect(result).toEqual({
      decision: "publish",
      reasons: [],
      model: { guard: GUARD_MODEL, policy: POLICY_MODELS.review },
      scores: {
        "academic-integrity": 0.05,
        "targets-person": 0,
        "personal-info": 0,
        "misconduct-claim": 0,
        spam: 0,
        "off-topic": 0.1,
      },
    });
    expect(modelsCalled(run).sort()).toEqual(
      [GUARD_MODEL, POLICY_MODELS.review].sort(),
    );

    const [row] = await decisionsFor(env.DB, "review", input.context.targetId);
    expect(row).toMatchObject({
      surface: "review",
      stage: "model",
      verdict: "allow",
      decided_by: "system",
      guard: { safe: true, categories: [] },
      models: { guard: GUARD_MODEL, policy: POLICY_MODELS.review },
    });
    expect(row?.latency_ms).toBeGreaterThanOrEqual(0);
    // Moderation stores a reference, never an author.
    expect(Object.keys(row ?? {})).not.toContain("author");
    expect(
      await currentDecision(env.DB, "review", input.context.targetId),
    ).toBe("publish");
    expect(
      (await listQueueRows(env.DB, "open", 100)).some(
        (r) => r.ref === input.context.targetId,
      ),
    ).toBe(false);
  });

  it("reads every chat message, and only very sure scores hold it", async () => {
    // Contact details, answers and links are fine in chat; the small model
    // over-reads them. Spam needs a very high score, personal info also
    // needs someone else's details to expose, and academic integrity never
    // acts.
    const noisy = mockAi({
      policy: [
        {
          academic_integrity: 1,
          targets_person: 0,
          personal_info: 1,
          spam: 0.85,
        },
      ],
    });
    const fine = await moderate(
      testEnv(noisy.ai),
      chat("study group tonight, text me at 301-555-0199"),
      { now: nextDay() },
    );
    expect(fine.decision).toBe("publish");
    expect(fine.reasons).toEqual([]);
    expect(fine.model).toEqual({
      guard: GUARD_MODEL,
      policy: POLICY_MODELS.chat,
    });
    expect(modelsCalled(noisy.run).sort()).toEqual(
      [GUARD_MODEL, POLICY_MODELS.chat].sort(),
    );

    const mocking = await moderate(
      testEnv(
        mockAi({
          policy: [
            {
              academic_integrity: 0,
              targets_person: 0.9,
              personal_info: 0,
              spam: 0,
            },
          ],
        }).ai,
      ),
      chat(
        "did everyone hear Marcus ask if Java is JavaScript, how is he a CS major",
      ),
      { now: nextDay() },
    );
    expect(mocking.decision).toBe("hold");
    expect(mocking.reasons).toEqual([
      { code: "targets-person", source: "policy", action: "hold", score: 0.9 },
    ]);

    const exposed = await moderate(
      testEnv(
        mockAi({
          policy: [{ targets_person: 0, personal_info: 0.95, spam: 0.99 }],
        }).ai,
      ),
      chat("jordan's home address is 12 Oak Ln, go tell him what you think"),
      { now: nextDay() },
    );
    // Held for a person, never removed: spam doesn't remove chat.
    expect(exposed.decision).toBe("hold");
    expect(exposed.reasons.map((r) => `${r.code}:${r.action}`)).toEqual([
      "personal-info:hold",
      "spam:hold",
    ]);
  });

  it("lets answers, homework talk, code and links through in chat", async () => {
    const sure = mockAi({
      policy: [{ targets_person: 0, personal_info: 0, spam: 0 }],
    });
    for (const [text, active] of [
      ["quiz 7 answers: 1. B 2. D 3. A 4. C 5. B", true],
      ["does anyone have the answers to hw 6? dm me", true],
      ["it's all on chegg.com/homework-help, every problem", true],
      ["here's my function:\n```c\nint f(int x) {\n  return x;\n}\n```", true],
      ["this video helps a lot https://youtu.be/abc123", false],
      ["that quiz was so stupid lol", false],
    ] as const) {
      const result = await moderate(testEnv(sure.ai), chat(text, active), {
        now: nextDay(),
      });
      expect(result.decision, text).toBe("publish");
    }
  });

  it("publishes the smallest messages without calling a model", async () => {
    const { ai, run } = mockAi();
    const input = chat("thanks!!");
    const result = await moderate(testEnv(ai), input, { now: nextDay() });
    expect(result).toEqual({
      decision: "publish",
      reasons: [],
      model: { guard: null, policy: null },
      scores: {},
    });
    expect(run).not.toHaveBeenCalled();
    const [row] = await decisionsFor(env.DB, "chat", input.context.targetId);
    expect(row).toMatchObject({ stage: "rules", verdict: "allow" });
  });

  it("asks only Llama Guard about unflagged chat when chatPolicy is flagged", async () => {
    const { ai, run } = mockAi();
    const result = await moderate(
      testEnv(ai),
      chat("anyone want to study for the midterm tonight?"),
      {
        now: nextDay(),
        config: { ...DEFAULT_MODERATION_CONFIG, chatPolicy: "flagged" },
      },
    );
    expect(result.decision).toBe("publish");
    expect(result.model).toEqual({ guard: GUARD_MODEL, policy: null });
    expect(modelsCalled(run)).toEqual([GUARD_MODEL]);
  });

  it("asks the policy model about flagged chat when chatPolicy is flagged", async () => {
    const { ai, run } = mockAi({
      policy: [{ targets_person: 0, personal_info: 0, spam: 0.1 }],
    });
    const result = await moderate(testEnv(ai), chat("q1) a, q2) d, q3) c"), {
      now: nextDay(),
      config: { ...DEFAULT_MODERATION_CONFIG, chatPolicy: "flagged" },
    });
    expect(modelsCalled(run).sort()).toEqual(
      [GUARD_MODEL, POLICY_MODELS.chat].sort(),
    );
    expect(result.decision).toBe("publish");
    expect(result.reasons.map((r) => `${r.code}:${r.action}`)).toEqual([
      "shares-answers:flag",
    ]);
  });

  it("holds what Llama Guard calls unsafe, and puts threats first in the queue", async () => {
    const now = nextDay();
    const hate = chat("some message Llama Guard dislikes");
    const threat = chat("some message that reads like a threat");
    await moderate(
      testEnv(mockAi({ guard: [{ safe: false, categories: ["S10"] }] }).ai),
      hate,
      { now },
    );
    const result = await moderate(
      testEnv(mockAi({ guard: ["unsafe\nS1"] }).ai),
      threat,
      { now: new Date(now.getTime() + 1_000) },
    );
    expect(result.decision).toBe("hold");
    expect(result.reasons).toEqual([
      { code: "violence", source: "guard", action: "hold", category: "S1" },
    ]);
    const open = await listQueueRows(env.DB, "open", 100);
    const ids = open.map((r) => r.ref);
    expect(ids.indexOf(threat.context.targetId)).toBeLessThan(
      ids.indexOf(hate.context.targetId),
    );
    const queued = open.find((r) => r.ref === threat.context.targetId);
    expect(queued).toMatchObject({
      surface: "chat",
      snapshot: {
        text: threat.text,
        course: "CMSC351",
        activeAssignments: false,
        retries: 0,
      },
      urgent: true,
      status: "open",
    });
  });

  it("removes slurs without calling a model", async () => {
    const { ai, run } = mockAi();
    const result = await moderate(testEnv(ai), chat("you absolute f@ggot"), {
      now: nextDay(),
    });
    expect(result.decision).toBe("remove");
    expect(result.model).toEqual({ guard: null, policy: null });
    expect(run).not.toHaveBeenCalled();
    const [row] = await decisionsFor(env.DB, "chat", `msg-${target}`);
    expect(row).toMatchObject({
      stage: "rules",
      verdict: "reject",
      guard: null,
      policy: null,
      models: null,
      latency_ms: null,
    });
  });

  it("removes clear spam and holds likely academic-integrity problems", async () => {
    const spam = await moderate(
      testEnv(mockAi({ policy: [{ ...CLEAN_SCORES, spam: 0.97 }] }).ai),
      review(
        "Best essay writing service on campus, guaranteed A, message us for rates and discounts today!",
      ),
      { now: nextDay() },
    );
    expect(spam.decision).toBe("remove");
    const integrity = await moderate(
      testEnv(
        mockAi({ policy: [{ ...CLEAN_SCORES, academic_integrity: 0.8 }] }).ai,
      ),
      review(GOOD_REVIEW),
      { now: nextDay() },
    );
    expect(integrity.decision).toBe("hold");
    expect(integrity.reasons).toEqual([
      {
        code: "academic-integrity",
        source: "policy",
        action: "hold",
        score: 0.8,
      },
    ]);
  });

  it("holds when the policy model's answer isn't valid JSON", async () => {
    const { ai } = mockAi({ policy: ["Sure! Here are the scores: low."] });
    const result = await moderate(testEnv(ai), review(GOOD_REVIEW), {
      now: nextDay(),
    });
    expect(result.decision).toBe("hold");
    expect(result.reasons).toEqual([
      { code: "model-unavailable", source: "system", action: "hold" },
    ]);
  });

  it("holds when Llama Guard's answer can't be read", async () => {
    const { ai } = mockAi({ guard: [{ verdict: "maybe" }] });
    const result = await moderate(testEnv(ai), chat("hello all"), {
      now: nextDay(),
    });
    expect(result.decision).toBe("hold");
  });

  it("holds when a model times out or throws", async () => {
    const never = () => new Promise(() => undefined);
    const timedOut = await moderate(
      testEnv(mockAi({ guard: [never] }).ai),
      chat("hello all"),
      {
        now: nextDay(),
        config: { ...DEFAULT_MODERATION_CONFIG, timeoutMs: 20 },
      },
    );
    expect(timedOut).toMatchObject({
      decision: "hold",
      reasons: [
        { code: "model-unavailable", source: "system", action: "hold" },
      ],
    });

    const down = await moderate(
      testEnv(
        mockAi({
          policy: [
            async () => {
              throw new Error("3040: JSON Mode couldn't be met");
            },
          ],
        }).ai,
      ),
      review(GOOD_REVIEW),
      { now: nextDay() },
    );
    expect(down.decision).toBe("hold");
  });

  it("races a second attempt against a slow one, and retries an error once", async () => {
    const never = () => new Promise(() => undefined);
    const slow = mockAi({ guard: [never, { safe: true }] });
    const hedged = await moderate(testEnv(slow.ai), chat("hello all"), {
      now: nextDay(),
      config: {
        ...DEFAULT_MODERATION_CONFIG,
        timeoutMs: 2_000,
        hedgeAfterMs: 10,
      },
    });
    expect(hedged.decision).toBe("publish");
    expect(
      modelsCalled(slow.run).filter((m) => m === GUARD_MODEL),
    ).toHaveLength(2);

    const flaky = mockAi({
      guard: [
        async () => {
          throw new Error("3040: capacity temporarily exceeded");
        },
        { safe: true },
      ],
    });
    const retried = await moderate(testEnv(flaky.ai), chat("hello all"), {
      now: nextDay(),
    });
    expect(retried.decision).toBe("publish");
    expect(
      modelsCalled(flaky.run).filter((m) => m === GUARD_MODEL),
    ).toHaveLength(2);
  });

  it("holds once the daily cap is spent", async () => {
    const now = nextDay();
    const { ai, run } = mockAi();
    // A review costs two calls; the cap is three.
    const first = await moderate(testEnv(ai, "3"), review(GOOD_REVIEW), {
      now,
    });
    const second = await moderate(testEnv(ai, "3"), review(GOOD_REVIEW), {
      now,
    });
    expect(first.decision).toBe("publish");
    expect(second.decision).toBe("hold");
    expect(second.reasons).toContainEqual({
      code: "daily-cap",
      source: "system",
      action: "hold",
    });
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("waits for a retry, not the owner, when only a model failure held it", async () => {
    const input = review(GOOD_REVIEW);
    const result = await moderate(
      testEnv(mockAi({ policy: ["not json"] }).ai),
      input,
      { now: nextDay() },
    );
    expect(result.decision).toBe("hold");
    const row = (await listRetryRows(env.DB, 100)).find(
      (r) => r.ref === input.context.targetId,
    );
    expect(row).toMatchObject({ status: "retry", urgent: false });
    expect(
      (await listQueueRows(env.DB, "open", 100)).some(
        (r) => r.ref === input.context.targetId,
      ),
    ).toBe(false);
  });

  it("clears a waiting hold when an edit passes", async () => {
    const input = review(`${GOOD_REVIEW} Call 301-555-0199.`);
    const now = nextDay();
    const held = await moderate(testEnv(mockAi().ai), input, { now });
    expect(held.decision).toBe("hold");
    const edited = await moderate(
      testEnv(mockAi().ai),
      { ...input, text: GOOD_REVIEW },
      { now: new Date(now.getTime() + 60_000) },
    );
    expect(edited.decision).toBe("publish");
    const open = await listQueueRows(env.DB, "open", 100);
    expect(open.some((r) => r.ref === input.context.targetId)).toBe(false);
    expect(
      (await decisionsFor(env.DB, "review", input.context.targetId)).map(
        (d) => d.verdict,
      ),
    ).toEqual(["hold", "allow"]);
    expect(await getQueueRow(env.DB, "nope-nope-nope-nope-nop")).toBeNull();
  });

  it("uses offline stand-ins only for chat, in mock mode's test mode", async () => {
    const { ai, run } = mockAi({
      guard: [() => Promise.reject(new Error("offline"))],
      policy: [() => Promise.reject(new Error("offline"))],
    });
    const offline = { ...testEnv(ai), MODERATION_OFFLINE: "true" };
    const mock = { ...offline, AUTH_TEST_MODE: "true" };
    const clean = await moderate(mock, chat("anyone at office hours?"), {
      now: nextDay(),
    });
    expect(clean.decision).toBe("publish");
    expect(run).not.toHaveBeenCalled();
    // The rules still hold what they hold.
    expect(
      (
        await moderate(mock, chat("found a chink in his argument"), {
          now: nextDay(),
        })
      ).decision,
    ).toBe("hold");
    // Reviews keep the real models, which can't answer offline: they wait.
    expect(
      (await moderate(mock, review(GOOD_REVIEW), { now: nextDay() })).decision,
    ).toBe("hold");
    expect(run).toHaveBeenCalled();
    // Without test mode the switch does nothing for chat either.
    run.mockClear();
    await moderate(offline, chat("anyone at office hours?"), {
      now: nextDay(),
    });
    expect(run).toHaveBeenCalled();
  });

  it("rejects malformed input instead of guessing", async () => {
    await expect(
      moderate(
        testEnv(mockAi().ai),
        { kind: "chat", text: "hi", context: { targetId: "has spaces" } },
        { now: nextDay() },
      ),
    ).rejects.toThrow();
  });
});

describe("model output parsing", () => {
  it("reads Llama Guard as an object or as text", () => {
    expect(parseGuardOutput({ safe: true, categories: [] })).toEqual({
      safe: true,
      categories: [],
    });
    expect(
      parseGuardOutput({ safe: false, categories: ["S10: Hate", "S1"] }),
    ).toEqual({
      safe: false,
      categories: ["S10", "S1"],
    });
    expect(parseGuardOutput("safe")).toEqual({ safe: true, categories: [] });
    expect(parseGuardOutput(" unsafe\nS2,S14")).toEqual({
      safe: false,
      categories: ["S2", "S14"],
    });
    expect(parseGuardOutput('{"safe":false,"categories":["S7"]}')).toEqual({
      safe: false,
      categories: ["S7"],
    });
    expect(parseGuardOutput("I think it's fine")).toBeNull();
    expect(parseGuardOutput(undefined)).toBeNull();
  });

  it("holds an unsafe verdict with no category it knows", async () => {
    const result = await moderate(
      testEnv(mockAi({ guard: [{ safe: false, categories: [] }] }).ai),
      chat("hello all"),
      { now: nextDay() },
    );
    expect(result.reasons).toEqual([
      { code: "unsafe", source: "guard", action: "hold" },
    ]);
  });

  it("needs every policy score, as numbers from 0 to 1", () => {
    expect(
      parsePolicyOutput(
        "chat",
        '```json\n{"targets_person":"0.9","personal_info":0,"spam":0}\n```',
      ),
    ).toEqual({
      "targets-person": 0.9,
      "personal-info": 0,
      spam: 0,
    });
    expect(
      parsePolicyOutput("chat", { targets_person: 0.1, personal_info: 0 }),
    ).toBeNull();
    expect(
      parsePolicyOutput("chat", {
        targets_person: null,
        personal_info: 0,
        spam: 0,
      }),
    ).toBeNull();
    expect(
      parsePolicyOutput("chat", {
        targets_person: 7,
        personal_info: 0,
        spam: 0,
      }),
    ).toBeNull();
    expect(parsePolicyOutput("chat", 42)).toBeNull();
    // Reviews still need all six.
    expect(
      parsePolicyOutput("review", {
        targets_person: 0,
        personal_info: 0,
        spam: 0,
      }),
    ).toBeNull();
  });
});

describe("configuration", () => {
  it("merges valid overrides and ignores invalid ones", () => {
    expect(resolveConfig(undefined)).toBe(DEFAULT_MODERATION_CONFIG);
    expect(resolveConfig("not json")).toBe(DEFAULT_MODERATION_CONFIG);
    expect(resolveConfig('{"timeoutMs": 5}')).toBe(DEFAULT_MODERATION_CONFIG);
    const merged = resolveConfig(
      JSON.stringify({
        timeoutMs: 3_000,
        guardActions: { S5: "hold" },
        policyThresholds: { spam: { hold: 0.4 } },
      }),
    );
    expect(merged.timeoutMs).toBe(3_000);
    expect(merged.guardActions.S5).toBe("hold");
    expect(merged.guardActions.S1).toBe("hold");
    expect(merged.policyThresholds.review.spam).toEqual({ hold: 0.4 });
    expect(merged.policyThresholds.review["targets-person"]).toEqual({
      hold: 0.5,
    });
    // `policyThresholds` reaches chat too, unless chat has its own.
    expect(merged.policyThresholds.chat.spam).toEqual({ hold: 0.4 });
    expect(merged.policyThresholds.chat["personal-info"]).toEqual({
      hold: 0.9,
    });
    const chatOnly = resolveConfig(
      JSON.stringify({
        policyThresholds: { spam: { hold: 0.4 } },
        chatPolicyThresholds: { spam: { hold: 0.95 } },
      }),
    );
    expect(chatOnly.policyThresholds.chat.spam).toEqual({ hold: 0.95 });
    expect(chatOnly.policyThresholds.review.spam).toEqual({ hold: 0.4 });
  });

  it("uses MODERATION_CONFIG's thresholds from the environment", async () => {
    const result = await moderate(
      {
        ...testEnv(mockAi({ policy: [{ ...CLEAN_SCORES, spam: 0.3 }] }).ai),
        MODERATION_CONFIG: JSON.stringify({
          policyThresholds: { spam: { hold: 0.25 } },
        }),
      },
      review(GOOD_REVIEW),
      { now: nextDay() },
    );
    expect(result.decision).toBe("hold");
  });
});
