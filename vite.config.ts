import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { bundleGraph } from "./scripts/bundle-graph";
import { CHECKOUT_MARKER_PATH, checkoutId } from "./scripts/e2e-checkout";
import { inlineScripts } from "./scripts/inline-scripts";

/**
 * Answers `GET /__checkout/<id>` with 200 only for this checkout's id, so
 * Playwright reuses a running dev server only when it's serving this code
 * (scripts/e2e-checkout.ts). Dev server only.
 */
function checkoutMarker(): Plugin {
  const id = checkoutId(import.meta.dirname);
  return {
    name: "terpsicle:checkout-marker",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(CHECKOUT_MARKER_PATH, (req, res) => {
        res.statusCode = req.url === `/${id}` ? 200 : 404;
        res.setHeader("content-type", "text/plain");
        res.end(res.statusCode === 200 ? id : "another checkout");
      });
    },
  };
}

// Modes: `pnpm dev` = development (live data), `pnpm dev:mock` = mock
// (fixtures, no network; also what e2e runs), `pnpm build` = production.
export default defineConfig(({ command, mode }) => ({
  // Client env files live in env/, not the root: wrangler and the Cloudflare
  // plugin would load a root .env into the Worker's env and its types.
  envDir: "env",
  resolve: { tsconfigPaths: true },
  plugins: [
    // First, so the Worker never sees the marker path.
    checkoutMarker(),
    // The head scripts' text and their CSP hashes, from one build of their
    // source (scripts/inline-scripts.ts).
    inlineScripts(import.meta.dirname),
    cloudflare({
      viteEnvironment: { name: "ssr" },
      // Remote bindings (Workers AI) need a Cloudflare login and the
      // network; mock mode must work offline and in CI without credentials.
      remoteBindings: mode !== "mock",
      // Server telemetry is production-only (see src/server/analytics.ts).
      config:
        command === "serve"
          ? (worker) => {
              // Mutated rather than returned: returned config is deep-merged.
              delete worker.vars?.POSTHOG_TOKEN;
              // Mock mode (and so e2e) signs in with the fake Google, which
              // the Worker only honors on localhost (docs/AUTH.md).
              if (mode === "mock") {
                worker.vars ??= {};
                worker.vars.AUTH_TEST_MODE = "true";
                // Todo in test mode: the fixed key and the fixture feed.
                worker.vars.TODO_ENABLED = "on";
              }
            }
          : undefined,
    }),
    tailwindcss(),
    tanstackStart(),
    react(),
    // dist/bundle-graph.json for scripts/check-bundle.ts.
    bundleGraph(import.meta.dirname),
  ],
}));
