import {
  createExecutionContext,
  createScheduledController,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { INLINE_SCRIPT_HASHES } from "virtual:terpsicle/inline-script-hashes";
import { describe, expect, it, vi } from "vitest";
import { CSP_NONCE_HEADER } from "~/core/schema";
import { CRON_JOBS, UnknownCronError } from "~/jobs/index";
import { testBindings } from "./test-bindings";
import { createWorker } from "./worker";

const app = {
  fetch: vi.fn(async (_request: Request) => new Response("app shell")),
};
const worker = createWorker(app);

async function get(url: string, init?: RequestInit) {
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request(url, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

describe("fetch", () => {
  it("hands everything else to the app", async () => {
    const response = await get("https://terpsicle.com/schedule?plan=abc");
    expect(await response.text()).toBe("app shell");
  });

  it("sends someone signed in from / straight to the scheduler", async () => {
    app.fetch.mockClear();
    const response = await get("https://terpsicle.com/", {
      headers: { Cookie: "theme=dark; __Host-session=abc" },
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "https://terpsicle.com/schedule",
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(app.fetch).not.toHaveBeenCalled();
  });

  it("keeps the query on the way to the scheduler", async () => {
    const response = await get("https://terpsicle.com/?utm_source=flyer", {
      headers: { Cookie: "__Host-session=abc" },
    });
    expect(response.headers.get("Location")).toBe(
      "https://terpsicle.com/schedule?utm_source=flyer",
    );
  });

  it("shows / without a session or with ?stay, and never redirects other pages", async () => {
    expect(await (await get("https://terpsicle.com/")).text()).toBe(
      "app shell",
    );
    const signedIn = { headers: { Cookie: "__Host-session=abc" } };
    const privacy = await get("https://terpsicle.com/privacy", signedIn);
    expect(await privacy.text()).toBe("app shell");
    // `/?stay` is the marketing page for everyone ("About Terpsicle").
    const stay = await get("https://terpsicle.com/?stay", signedIn);
    expect(await stay.text()).toBe("app shell");
  });

  it("tells browsers to revalidate the app's HTML every time", async () => {
    app.fetch.mockResolvedValueOnce(
      new Response("<!doctype html>", {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
    );
    const response = await get("https://terpsicle.com/");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
    expect(await response.text()).toBe("<!doctype html>");
  });

  it("serves the service worker, checked on every visit", async () => {
    const response = await get("https://terpsicle.com/sw.js");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/javascript");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
    expect(await response.text()).toContain("installServiceWorker");
  });

  it("answers a missing hashed file with an uncached 404, not the app", async () => {
    app.fetch.mockClear();
    const response = await get("https://terpsicle.com/assets/index-OLD.js");
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(app.fetch).not.toHaveBeenCalled();
  });

  it("301s www to the apex, keeping path and query", async () => {
    const response = await get("https://www.terpsicle.com/x?plan=abc");
    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe(
      "https://terpsicle.com/x?plan=abc",
    );
  });
});

describe("security headers (V2.md §12)", () => {
  const html = () =>
    new Response("<!doctype html>", {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  const nonceOf = (policy: string | null) =>
    /'nonce-([^']+)'/.exec(policy ?? "")?.[1];

  it("send every page a report-only CSP, with the nonce the app rendered", async () => {
    app.fetch.mockClear();
    app.fetch.mockResolvedValueOnce(html());
    const response = await get("https://terpsicle.com/", {
      // A client can't choose the nonce.
      headers: { [CSP_NONCE_HEADER]: "chosen-by-client" },
    });
    const policy = response.headers.get("Content-Security-Policy-Report-Only");
    expect(response.headers.get("Content-Security-Policy")).toBeNull();
    const nonce = nonceOf(policy);
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    const seen = app.fetch.mock.calls[0]?.[0];
    expect(seen?.headers.get(CSP_NONCE_HEADER)).toBe(nonce);
    for (const hash of INLINE_SCRIPT_HASHES) expect(policy).toContain(hash);
    expect(policy).toContain(
      "report-uri https://terpsicle.com/api/csp-report; report-to csp",
    );
    expect(response.headers.get("Reporting-Endpoints")).toBe(
      'csp="https://terpsicle.com/api/csp-report"',
    );
    expect(Object.fromEntries(response.headers)).toMatchObject({
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "permissions-policy": "camera=(), microphone=(), geolocation=()",
      "cross-origin-opener-policy": "same-origin",
      "strict-transport-security": "max-age=31536000",
      "cache-control": "no-cache",
    });
    expect(await response.text()).toBe("<!doctype html>");
  });

  it("make a fresh nonce for every page", async () => {
    app.fetch.mockResolvedValueOnce(html()).mockResolvedValueOnce(html());
    const a = await get("https://terpsicle.com/");
    const b = await get("https://terpsicle.com/");
    expect(
      nonceOf(a.headers.get("Content-Security-Policy-Report-Only")),
    ).not.toBe(nonceOf(b.headers.get("Content-Security-Policy-Report-Only")));
  });

  it("send API answers the headers for any response, but no CSP", async () => {
    const response = await get("https://terpsicle.com/api/me", {
      method: "POST",
      body: "{}",
      headers: { "Content-Type": "application/json" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(Object.fromEntries(response.headers)).toMatchObject({
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "strict-transport-security": "max-age=31536000",
    });
    expect(response.headers.has("Content-Security-Policy-Report-Only")).toBe(
      false,
    );
    const missing = await get("https://terpsicle.com/api/nope", {
      method: "POST",
    });
    expect(missing.status).toBe(404);
    expect(missing.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("reach redirects and the service worker too", async () => {
    const redirect = await get("https://www.terpsicle.com/x");
    expect(redirect.status).toBe(301);
    expect(redirect.headers.get("Strict-Transport-Security")).toBe(
      "max-age=31536000",
    );
    const sw = await get("https://terpsicle.com/sw.js");
    expect(sw.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("never send HSTS over plain HTTP (local dev)", async () => {
    app.fetch.mockResolvedValueOnce(html());
    const response = await get("http://localhost:3000/");
    expect(response.headers.has("Strict-Transport-Security")).toBe(false);
    expect(response.headers.get("Reporting-Endpoints")).toBe(
      'csp="http://localhost:3000/api/csp-report"',
    );
  });

  it("take CSP reports at /api/csp-report", async () => {
    const response = await get("https://terpsicle.com/api/csp-report", {
      method: "POST",
      body: JSON.stringify({ "csp-report": { "blocked-uri": "eval" } }),
      headers: { "Content-Type": "application/csp-report" },
    });
    expect(response.status).toBe(204);
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
