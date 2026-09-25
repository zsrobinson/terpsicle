// Runs any ingest job locally against the filesystem or production R2.
//
//   pnpm tsx scripts/ingest.ts <job> [--target fs|r2] [--dir .data]
//        [--term <id>]… [--dept <CODE>]… [--force] [--grade-requests <n>]
//
// Jobs: catalog, seats, planetterp, calendar, buildings, routes. The routes
// job needs UMD's intermediate certificates; the script adds them itself.
// `--target r2` needs CLOUDFLARE_ACCOUNT_ID plus R2 credentials (see
// scripts/lib/r2-s3-blob-store.ts).
import path from "node:path";
import { parseArgs } from "node:util";
import type { BlobStore } from "~/ingest/blob-store";
import { runBuildings } from "~/ingest/buildings";
import { runCalendar } from "~/ingest/calendar";
import { runCatalog } from "~/ingest/catalog";
import { createHttpClient } from "~/ingest/http";
import { runPlanetTerp } from "~/ingest/planetterp";
import { consoleLogger } from "~/ingest/publish";
import { runRoutes } from "~/ingest/routes/build";
import { runSeats } from "~/ingest/seats";
import { createFsBlobStore } from "./lib/fs-blob-store";
import { relaunchWithNodeEnv } from "./lib/node-env";
import { createR2S3BlobStore } from "./lib/r2-s3-blob-store";
import { ROOT } from "./lib/source-files";

const JOBS = ["catalog", "seats", "planetterp", "calendar", "buildings", "routes"] as const;
type JobName = (typeof JOBS)[number];

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    target: { type: "string", default: "fs" },
    dir: { type: "string", default: path.join(ROOT, ".data") },
    term: { type: "string", multiple: true },
    dept: { type: "string", multiple: true },
    force: { type: "boolean", default: false },
    "grade-requests": { type: "string" },
  },
});

const job = positionals[0] as JobName | undefined;
if (!job || !JOBS.includes(job)) {
  console.error(`Usage: pnpm tsx scripts/ingest.ts <${JOBS.join("|")}> [--target fs|r2] …`);
  process.exit(2);
}
relaunchWithNodeEnv({ umdCa: job === "routes" });

async function main(name: JobName) {
  const store: BlobStore =
    values.target === "r2" ? await createR2S3BlobStore() : createFsBlobStore(values.dir);
  const http = createHttpClient({ fetch });
  const now = new Date();
  const log = consoleLogger;
  const started = performance.now();
  const cpuStart = process.cpuUsage();
  console.info(`${name} → ${values.target === "r2" ? "R2 (production)" : values.dir}`);

  let result: unknown;
  switch (name) {
    case "catalog":
      result = await runCatalog({ http, store, now, log, terms: values.term, departments: values.dept });
      break;
    case "seats":
      result = await runSeats({ http, store, now, log, terms: values.term, force: values.force });
      break;
    case "planetterp": {
      const requests = values["grade-requests"];
      result = await runPlanetTerp({
        http,
        store,
        now,
        log,
        ...(requests ? { gradeRequests: Number(requests) } : {}),
      });
      break;
    }
    case "calendar":
      result = await runCalendar({ http, store, now, log });
      break;
    case "buildings":
      result = await runBuildings({ http, store, now, log });
      break;
    case "routes":
      result = await runRoutes({ http, store, now, log, force: values.force });
      break;
  }
  const cpu = process.cpuUsage(cpuStart);
  console.info(
    JSON.stringify(
      {
        job: name,
        wallMs: Math.round(performance.now() - started),
        cpuMs: Math.round((cpu.user + cpu.system) / 1000),
        requests: http.stats,
        result,
      },
      null,
      2,
    ),
  );
}

main(job).catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
