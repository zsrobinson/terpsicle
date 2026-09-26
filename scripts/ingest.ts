// Runs any ingest job locally against the filesystem or production R2, with
// the same code the Worker crons run.
//
//   pnpm tsx scripts/ingest.ts <job> [--target fs|r2] [--dir .data]
//        [--term <id>]… [--dept <CODE>]… [--force] [--grade-requests <n>]
//
// Jobs: catalog, courses (the course index alone, from the catalog in the
// store), seats, planetterp, calendar, buildings, routes.
// - `--target r2` needs CLOUDFLARE_ACCOUNT_ID plus R2 credentials
//   (scripts/lib/r2-s3-blob-store.ts).
// - `routes` needs UMD's intermediate certificates; the script adds them.
// - `planetterp --grade-requests 100000` fetches every course's grades
//   (a first seed); the nightly cron does 700.
import path from "node:path";
import { parseArgs } from "node:util";
import { relaunchWithNodeEnv } from "./lib/node-env";
import { PIPELINE_JOBS, type PipelineJob, runPipelineJob } from "./lib/run-job";
import { ROOT } from "./lib/source-files";

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

const job = positionals[0] as PipelineJob | undefined;
if (
  !job ||
  !PIPELINE_JOBS.includes(job) ||
  (values.target !== "fs" && values.target !== "r2")
) {
  console.error(
    `Usage: pnpm tsx scripts/ingest.ts <${PIPELINE_JOBS.join("|")}> [--target fs|r2] [--term <id>] [--dept <CODE>] [--force] [--grade-requests <n>]`,
  );
  process.exit(2);
}
relaunchWithNodeEnv({ umdCa: job === "routes" });

const requests = values["grade-requests"];
runPipelineJob(job, {
  target: values.target,
  dir: values.dir,
  ...(values.term ? { terms: values.term } : {}),
  ...(values.dept ? { departments: values.dept } : {}),
  force: values.force,
  ...(requests ? { gradeRequests: Number(requests) } : {}),
}).catch((error: unknown) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
  process.exit(1);
});
