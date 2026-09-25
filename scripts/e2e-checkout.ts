import { createHash } from "node:crypto";
import path from "node:path";
import { isMain, ROOT } from "./lib/source-files";

// Several checkouts of this repo (agents' worktrees, a second clone) can run
// e2e on one machine at once. Each gets its own pair of ports (the app, and
// the seat-alert harness one above it), and each of its servers answers a
// marker URL only for its own checkout, so Playwright never reuses a server
// that is serving someone else's code.

/** Where the dev server and the alerts harness answer "this is checkout <id>". */
export const CHECKOUT_MARKER_PATH = "/__checkout";

/** A short, stable id for a checkout: a hash of its absolute path. */
export function checkoutId(root: string): string {
  return createHash("sha256")
    .update(path.resolve(root))
    .digest("hex")
    .slice(0, 12);
}

/**
 * This checkout's app port: an even number in 3100–3898, so the harness can
 * take the odd one above it (`E2E_PORT` overrides it).
 */
export function e2ePort(root: string, env = process.env.E2E_PORT): number {
  if (env) return Number(env);
  return 3100 + 2 * (Number.parseInt(checkoutId(root).slice(0, 8), 16) % 400);
}

/** The seat-alert harness's port (e2e/alerts-harness), next to the app's. */
export function alertsHarnessPort(
  root: string,
  env = process.env.E2E_PORT,
): number {
  return e2ePort(root, env) + 1;
}

// `pnpm e2e:port` prints this checkout's port, to start a server to reuse.
if (isMain(import.meta.url)) console.log(e2ePort(ROOT));
