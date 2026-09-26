import { runScheduled } from "~/jobs/index";
import { APEX_HOST } from "./apex";
import { API_PREFIX, handleApi } from "./api/router";
import { AVATARS_PREFIX, serveAvatar } from "./auth/pictures";
import { DATA_PREFIX, serveData } from "./data";
import { POSTHOG_PROXY_PREFIX, proxyPostHog } from "./posthog-proxy";
import { landingRedirect } from "./routing";
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
  const type = response.headers.get("Content-Type") ?? "";
  if (!type.startsWith("text/html") || response.headers.has("Cache-Control"))
    return response;
  const out = new Response(response.body, response);
  out.headers.set("Cache-Control", "no-cache");
  return out;
}

/** The TanStack Start request handler (or a stand-in in tests). */
export interface AppHandler {
  fetch(request: Request): Response | Promise<Response>;
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
  return {
    async fetch(
      request: Request,
      env: Env,
      ctx: ExecutionContext,
    ): Promise<Response> {
      const url = new URL(request.url);

      if (url.hostname === WWW_HOST) {
        url.hostname = APEX_HOST;
        return Response.redirect(url.toString(), 301);
      }
      if (url.pathname.startsWith(DATA_PREFIX)) {
        return serveData(request, env, ctx);
      }
      if (url.pathname.startsWith(API_PREFIX)) {
        return handleApi(request, env, ctx);
      }
      if (url.pathname.startsWith(AVATARS_PREFIX)) {
        return serveAvatar(request, env, new Date());
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
      const landing = landingRedirect(request);
      if (landing) return landing;
      // Every page (`/`, `/schedule`, `/privacy`, …) is a TanStack route; an
      // unknown path gets the app's not-found page.
      return withHtmlRevalidation(await app.fetch(request));
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
