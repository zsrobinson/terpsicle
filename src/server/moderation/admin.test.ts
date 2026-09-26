import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import {
  type QueueItem,
  QueueListResultSchema,
  ResolveResultSchema,
} from "~/core/schema";
import { type ApiEnv, type ApiOptions, handleApi } from "../api/router";
import type { AdminGuard, ModerationHandler } from "./admin";
import { GUARD_MODEL } from "./models";
import { moderate } from "./service";
import { decisionsFor } from "./store";

const NOW = new Date("2027-01-10T12:00:00.000Z");

const heldAi = {
  run: vi.fn(async (model: string) =>
    model === GUARD_MODEL
      ? { response: { safe: false, categories: ["S10"] } }
      : { response: {} },
  ),
} as unknown as Ai;

const apiEnv: ApiEnv = { ...env, AI: heldAi };
const owner: AdminGuard = async () => ({ directoryId: "owner" });

let n = 0;
async function holdOne(): Promise<string> {
  const targetId = `admin-msg-${++n}`;
  const result = await moderate(
    apiEnv,
    { kind: "chat", text: `held message ${n}`, context: { targetId } },
    { now: NOW },
  );
  expect(result.decision).toBe("hold");
  return targetId;
}

async function call(
  name: string,
  body: unknown,
  options: ApiOptions = { requireAdmin: owner },
): Promise<Response> {
  return handleApi(
    new Request(`https://terpsicle.com/api/admin/moderation/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    apiEnv,
    { waitUntil: () => undefined },
    NOW,
    options,
  );
}

async function queue(status = "open"): Promise<QueueItem[]> {
  const res = await call("queue", { status });
  return QueueListResultSchema.parse(await res.json()).items;
}

async function itemFor(targetId: string): Promise<QueueItem> {
  const item = (await queue()).find((i) => i.targetId === targetId);
  if (!item) throw new Error(`${targetId} isn't queued`);
  return item;
}

describe("admin moderation API", () => {
  it("is hidden from everyone but the admin, and from everyone until identity lands", async () => {
    for (const options of [{}, { requireAdmin: async () => null }]) {
      const res = await call("queue", {}, options);
      expect(res.status).toBe(404);
    }
  });

  it("lists held items with no author, and counts what's open", async () => {
    const targetId = await holdOne();
    const res = await call("queue", {});
    const body = QueueListResultSchema.parse(await res.json());
    expect(body.open).toBeGreaterThanOrEqual(1);
    const item = body.items.find((i) => i.targetId === targetId);
    expect(item).toMatchObject({
      kind: "chat",
      status: "open",
      text: `held message ${n}`,
      resolution: null,
    });
    expect(item?.reasons).toContainEqual({
      code: "hate",
      source: "guard",
      action: "hold",
      category: "S10",
    });
    expect(Object.keys(item ?? {})).not.toContain("author");
  });

  it("approves and removes with a reason, tells the owning feature, and undoes", async () => {
    const handler = vi.fn<ModerationHandler>(async () => undefined);
    const options: ApiOptions = {
      requireAdmin: owner,
      moderationHandlers: { chat: handler },
    };
    const approveId = await holdOne();
    const removeId = await holdOne();
    const toApprove = await itemFor(approveId);
    const toRemove = await itemFor(removeId);

    const approved = ResolveResultSchema.parse(
      await (
        await call(
          "resolve",
          { id: toApprove.id, action: "approve", reason: "fine" },
          options,
        )
      ).json(),
    );
    expect(approved).toMatchObject({
      status: "ok",
      item: {
        status: "closed",
        closedAt: NOW.toISOString(),
        resolution: { decision: "publish", reason: "fine" },
      },
    });
    const removed = ResolveResultSchema.parse(
      await (
        await call(
          "resolve",
          { id: toRemove.id, action: "remove", reason: "hate" },
          options,
        )
      ).json(),
    );
    expect(removed).toMatchObject({
      status: "ok",
      item: {
        status: "closed",
        resolution: { decision: "remove", reason: "hate" },
      },
    });
    expect(handler.mock.calls).toEqual([
      [approveId, "publish"],
      [removeId, "remove"],
    ]);
    expect((await queue("closed")).map((i) => i.targetId)).toContain(removeId);

    // Undo puts it back, held, and says so to the feature.
    const undone = ResolveResultSchema.parse(
      await (await call("undo", { id: toRemove.id }, options)).json(),
    );
    expect(undone).toMatchObject({
      status: "ok",
      item: { status: "open", closedAt: null, resolution: null },
    });
    expect(handler).toHaveBeenLastCalledWith(removeId, "hold");
    expect(
      (await decisionsFor(env.DB, "chat", removeId)).map(
        (d) => `${d.decided_by}:${d.stage}:${d.verdict}:${d.reason ?? ""}`,
      ),
    ).toEqual([
      "system:model:hold:",
      "admin:human:remove:hate",
      "admin:human:hold:",
    ]);

    const again = await call("undo", { id: toRemove.id }, options);
    expect(await again.json()).toEqual({ status: "nothing-to-undo" });
  });

  it("records nothing when the owning feature fails", async () => {
    const targetId = await holdOne();
    const item = await itemFor(targetId);
    const failing: ApiOptions = {
      requireAdmin: owner,
      moderationHandlers: {
        chat: async () => {
          throw new Error("room offline");
        },
      },
    };
    await expect(
      call(
        "resolve",
        { id: item.id, action: "approve", reason: "fine" },
        failing,
      ),
    ).rejects.toThrow("room offline");
    expect((await itemFor(targetId)).status).toBe("open");
  });

  it("won't undo onto an item that was held again since", async () => {
    const targetId = await holdOne();
    const first = await itemFor(targetId);
    await call("resolve", { id: first.id, action: "approve", reason: "fine" });
    // The author edits; the edit is held again, as a new open row.
    await moderate(
      apiEnv,
      { kind: "chat", text: "edited and held", context: { targetId } },
      { now: NOW },
    );
    const undo = await call("undo", { id: first.id });
    expect(await undo.json()).toEqual({ status: "nothing-to-undo" });
  });

  it("answers not-found for an unknown item and rejects bad input", async () => {
    const unknown = await call("resolve", {
      id: "AAAAAAAAAAAAAAAAAAAAAA",
      action: "remove",
      reason: "spam",
    });
    expect(await unknown.json()).toEqual({ status: "not-found" });
    expect(
      await (await call("undo", { id: "AAAAAAAAAAAAAAAAAAAAAA" })).json(),
    ).toEqual({ status: "not-found" });
    const bad = await call("resolve", {
      id: "AAAAAAAAAAAAAAAAAAAAAA",
      action: "delete",
      reason: "spam",
    });
    expect(bad.status).toBe(400);
  });
});
