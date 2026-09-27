// "Group similar" over the real D1 (docs/FEEDBACK.md, "Triage"), with a
// stand-in for Workers AI.
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FeedbackKind } from "~/core/schema/feedback";
import { type GroupingEnv, groupOpenFeedback } from "./group";
import { insertFeedback } from "./store";

const NOW = new Date("2027-01-10T12:00:00.000Z");
let n = 0;

async function add(text: string, kind: FeedbackKind = "bug"): Promise<string> {
  n += 1;
  const id = `GR${String(n).padStart(20, "0")}`;
  await insertFeedback(env.DB, {
    id,
    kind,
    product: "schedule",
    path: "/schedule",
    text,
    expected: null,
    screenshot_key: null,
    element_shot_key: null,
    context: null,
    element: null,
    host: "terpsicle.com",
    user_id: null,
    undo_hash: null,
    created_at: new Date(NOW.getTime() - (100 - n) * 1_000).toISOString(),
  });
  return id;
}

async function groupsOf(ids: string[]) {
  const { results } = await env.DB.prepare(
    `SELECT f.id, f.group_id, g.summary FROM feedback f
     LEFT JOIN feedback_groups g ON g.id = f.group_id
     WHERE f.id IN (${ids.map((_, i) => `?${i + 1}`).join(", ")})`,
  )
    .bind(...ids)
    .all<{ id: string; group_id: string | null; summary: string | null }>();
  return new Map(results.map((r) => [r.id, r]));
}

const aiAnswering = (response: unknown) => {
  const run = vi.fn(async () => ({ response }));
  return { run, ai: { run } as unknown as Ai };
};

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM feedback").run();
  await env.DB.prepare("DELETE FROM feedback_groups").run();
});

describe("groupOpenFeedback", () => {
  it("stores the model's groups with their summaries", async () => {
    const map1 = await add("The route map is blank");
    const other = await add("Dark mode for Todo, please", "idea");
    const map2 = await add("Map shows nothing on my phone");
    // Newest first: map2 is 1, other 2, map1 3.
    const { run, ai } = aiAnswering({
      groups: [{ items: [1, 3], summary: "Route map stays blank" }],
    });
    const genv: GroupingEnv = { DB: env.DB, AI: ai };
    expect(await groupOpenFeedback(genv, NOW)).toEqual({
      status: "grouped",
      groups: 1,
      grouped: 2,
    });
    const rows = await groupsOf([map1, map2, other]);
    expect(rows.get(map1)?.summary).toBe("Route map stays blank");
    expect(rows.get(map2)?.group_id).toBe(rows.get(map1)?.group_id);
    expect(rows.get(other)?.group_id).toBeNull();
    // The words went fenced, as data.
    const inputs = run.mock.calls[0] as unknown as [
      string,
      { messages: { content: string }[] },
    ];
    expect(inputs[1].messages[1]?.content).toContain("The route map is blank");
  });

  it("leaves closed items alone and regroups the open ones", async () => {
    const a = await add("Blank map");
    const b = await add("Map is empty");
    const closed = await add("Old map bug");
    await env.DB.prepare("UPDATE feedback SET status = 'fixed' WHERE id = ?1")
      .bind(closed)
      .run();
    const genv: GroupingEnv = {
      DB: env.DB,
      AI: aiAnswering({ groups: [{ items: [1, 2], summary: "Blank map" }] }).ai,
    };
    await groupOpenFeedback(genv, NOW);
    // Next time the model finds nothing: the open items leave their group.
    await groupOpenFeedback(
      { DB: env.DB, AI: aiAnswering({ groups: [] }).ai },
      NOW,
    );
    const rows = await groupsOf([a, b, closed]);
    expect(rows.get(a)?.group_id).toBeNull();
    expect(rows.get(b)?.group_id).toBeNull();
    expect(rows.get(closed)?.group_id).toBeNull();
  });

  it("keeps the old groups when the model fails", async () => {
    const a = await add("One");
    const b = await add("Two");
    await groupOpenFeedback(
      {
        DB: env.DB,
        AI: aiAnswering({ groups: [{ items: [1, 2], summary: "Both" }] }).ai,
      },
      NOW,
    );
    const failing = { run: vi.fn(async () => Promise.reject(new Error("x"))) };
    expect(
      await groupOpenFeedback(
        { DB: env.DB, AI: failing as unknown as Ai },
        NOW,
      ),
    ).toEqual({ status: "unavailable", groups: 0, grouped: 0 });
    const rows = await groupsOf([a, b]);
    expect(rows.get(a)?.summary).toBe("Both");
  });

  it("groups offline in mock mode, by kind and product", async () => {
    await add("One");
    await add("Two");
    await add("An idea", "idea");
    expect(
      await groupOpenFeedback(
        { DB: env.DB, MODERATION_OFFLINE: "true", AUTH_TEST_MODE: "true" },
        NOW,
      ),
    ).toEqual({ status: "grouped", groups: 1, grouped: 2 });
  });
});
