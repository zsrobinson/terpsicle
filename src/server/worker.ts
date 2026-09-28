import { signInPagePath } from "~/core/auth";
import type { PageRequestContext } from "~/core/routing";
import { CSP_NONCE_HEADER, CSP_REPORT_PATH } from "~/core/schema";
import { runScheduled } from "~/jobs/index";
import { APEX_HOST } from "./apex";
import { API_PREFIX, handleApi } from "./api/router";
import { type PageAccess, pageAccess } from "./auth/pages";
import { serveCalendarFeed } from "./calendar/feed";
import { CALENDAR_FEED_PREFIX } from "./calendar/token";
import { CHAT_SOCKET_PATH, openChatSocket } from "./chat/socket";
import { DATA_PREFIX, serveData } from "./data";
import { FEEDBACK_SHOT_PREFIX, serveFeedbackShot } from "./feedback/shots";
import { pageContext } from "./pages/context";
import {
  inlineScriptHashes,
  pageCaching,
  SHARED_PAGE_CACHE_CONTROL,
  SIGNED_IN_PAGE_CACHE_CONTROL,
} from "./pages/shared-pages";
import { POSTHOG_PROXY_PREFIX, proxyPostHog } from "./posthog-proxy";
import { landingRedirect } from "./routing";
import { handleCspReport } from "./security/csp-report";
import { cspNonce, withSecurityHeaders } from "./security/headers";
import { serveSeoFile } from "./seo/routes";
import { serviceWorkerScript } from "./service-worker";

const WWW_HOST = `www.${APEX_HOST}`;
/** Vite's hashed build output (dist/client/assets). */
export const ASSETS_PREFIX = "/assets/";
/** The service worker's URL; its scope is the whole site. */
export const SERVICE_WORKER_PATH = "/sw.js";

/**
 * The HTML names this deploy's hashed scripts, so browsers and caches must
 * check for a new copy every time (`no-cache` still allows a 304, and keeps
 * the back/forward cache, which `no-store` would turn off). Stale HTML from
 * an older deploy points at scripts that are gone: a blank page.
 */
function withHtmlRevalidation(response: Response): Response {
  if (!isHtml(response) || response.headers.has("Cache-Control"))
    return response;
  return withCacheControl(response, "no-cache");
}

function isHtml(response: Response): boolean {
  return (response.headers.get("Content-Type") ?? "").startsWith("text/html");
}

function withCacheControl(response: Response, value: string): Response {
  const out = new Response(response.body, response);
  out.headers.set("Cache-Control", value);
  return out;
}

/** A path no route matches: the app answers it with its 404 page. */
export const NOT_FOUND_PATH = "/__not-found";

/**
 * A page only some people may load (src/server/auth/pages.ts): the page
 * itself, a trip through /signin that comes back here, or the app's own
 * "Page not found" with a 404. Pages go through `render`, so they get the
 * CSP nonce and security headers like any other.
 */
async function gatedPage(
  render: (request: Request) => Promise<Response>,
  request: Request,
  access: PageAccess,
): Promise<Response> {
  const url = new URL(request.url);
  if (access === "allow") return render(request);
  if (access === "sign-in")
    return withSecurityHeaders(
      new Response(null, {
        status: 302,
        headers: {
          Location: new URL(
            signInPagePath(`${url.pathname}${url.search}`),
            url.origin,
          ).href,
        },
      }),
      request,
    );
  return render(new Request(new URL(NOT_FOUND_PATH, url.origin), request));
}

/** The answer depends on who's asking: no shared or browser cache keeps it. */
function privatePage(response: Response): Response {
  const out = new Response(response.body, response);
  out.headers.set("Cache-Control", "private, no-store");
  return out;
}

/** The TanStack Start request handler (or a stand-in in tests). */
export interface AppHandler {
  fetch(
    request: Request,
    options?: { context?: PageRequestContext },
  ): Response | Promise<Response>;
}

/**
 * The Worker's handlers. src/server.ts wires in the real app; tests pass a
 * stub so they don't need TanStack Start's build-time virtual modules.
 */
