import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { unstable_readConfig } from "wrangler";

// Vitest 4.1, not 5: @cloudflare/vitest-plugin supports ^4.1 only.
// Tests live next to the code they test (`foo.ts` → `foo.test.ts`); the folder
// decides the project. `pnpm vitest --project <name>` runs one.
export default defineConfig({
  envDir: "env",
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "core",
          environment: "node",
          include: ["src/core/**/*.test.ts", "src/fixtures/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "ingest",
          environment: "node",
          include: ["src/ingest/**/*.test.ts"],
        },
      },
      {
        // The repo's own lint scripts (scripts/check-*.ts).
        extends: true,
        test: {
          name: "scripts",
          environment: "node",
          include: ["scripts/**/*.test.ts"],
        },
      },
      {
        extends: true,
        plugins: [react()],
        test: {
          name: "ui",
          environment: "happy-dom",
          include: [
            "src/{app,features,state,components,routes,worker}/**/*.test.{ts,tsx}",
          ],
          setupFiles: ["src/app/test-setup.ts"],
        },
      },
      {
        extends: true,
        plugins: [
          cloudflareTest(async () => {
            // Bindings are declared here rather than read from wrangler.jsonc
            // so tests never reach remote resources (AI, email) and never
            // see production vars (POSTHOG_TOKEN).
            const wrangler = unstable_readConfig({ config: "wrangler.jsonc" });
            return {
              miniflare: {
                compatibilityDate: wrangler.compatibility_date,
                compatibilityFlags: wrangler.compatibility_flags,
                r2Buckets: ["DATA"],
                d1Databases: ["DB"],
                bindings: {
                  TEST_CRONS: wrangler.triggers.crons ?? [],
                  TEST_MIGRATIONS: await readD1Migrations("migrations"),
                },
              },
            };
          }),
        ],
        test: {
          name: "worker",
          include: ["src/{jobs,server}/**/*.test.ts", "src/server.test.ts"],
          setupFiles: ["src/server/test-setup.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/core/**/*.ts"],
      exclude: ["src/core/**/*.test.ts"],
      // BUILD.md §5: core keeps ≥ 90% line coverage.
      thresholds: { lines: 90 },
    },
  },
});
