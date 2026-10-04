// The umd.io backfill of the instructor history (DATA.md §3.5): who taught
// each section of each course in the terms the history lacks (every winter
// and summer back to Fall 2017, and Summer 2025 to Spring 2026), from umd.io's
// copy of Testudo, recorded as `source: umdio`. Our own records win over it;
// it wins over PlanetTerp's. Never run from CI.
//
//   pnpm tsx scripts/backfill-history-umdio.ts [--target fs|r2] [--dir .data]
//        [--term <id>]… [--cache .data/umdio] [--delay-ms 1000]
//        [--max-minutes <n>] [--dry-run]
//
// - Start with `--dry-run`: it reads every term into the cache and prints
//   courses and sections per term, and writes nothing to the store.
// - `--target r2 --max-minutes 8`, repeated until `left` is empty, fits a
//   shell that cuts commands off at 10 minutes. The cache keeps a term's
//   pages between runs (a fall term is about 120 pages), and
//   `_jobs/history/umdio.json` records the terms merged. A dry run's cache
//   is reused by the real run, so umd.io isn't asked twice.
// - `--term` picks terms (any umd.io has); without it, every umd.io term
//   the history's manifest lacks.
// - `--target r2` needs CLOUDFLARE_ACCOUNT_ID plus R2 credentials
//   (scripts/lib/r2-s3-blob-store.ts).
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { TermIdSchema } from "~/core/schema";
import type { BlobStore } from "~/ingest/blob-store";
import { backfillUmdio } from "~/ingest/history-umdio";
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
    term: { type: "string", multiple: true },
    cache: { type: "string", default: path.join(ROOT, ".data", "umdio") },
    "delay-ms": { type: "string", default: "1000" },
    "max-minutes": { type: "string" },
    "dry-run": { type: "boolean", default: false },
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
const terms = (values.term ?? []).map((t) => {
  const parsed = TermIdSchema.safeParse(t);
  if (!parsed.success) {
    console.error(`--term ${t} isn't a term id like 202505`);
    process.exit(2);
  }
  return parsed.data;
});
relaunchWithNodeEnv({ umdCa: false });

async function main() {
  const store: BlobStore =
    values.target === "r2"
      ? await createR2S3BlobStore()
      : createFsBlobStore(values.dir);
  const http = createHttpClient({ fetch });
  const cacheDir = values.cache;
  await mkdir(cacheDir, { recursive: true });
  const file = (termId: string) => path.join(cacheDir, `${termId}.json`);
  console.info(
    `umd.io history backfill → ${values.target === "r2" ? "R2 (production)" : values.dir}${values["dry-run"] ? " (dry run: nothing is written to the store)" : ""}`,
  );
  const started = performance.now();
  const maxMinutes = number(values["max-minutes"], "max-minutes", 1);
  const result = await backfillUmdio({
    http,
    store,
    now: new Date(),
    log: consoleLogger,
    ...(terms.length > 0 ? { terms } : {}),
    delayMs: number(values["delay-ms"], "delay-ms", 250),
    dryRun: values["dry-run"],
    cache: {
      read: async (termId) =>
        existsSync(file(termId)) ? readFile(file(termId), "utf8") : null,
      write: (termId, text) => writeFile(file(termId), text),
    },
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
