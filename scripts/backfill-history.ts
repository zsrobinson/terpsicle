// The one-off PlanetTerp backfill of the instructor history (DATA.md §3.5):
// who taught which section of each course in the terms before ours, from
// PlanetTerp's grade data, recorded as `source: planetterp`. Our own records
// win wherever both exist. Never run from CI.
//
//   pnpm tsx scripts/backfill-history.ts [--target fs|r2] [--dir .data]
//        [--dept <CODE>]… [--course <CODE>]… [--limit <n>]
//        [--delay-ms 1000] [--flush-every 400] [--dry-run]
//        [--list-cache <file>] [--max-minutes <n>]
//
// - Start with a dry run on a sample: `--course CMSC351 --dry-run` fetches
//   and prints what it would record per term, and writes nothing.
// - The full run (`--target r2`, no filters) asks PlanetTerp for every
//   course it lists (about 175 list pages, then one grades request per
//   course, one a second): about 5 hours. It merges every `--flush-every`
//   courses and remembers what's done in `_jobs/history/backfill.json`, so
//   after a failure or Ctrl-C the same command carries on. Courses that
//   failed are tried again on the next run; a course that answers with no
//   grade rows is asked once more on a later run, and then left alone.
// - To run it in chunks: `--list-cache .data/planetterp-courses.json`
//   saves the course listing (about 6 minutes) the first time and reuses
//   it after, and `--max-minutes 8` merges and exits cleanly once 8 minutes
//   have passed. Repeat the same command until `left` is 0.
// - `--target r2` needs CLOUDFLARE_ACCOUNT_ID plus R2 credentials
//   (scripts/lib/r2-s3-blob-store.ts).
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import type { BlobStore } from "~/ingest/blob-store";
import { backfillHistory } from "~/ingest/history-backfill";
import { createHttpClient } from "~/ingest/http";
import { consoleLogger } from "~/ingest/publish";
import { createFsBlobStore } from "./lib/fs-blob-store";
import { relaunchWithNodeEnv } from "./lib/node-env";
import { createR2S3BlobStore } from "./lib/r2-s3-blob-store";
import { ROOT } from "./lib/source-files";

const { values } = parseArgs({
  options: {
    target: { type: "string", default: "fs" },
    dir: { type: "string", default: path.join(ROOT, ".data") },
    dept: { type: "string", multiple: true },
    course: { type: "string", multiple: true },
    limit: { type: "string" },
    "delay-ms": { type: "string", default: "1000" },
    "flush-every": { type: "string", default: "400" },
    "dry-run": { type: "boolean", default: false },
    "list-cache": { type: "string" },
    "max-minutes": { type: "string" },
  },
});

const number = (raw: string | undefined, name: string, min: number) => {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min) {
    console.error(`--${name} must be a whole number of at least ${min}`);
    process.exit(2);
  }
  return n;
};

if (values.target !== "fs" && values.target !== "r2") {
  console.error("--target must be fs or r2");
  process.exit(2);
}
relaunchWithNodeEnv({ umdCa: false });

async function main() {
  const store: BlobStore =
    values.target === "r2"
      ? await createR2S3BlobStore()
      : createFsBlobStore(values.dir);
  const http = createHttpClient({ fetch });
  const limit = number(values.limit, "limit", 1);
  console.info(
    `history backfill → ${values.target === "r2" ? "R2 (production)" : values.dir}${values["dry-run"] ? " (dry run: nothing is written)" : ""}`,
  );
  const started = performance.now();
  const maxMinutes = number(values["max-minutes"], "max-minutes", 1);
  const listCache = values["list-cache"];
  const result = await backfillHistory({
    http,
    store,
    now: new Date(),
    log: consoleLogger,
    ...(values.dept ? { departments: values.dept } : {}),
    ...(values.course ? { courses: values.course } : {}),
    ...(limit !== undefined ? { limit } : {}),
    delayMs: number(values["delay-ms"], "delay-ms", 250),
    flushEvery: number(values["flush-every"], "flush-every", 1),
    dryRun: values["dry-run"],
    ...(listCache
      ? {
          listCache: {
            read: async () =>
              existsSync(listCache) ? readFile(listCache, "utf8") : null,
            write: (text: string) => writeFile(listCache, text),
          },
        }
      : {}),
    ...(maxMinutes !== undefined
      ? {
          shouldStop: () =>
            performance.now() - started > maxMinutes * 60 * 1000,
        }
      : {}),
  });
  console.info(
    JSON.stringify(
      {
        wallMs: Math.round(performance.now() - started),
        requests: http.stats,
        ...result,
        errors: result.errors.slice(0, 30),
        errorCount: result.errors.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
  process.exit(1);
});
