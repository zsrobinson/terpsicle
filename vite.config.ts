import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Modes: `pnpm dev` = development (live data), `pnpm dev:mock` = mock
// (fixtures, no network; also what e2e runs), `pnpm build` = production.
export default defineConfig(({ command, mode }) => ({
  // Client env files live in env/, not the root: wrangler and the Cloudflare
  // plugin would load a root .env into the Worker's env and its types.
  envDir: "env",
  resolve: { tsconfigPaths: true },
  plugins: [
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
            }
          : undefined,
    }),
    tailwindcss(),
    tanstackStart(),
    react(),
  ],
}));
