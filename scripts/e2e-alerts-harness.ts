// Starts the seat-alert e2e harness (e2e/alerts-harness): a fresh local D1
// with the real migrations applied, then `wrangler dev` on the given port.
// Playwright runs this as a webServer (playwright.config.ts).
import { spawn, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { checkoutId } from "./e2e-checkout";
import { isMain, ROOT } from "./lib/source-files";

const CONFIG = "e2e/alerts-harness/wrangler.jsonc";
const STATE = path.join(ROOT, ".wrangler", "e2e-alerts");

if (isMain(import.meta.url)) {
  const port = process.argv[2] ?? "3101";
  rmSync(STATE, { recursive: true, force: true });
  const migrate = spawnSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "migrations",
      "apply",
      "DB",
      "--local",
      "-c",
      CONFIG,
      "--persist-to",
      STATE,
    ],
    { cwd: ROOT, stdio: "inherit" },
  );
  if (migrate.status !== 0) process.exit(migrate.status ?? 1);
  const dev = spawn(
    "pnpm",
    [
      "exec",
      "wrangler",
      "dev",
      "-c",
      CONFIG,
      "--port",
      port,
      "--persist-to",
      STATE,
      // For the marker Playwright waits on (scripts/e2e-checkout.ts).
      "--var",
      `CHECKOUT_ID:${checkoutId(ROOT)}`,
    ],
    { cwd: ROOT, stdio: "inherit" },
  );
  const stop = () => dev.kill("SIGTERM");
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  dev.on("exit", (code) => process.exit(code ?? 0));
}
