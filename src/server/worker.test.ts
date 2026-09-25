import {
  createExecutionContext,
  createScheduledController,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import { CRON_JOBS, UnknownCronError } from "~/jobs/index";
import { testBindings } from "./test-bindings";
import { createWorker } from "./worker";

const app = { fetch: vi.fn(async () => new Response("app shell")) };
const worker = createWorker(app);

async function get(url: string, init?: RequestInit) {
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request(url, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

describe("fetch", () => {
  it("hands everything else to the app", async () => {
    const response = await get("https://terpsicle.com/?plan=abc");
    expect(await response.text()).toBe("app shell");
  });

  it("301s www to the apex, keeping path and query", async () => {
    const response = await get("https://www.terpsicle.com/x?plan=abc");
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe(
      "https://terpsicle.com/x?plan=abc",
    );
  });
});

describe("/data/*", () => {
  it("serves an R2 object with a short max-age and an ETag", async () => {
    await env.DATA.put("t1/manifest.json", '{"schemaVersion":1}');
    const response = await get("https://terpsicle.com/data/t1/manifest.json");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ schemaVersion: 1 });
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(response.headers.get("ETag")).toMatch(/^"/);
  });

  it("answers a matching If-None-Match with a bodyless 304", async () => {
    await env.DATA.put("t2/terms.json", "[]");
    const first = await get("https://terpsicle.com/data/t2/terms.json");
    const etag = first.headers.get("ETag") ?? "";
    await first.arrayBuffer();

    const second = await get("https://terpsicle.com/data/t2/terms.json", {
      headers: { "If-None-Match": `W/${etag}` },
    });
    expect(second.status).toBe(304);
    expect(second.headers.get("ETag")).toBe(etag);
    expect(await second.text()).toBe("");
  });

  it("marks content-hashed files immutable", async () => {
    await env.DATA.put("t3/geo/routes.0123abcd.bin", new Uint8Array([7]));
    const response = await get(
      "https://terpsicle.com/data/t3/geo/routes.0123abcd.bin",
    );
    expect(response.headers.get("Cache-Control")).toContain("immutable");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([7]),
    );
  });

  it("404s in plain text when the object is missing", async () => {
    const response = await get("https://terpsicle.com/data/nope.json");
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe("text/plain");
    expect(await response.text()).toBe("No data file at /data/nope.json.");
  });

  it("rejects writes", async () => {
    const response = await get("https://terpsicle.com/data/x.json", {
      method: "PUT",
      body: "{}",
    });
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, HEAD");
  });
});

describe("scheduled", () => {
  it("has exactly one job per cron in wrangler.jsonc", () => {
    expect(Object.keys(CRON_JOBS).sort()).toEqual(
      [...testBindings().crons].sort(),
    );
  });

  it.each(Object.keys(CRON_JOBS))("runs the job for %s", async (cron) => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const controller = createScheduledController({
      cron,
      scheduledTime: Date.UTC(2026, 8, 25, 12),
    });
    await worker.scheduled(controller, env, createExecutionContext());
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        job: CRON_JOBS[cron]?.name,
        scheduledFor: "2026-09-25T12:00:00.000Z",
      }),
    );
    info.mockRestore();
  });

  it("fails loudly on a cron with no job", async () => {
    const controller = createScheduledController({ cron: "0 0 1 1 *" });
    await expect(
      worker.scheduled(controller, env, createExecutionContext()),
    ).rejects.toBeInstanceOf(UnknownCronError);
  });
});

describe("D1", () => {
  it("is reachable with migrations applied", async () => {
    const row = await env.DB.prepare(
      "SELECT count(*) AS applied FROM d1_migrations",
    ).first<{ applied: number }>();
    expect(row?.applied).toBe(testBindings().migrations.length);
  });
});
