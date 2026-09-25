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
  // Behavior is tested in data.test.ts; this checks the route reaches it.
  it("routes /data/ to R2", async () => {
    await env.DATA.put("calendar/202701.json", '{"status":"published"}');
    const response = await get(
      "https://terpsicle.com/data/calendar/202701.json",
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "published" });
  });
});

describe("scheduled", () => {
  it("has exactly one job per cron in wrangler.jsonc", () => {
    expect(Object.keys(CRON_JOBS).sort()).toEqual(
      [...testBindings().crons].sort(),
    );
  });

  it.each(Object.keys(CRON_JOBS))("runs the job for %s", async (cron) => {
    const job = CRON_JOBS[cron];
    if (!job) throw new Error(`no job for ${cron}`);
    const run = vi.spyOn(job, "run").mockResolvedValue();
    const controller = createScheduledController({
      cron,
      scheduledTime: Date.UTC(2026, 8, 25, 12),
    });
    await worker.scheduled(controller, env, createExecutionContext());
    expect(run).toHaveBeenCalledWith({
      env,
      now: new Date("2026-09-25T12:00:00.000Z"),
    });
    run.mockRestore();
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
