import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { unstable_readConfig } from "wrangler";
import { inlineScripts } from "./scripts/inline-scripts.ts";

// Vitest 4.1, not 5: @cloudflare/vitest-plugin supports ^4.1 only.
// Tests live next to the code they test (`foo.ts` → `foo.test.ts`); the folder
// decides the project. `pnpm vitest --project <name>` runs one.
export default defineConfig({
  envDir: "env",
  resolve: { tsconfigPaths: true },
  // The same head-script modules the app and Worker build with (vite.config.ts).
  plugins: [inlineScripts(import.meta.dirname)],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "core",
          environment: "node",
          include: ["src/core/**/*.test.ts", "src/fixtures/**/*.test.ts"],
          exclude: ["**/*.perf.test.ts"],
        },
      },
      {
        // Timing budgets (BUILD.md §5). Kept out of "core" so they never run
        // under coverage instrumentation, which slows code several times over.
        // They run after every other project (groupOrder) and one file at a
        // time (fileParallelism), so each budget has the CPU to itself. CPU
        // time still grows when other files share the cores (hyperthreads,
        // caches, memory bandwidth): with the four perf files side by side,
        // `pnpm check` on a 4-core runner measured the 7×20 generator at
        // 199–258 ms, against 75–150 ms in CI's shards on the same code.
        extends: true,
        test: {
          name: "perf",
          environment: "node",
          include: ["src/**/*.perf.test.ts"],
          sequence: { groupOrder: 1 },
          fileParallelism: false,
          // Budgets are medians of several runs (src/fixtures/timing.ts).
          testTimeout: 60_000,
        },
      },
      {
        extends: true,
        test: {
          name: "ingest",
          environment: "node",
          include: ["src/ingest/**/*.test.ts"],
          // Timing budgets run once, in "perf", with its timeout and the CPU
          // to themselves; here they'd run again under the 5 s default.
          exclude: ["**/*.perf.test.ts"],
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
          // Vitest blanks CSS imports; the design-token test reads the
          // palette from styles.css as text (`?raw`).
          css: { include: [/styles\.css\?raw/] },
          include: [
            "src/{features,components,hooks,lib,state,routes,worker}/**/*.test.{ts,tsx}",
            // The router's own wiring (its query client): src/router.tsx.
            "src/router.test.tsx",
          ],
          setupFiles: ["src/lib/test-setup.ts"],
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
              // Exports the Durable Object classes (src/server.ts would pull
              // in TanStack Start's build-time modules).
              main: "src/server/test-worker.ts",
              miniflare: {
                compatibilityDate: wrangler.compatibility_date,
                compatibilityFlags: wrangler.compatibility_flags,
                r2Buckets: ["DATA", "USER_CONTENT"],
                d1Databases: ["DB"],
                durableObjects: {
                  COURSE_CHAT: { className: "CourseChat", useSQLite: true },
                },
                bindings: {
                  TEST_CRONS: wrangler.triggers.crons ?? [],
                  // Which vars production and previews set (names only).
                  TEST_VAR_NAMES: {
                    production: Object.keys(wrangler.vars ?? {}),
                    previews: Object.keys(wrangler.previews?.vars ?? {}),
                  },
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
