// Walking distances and route geometry between every pair of catalog
// buildings, from UMD's routing network → geo/routes.<hash>.bin,
// geo/route/<from>-<to>-<mode>.json and geo/manifest.json in R2.
//
//   pnpm tsx scripts/build-routes.ts [--target r2|fs] [--dir .data] [--force]
//
// Why a script and not a Worker cron: a Worker can't fetch the routing token
// from maps.umd.edu (Cloudflare answers 526, invalid certificate: UMD sends
// an incomplete chain). Node can, with the two intermediates in
// scripts/certs/umd-intermediates.pem, which this script adds itself.
// Runs weekly and on demand in .github/workflows/routes.yml. Incremental:
// only new pairs, pairs whose entrances changed, and missing geometry are
// solved again (--force solves everything).
import path from "node:path";
import { parseArgs } from "node:util";
import { relaunchWithNodeEnv } from "./lib/node-env";
import { runPipelineJob } from "./lib/run-job";
import { ROOT } from "./lib/source-files";

relaunchWithNodeEnv({ umdCa: true });

const { values } = parseArgs({
  options: {
    target: { type: "string", default: "r2" },
    dir: { type: "string", default: path.join(ROOT, ".data") },
    force: { type: "boolean", default: false },
  },
});
if (values.target !== "fs" && values.target !== "r2") {
  console.error(
    "Usage: pnpm tsx scripts/build-routes.ts [--target r2|fs] [--dir .data] [--force]",
  );
  process.exit(2);
}

runPipelineJob("routes", {
  target: values.target,
  dir: values.dir,
  force: values.force,
})
  .then((summary) => {
    const errors = (summary as { errors?: unknown[] }).errors ?? [];
    // Failed solves leave their cells unknown; the next run retries them.
    if (errors.length > 0)
      console.warn(
        `${errors.length} solve(s) failed; they'll be retried next run`,
      );
  })
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? (error.stack ?? error.message) : error,
    );
    process.exit(1);
  });
