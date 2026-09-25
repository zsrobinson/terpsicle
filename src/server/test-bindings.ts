// Test-only bindings that vitest.config.ts injects into the worker pool.
// Kept out of the generated Env so production code can't depend on them.
import type { D1Migration } from "cloudflare:test";
import { env } from "cloudflare:workers";

interface TestBindings {
  TEST_CRONS: string[];
  TEST_MIGRATIONS: D1Migration[];
}

export function testBindings() {
  const bindings = env as unknown as TestBindings;
  return { crons: bindings.TEST_CRONS, migrations: bindings.TEST_MIGRATIONS };
}
