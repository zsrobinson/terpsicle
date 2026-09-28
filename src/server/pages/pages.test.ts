// Public pages at the edge (shared-pages.ts, context.ts): which pages Workers
// Cache may keep, the CSP they carry instead of a nonce, the 404s they pass
// through, and what the Worker hands the app for a server render.
import {
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
import type { PageRequestContext } from "~/core/routing";
import { CSP_NONCE_HEADER } from "~/core/schema";
import { createWorker } from "../worker";
import { inlineScriptHashes, isSharedPagePath } from "./shared-pages";

/** What the app renders, with the nonce the Worker handed it on its own scripts. */
const page = (nonce: string) =>
  `<!doctype html><html><head><script nonce="${nonce}">window.a=1</script><script type="application/ld+json" nonce="${nonce}">{"@type":"Course"}</script><script type="module" src="/assets/main.js" nonce="${nonce}"></script></head><body><p>An instructor named <script>alert(1)</script></p><script nonce="${nonce}">$_TSR.b=2</script></body></html>`;

const html = (request: Request, status = 200) =>
  new Response(page(request.headers.get(CSP_NONCE_HEADER) ?? ""), {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

const app = {
  fetch: vi.fn(
    async (request: Request, _options?: { context?: PageRequestContext }) =>
      html(request),
  ),
};
const worker = createWorker(app);

async function get(url: string, init?: RequestInit, bindings: Env = env) {
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request(url, init), bindings, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

const sha256 = async (text: string) =>
  `'sha256-${btoa(
    String.fromCharCode(
      ...new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
      ),
    ),
  )}'`;

describe("shared pages", () => {
  it("are the public Reviews pages, never your own", () => {
    for (const path of [
      "/reviews",
      "/reviews/",
      "/reviews/policy",
      "/reviews/cmsc351",
      "/reviews/kruskal",
      "/reviews/goldman-aaron/",
      // The old addresses, which answer with a 301.
      "/reviews/courses/CMSC351",
      "/reviews/instructors/kruskal",
    ])
      expect(isSharedPagePath(path), path).toBe(true);
    for (const path of [
      "/reviews/mine",
      "/reviews/mine/",
      "/reviews/kruskal/more",
      "/",
      "/schedule",
      "/admin",
      "/chat",
    ])
      expect(isSharedPagePath(path), path).toBe(false);
  });

  it("go to the edge cache with their scripts' hashes instead of a nonce", async () => {
    app.fetch.mockClear();
    const response = await get(
      "https://terpsicle.com/reviews/courses/CMSC351",
      // Not even a nonce a client sends reaches the app.
      { headers: { [CSP_NONCE_HEADER]: "chosen-by-client" } },
    );
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=0, s-maxage=600, stale-while-revalidate=86400",
    );
    const policy =
      response.headers.get("Content-Security-Policy-Report-Only") ?? "";
    expect(policy).not.toContain("'nonce-");
    expect(policy).toContain(await sha256("window.a=1"));
    expect(policy).toContain(await sha256("$_TSR.b=2"));
    // JSON-LD isn't run, and a script with src is allowed by 'self'.
    expect(policy).not.toContain(await sha256('{"@type":"Course"}'));
    // A script the app didn't mark (one smuggled in through data) isn't allowed.
    expect(policy).not.toContain(await sha256("alert(1)"));
    // The app got the Worker's nonce, never the client's.
    const [seen] = app.fetch.mock.calls[0] ?? [];
    expect(seen?.headers.get(CSP_NONCE_HEADER)).not.toBe("chosen-by-client");
    expect(await response.text()).toBe(
      page(seen?.headers.get(CSP_NONCE_HEADER) ?? ""),
    );
  });

  it("keep a 404's status, cacheable like the page", async () => {
    app.fetch.mockImplementationOnce(async (request) => html(request, 404));
    const response = await get(
      "https://terpsicle.com/reviews/instructors/clyde-kruskal",
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=600");
  });

  it("are never stored for someone signed in, who gets a nonce as usual", async () => {
    app.fetch.mockClear();
    const response = await get("https://terpsicle.com/reviews", {
      headers: { Cookie: "__Host-session=abc" },
    });
    expect(response.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(
      response.headers.get("Content-Security-Policy-Report-Only"),
    ).toContain("'nonce-");
  });

  it("don't include /reviews/mine or the scheduler", async () => {
    for (const path of ["/reviews/mine", "/schedule"]) {
      const response = await get(`https://terpsicle.com${path}`);
      expect(response.headers.get("Cache-Control"), path).toBe("no-cache");
    }
  });

  it("aren't kept when the render fails", async () => {
    app.fetch.mockImplementationOnce(async (request) => html(request, 500));
    const response = await get("https://terpsicle.com/reviews");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
  });
});

describe("the render context", () => {
  it("reads published files from R2, and review numbers only when Reviews is on", async () => {
    await env.DATA.put("planetterp/manifest.json", '{"schemaVersion":1}');
    app.fetch.mockClear();
    await get("https://terpsicle.com/reviews", undefined, {
      ...env,
      REVIEWS_ENABLED: "off",
    } as unknown as Env);
    const off = app.fetch.mock.calls[0]?.[1]?.context;
    expect(off?.reviews).toBeNull();
    expect(await off?.published.readJson("planetterp/manifest.json")).toEqual({
      schemaVersion: 1,
    });
    expect(await off?.published.readJson("nothing/here.json")).toBeNull();

    app.fetch.mockClear();
    // Env types each var as its wrangler.jsonc value.
    await get("https://terpsicle.com/reviews", undefined, {
      ...env,
      REVIEWS_ENABLED: "read",
    } as unknown as Env);
    const read = app.fetch.mock.calls[0]?.[1]?.context;
    expect(read?.reviews).not.toBeNull();
  });
});

describe("inlineScriptHashes", () => {
  it("hashes each of the app's inline scripts once", async () => {
    expect(
      await inlineScriptHashes(
        '<script nonce="n">a</script><script nonce="n">a</script><script>b</script>',
        "n",
      ),
    ).toEqual(["'sha256-ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs='"]);
  });

  it("hashes what the browser's parser makes of NULs and CRs", async () => {
    expect(
      await inlineScriptHashes(
        "<script nonce=\"n\">i:'a\0b'\r\nx</script>",
        "n",
      ),
    ).toEqual([await sha256("i:'a\uFFFDb'\nx")]);
  });
});
