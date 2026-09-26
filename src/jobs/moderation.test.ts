import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModerationInput } from "~/core/schema";
import type { ModerationHandler } from "~/server/moderation/handlers";
import { GUARD_MODEL } from "~/server/moderation/models";
import {
  MAX_RETRIES,
  type ModerationEnv,
  moderate,
  retryHeld,
} from "~/server/moderation/service";
import {
  decisionsFor,
  listQueueRows,
  listRetryRows,
  SNAPSHOT_DAYS,
} from "~/server/moderation/store";
import { allOf } from "./index";
import { runModerationJob } from "./moderation";

const CLEAN = {
  academic_integrity: 0,
  targets_person: 0,
  personal_info: 0,
  misconduct_claim: 0,
  spam: 0,
  off_topic: 0,
};

/** An AI binding that's down, or answers every call the same way. */
function ai(mode: "down" | "clean" | { guardCategories: string[] }): Ai {
  const run = vi.fn(async (model: string) => {
    if (mode === "down") throw new Error("3040: capacity exceeded");
    if (model === GUARD_MODEL)
      return {
        response:
          mode === "clean"
            ? { safe: true }
            : { safe: false, categories: mode.guardCategories },
      };
    return { response: CLEAN };
  });
  return { run } as unknown as Ai;
}

const withAi = (binding: Ai): ModerationEnv => ({ ...env, AI: binding });

let day = 0;
const nextDay = () => new Date(Date.UTC(2027, 2, 1 + day++, 12));

let n = 0;
const chat = (): ModerationInput => ({
  kind: "chat",
  text: `see you all at office hours ${++n}`,
  context: { targetId: `retry-msg-${n}` },
});

/** Holds a message because the models were down. */
async function heldByOutage(now: Date): Promise<string> {
  const input = chat();
  const result = await moderate(withAi(ai("down")), input, { now });
  expect(result.decision).toBe("hold");
  return input.context.targetId;
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM moderation_queue").run();
});

describe("moderation retries", () => {
  it("publishes an item on retry once the models answer, without the owner seeing it", async () => {
    const now = nextDay();
    const ref = await heldByOutage(now);
    const handler = vi.fn<ModerationHandler>(async () => undefined);
    const report = await retryHeld(withAi(ai("clean")), {
      now: new Date(now.getTime() + 5 * 60_000),
      handlers: { chat: handler },
    });
    expect(report).toMatchObject({ retried: 1, published: 1, toOwner: 0 });
    expect(handler).toHaveBeenCalledWith(ref, "publish");
    expect(await listRetryRows(env.DB, 10)).toEqual([]);
    expect(await listQueueRows(env.DB, "open", 10)).toEqual([]);
    expect(
      (await decisionsFor(env.DB, "chat", ref)).map((d) => d.verdict),
    ).toEqual(["hold", "allow"]);
  });

  it("sends an item to the owner once retries keep failing", async () => {
    const now = nextDay();
    const ref = await heldByOutage(now);
    for (let i = 1; i <= MAX_RETRIES; i++) {
      const report = await retryHeld(withAi(ai("down")), {
        now: new Date(now.getTime() + i * 5 * 60_000),
        handlers: {},
      });
      expect(report.retried).toBe(1);
      expect(report.toOwner).toBe(i === MAX_RETRIES ? 1 : 0);
    }
    const [open] = await listQueueRows(env.DB, "open", 10);
    expect(open).toMatchObject({
      ref,
      status: "open",
      snapshot: { retries: MAX_RETRIES },
    });
  });

  it("sends an item to the owner at once when the retry finds a real problem", async () => {
    const now = nextDay();
    const ref = await heldByOutage(now);
    const handler = vi.fn<ModerationHandler>(async () => undefined);
    const report = await retryHeld(withAi(ai({ guardCategories: ["S1"] })), {
      now: new Date(now.getTime() + 5 * 60_000),
      handlers: { chat: handler },
    });
    expect(report.toOwner).toBe(1);
    expect(handler).not.toHaveBeenCalled();
    const [open] = await listQueueRows(env.DB, "open", 10);
    expect(open).toMatchObject({ ref, urgent: true });
  });

  it("leaves an item waiting when the owning feature's handler fails", async () => {
    const now = nextDay();
    await heldByOutage(now);
    const report = await retryHeld(withAi(ai("clean")), {
      now: new Date(now.getTime() + 5 * 60_000),
      handlers: {
        chat: async () => {
          throw new Error("room offline");
        },
      },
    });
    expect(report.handlerErrors).toBe(1);
    expect(await listRetryRows(env.DB, 10)).toHaveLength(1);
  });
});

describe("the moderation job", () => {
  it("retries, and blanks held text 30 days after its item closed", async () => {
    const now = nextDay();
    const day = 86_400_000;
    const insert = (id: string, closedDaysAgo: number | null) =>
      env.DB.prepare(
        `INSERT INTO moderation_queue (id, surface, ref, snapshot, labels, urgent, status, created_at, closed_at)
         VALUES (?1, 'review', ?1, ?2, '[]', 0, ?3, ?4, ?5)`,
      )
        .bind(
          id,
          JSON.stringify({
            text: "held text",
            course: null,
            activeAssignments: false,
            scores: {},
            retries: 0,
          }),
          closedDaysAgo === null ? "open" : "closed",
          new Date(now.getTime() - 40 * day).toISOString(),
          closedDaysAgo === null
            ? null
            : new Date(now.getTime() - closedDaysAgo * day).toISOString(),
        )
        .run();
    await insert("old-closed-aaaaaaaaaaaa", SNAPSHOT_DAYS + 1);
    await insert("new-closed-aaaaaaaaaaaa", SNAPSHOT_DAYS - 1);
    await insert("still-open-aaaaaaaaaaaa", null);
    await heldByOutage(now);

    await runModerationJob({
      env: { ...env, AI: ai("clean") } as unknown as Env,
      now: new Date(now.getTime() + 5 * 60_000),
    });

    const snapshots = await env.DB.prepare(
      "SELECT id, snapshot IS NULL AS blank FROM moderation_queue ORDER BY id",
    ).all<{ id: string; blank: number }>();
    expect(snapshots.results).toEqual([
      { id: "new-closed-aaaaaaaaaaaa", blank: 0 },
      { id: "old-closed-aaaaaaaaaaaa", blank: 1 },
      { id: "still-open-aaaaaaaaaaaa", blank: 0 },
    ]);
  });

  it("runs every job sharing a cron, even after one fails, then reports the failure", async () => {
    const order: string[] = [];
    const failing = async () => {
      order.push("first");
      throw new Error("first failed");
    };
    const second = async () => {
      order.push("second");
    };
    await expect(
      allOf(failing, second)({ env: env as Env, now: nextDay() }),
    ).rejects.toThrow("first failed");
    expect(order).toEqual(["first", "second"]);
  });
});
