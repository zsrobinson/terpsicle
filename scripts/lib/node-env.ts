import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ROOT } from "./source-files";

// Node reads NODE_EXTRA_CA_CERTS and NODE_USE_ENV_PROXY only at startup, so
// pipeline scripts relaunch themselves once with both set when needed.

/**
 * maps.umd.edu (the routing token) sends an incomplete TLS chain; these two
 * intermediates complete it. Never disable verification instead.
 */
export const UMD_INTERMEDIATES = path.join(ROOT, "scripts/certs/umd-intermediates.pem");

const MARKER = "TERPSICLE_RELAUNCHED";

export function relaunchWithNodeEnv(options: { umdCa?: boolean } = {}): void {
  if (process.env[MARKER] === "1") return;
  const env: NodeJS.ProcessEnv = { ...process.env, [MARKER]: "1" };
  let needed = false;

  if (options.umdCa) {
    // Keep any CA bundle already configured (e.g. a corporate proxy's).
    const existing = process.env.NODE_EXTRA_CA_CERTS;
    const parts = [readFileSync(UMD_INTERMEDIATES, "utf8")];
    if (existing && existsSync(existing)) parts.unshift(readFileSync(existing, "utf8"));
    const combined = path.join(tmpdir(), "terpsicle-extra-ca.pem");
    writeFileSync(combined, parts.join("\n"));
    env.NODE_EXTRA_CA_CERTS = combined;
    needed = true;
  }
  if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
    env.NODE_USE_ENV_PROXY = "1";
    needed = true;
  }
  if (!needed) return;

  const result = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
    env,
    stdio: "inherit",
  });
  process.exit(result.status ?? 1);
}