export function createWorker(
  app: AppHandler,
  {
    precache = [],
  }: {
    /** The app shell's build files, for /sw.js to precache (scripts/pwa-precache.ts). */
    precache?: readonly string[];
  } = {},
) {
  const serviceWorkerJs = serviceWorkerScript(precache);

  /**
   * A page from the app. Most get a fresh CSP nonce for their inline
   * scripts; a page that's the same for everyone is cached at the edge
   * instead, so its policy lists its scripts' hashes (shared-pages.ts).
   */
  async function render(request: Request, env: Env): Promise<Response> {
    const caching = pageCaching(request);
    const context = { context: pageContext(env) };
    if (caching === "shared") {
      // The app marks its own scripts with this render's nonce; the policy
      // names their hashes instead, since everyone gets the cached copy.
      const nonce = cspNonce();
      const headers = new Headers(request.headers);
      headers.set(CSP_NONCE_HEADER, nonce);
      const response = await app.fetch(
        new Request(request, { headers }),
        context,
      );
      if (!isHtml(response)) return withSecurityHeaders(response, request);
      const html = await response.text();
      const out = new Response(
        request.method === "HEAD" ? null : html,
        response,
      );
      // A page and its "not found" are the same for everyone; an error isn't
      // worth keeping.
      out.headers.set(
        "Cache-Control",
        response.status === 200 || response.status === 404
          ? SHARED_PAGE_CACHE_CONTROL
          : "no-cache",
      );
      return withSecurityHeaders(out, request, {
        scriptHashes: await inlineScriptHashes(html, nonce),
      });
    }
    const nonce = cspNonce();
    const headers = new Headers(request.headers);
    // Always ours: a client-sent value is replaced, never trusted.
    headers.set(CSP_NONCE_HEADER, nonce);
    const response = await app.fetch(
      new Request(request, { headers }),
      context,
    );
    const out =
      caching === "private" && isHtml(response)
        ? withCacheControl(response, SIGNED_IN_PAGE_CACHE_CONTROL)
        : withHtmlRevalidation(response);
    return withSecurityHeaders(out, request, { nonce });
  }

  /** The Worker's own routes; null for a page, which the app renders. */
  async function route(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response | null> {
    const url = new URL(request.url);

    if (url.hostname === WWW_HOST) {
      url.hostname = APEX_HOST;
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname === CSP_REPORT_PATH) {
      return handleCspReport(request);
    }
    if (url.pathname.startsWith(DATA_PREFIX)) {
      return serveData(request, env, ctx);
    }
    if (url.pathname.startsWith(API_PREFIX)) {
      return handleApi(request, env, ctx);
    }
    if (url.pathname.startsWith(CALENDAR_FEED_PREFIX)) {
      // The calendar feed: a GET with no cookie, for calendar apps.
      return serveCalendarFeed(request, env, ctx);
    }
    if (url.pathname.startsWith(FEEDBACK_SHOT_PREFIX)) {
      // Before the admin page gate: an image is the admin's or a 404.
      return serveFeedbackShot(request, env, new Date());
    }
    if (
      url.pathname === POSTHOG_PROXY_PREFIX ||
      url.pathname.startsWith(`${POSTHOG_PROXY_PREFIX}/`)
    ) {
      return proxyPostHog(request);
    }
    if (url.pathname === SERVICE_WORKER_PATH) {
      // Browsers check this on every navigation; no-cache keeps a new
      // version (or a retiring one) reaching them on the next visit.
      return new Response(serviceWorkerJs, {
        headers: {
          "Content-Type": "text/javascript; charset=utf-8",
          "Cache-Control": "no-cache",
        },
      });
    }
    if (url.pathname.startsWith(ASSETS_PREFIX)) {
      // Built files are served before the Worker runs, so one that reaches
      // here doesn't exist in this version: a tab or HTML from an older
      // deploy asking for its old hashed file. Answer a plain 404 that no
      // cache keeps (the name may exist a moment later, mid-deploy), not
      // the app's HTML, which a browser would reject as a script anyway.
      return new Response("Not found", {
        status: 404,
        headers: { "Cache-Control": "no-store" },
      });
    }
    const seo = await serveSeoFile(request, env);
    if (seo) return seo;
    const landing = landingRedirect(request);
    if (landing) return landing;
    // Every page (`/`, `/schedule`, `/privacy`, …) is a TanStack route; an
    // unknown path gets the app's not-found page.
    return null;
  }

  return {
    async fetch(
      request: Request,
      env: Env,
      ctx: ExecutionContext,
    ): Promise<Response> {
      // The one WebSocket route: a GET beside the JSON API's POSTs. Its 101
      // goes back as it is, since copying a response to add headers drops
      // the socket.
      if (new URL(request.url).pathname === CHAT_SOCKET_PATH) {
        return openChatSocket(request, env, new Date());
      }
      const response = await route(request, env, ctx);
      if (response) return withSecurityHeaders(response, request);
      const access = await pageAccess(request, env, new Date());
      const renderHere = (r: Request) => render(r, env);
      return access
        ? privatePage(await gatedPage(renderHere, request, access))
        : render(request, env);
    },

    async scheduled(
      controller: ScheduledController,
      env: Env,
      _ctx: ExecutionContext,
    ): Promise<void> {
      await runScheduled(controller, env);
    },
  } satisfies ExportedHandler<Env>;
}
