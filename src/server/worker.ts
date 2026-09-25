import { runScheduled } from "~/jobs/index";
import { APEX_HOST } from "./apex";
import { API_PREFIX, handleApi } from "./api/router";
import { DATA_PREFIX, serveData } from "./data";
import { POSTHOG_PROXY_PREFIX, proxyPostHog } from "./posthog-proxy";

const WWW_HOST = `www.${APEX_HOST}`;

/** The TanStack Start request handler (or a stand-in in tests). */
export interface AppHandler {
  fetch(request: Request): Response | Promise<Response>;
}

/**
 * The Worker's handlers. src/server.ts wires in the real app; tests pass a
 * stub so they don't need TanStack Start's build-time virtual modules.
 */
export function createWorker(app: AppHandler) {
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
      if (
        url.pathname === POSTHOG_PROXY_PREFIX ||
        url.pathname.startsWith(`${POSTHOG_PROXY_PREFIX}/`)
      ) {
        return proxyPostHog(request);
      }
      return app.fetch(request);
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
