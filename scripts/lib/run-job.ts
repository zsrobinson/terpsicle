import type { BlobStore } from "~/ingest/blob-store";
import { runBuildings } from "~/ingest/buildings";
import { runCalendar } from "~/ingest/calendar";
import { runCatalog } from "~/ingest/catalog";
import { publishCourseIndex } from "~/ingest/course-index";
import { createHttpClient } from "~/ingest/http";
import { runPlanetTerp } from "~/ingest/planetterp/planetterp";
import { consoleLogger } from "~/ingest/publish";
import { runRoutes } from "~/ingest/routes/build";
import { runSeats } from "~/ingest/seats";
import { createFsBlobStore } from "./fs-blob-store";
import { createR2S3BlobStore } from "./r2-s3-blob-store";

export const PIPELINE_JOBS = [
  "catalog",
  "courses",
  "seats",
  "planetterp",
  "calendar",
  "buildings",
  "routes",
] as const;
export type PipelineJob = (typeof PIPELINE_JOBS)[number];

export interface RunOptions {
  target: "fs" | "r2";
  dir: string;
  terms?: string[];
  departments?: string[];
  force?: boolean;
  gradeRequests?: number;
}

/** Runs one ingest job with the same code the Worker crons use, and prints a summary. */
export async function runPipelineJob(
  job: PipelineJob,
  options: RunOptions,
): Promise<unknown> {
  const store: BlobStore =
    options.target === "r2"
      ? await createR2S3BlobStore()
      : createFsBlobStore(options.dir);
  const http = createHttpClient({ fetch });
  const common = { http, store, now: new Date(), log: consoleLogger };
  const started = performance.now();
  const cpuStart = process.cpuUsage();
  console.info(
    `${job} → ${options.target === "r2" ? "R2 (production)" : options.dir}`,
  );

  let result: { errors?: unknown[] } & Record<string, unknown>;
  switch (job) {
    case "catalog":
      result = {
        ...(await runCatalog({
          ...common,
          terms: options.terms,
          departments: options.departments,
        })),
      };
      break;
    case "courses":
      // The course index alone, from the catalog already in the store.
      result = { ...(await publishCourseIndex(common)) };
      break;
    case "seats":
      result = {
        ...(await runSeats({
          ...common,
          terms: options.terms,
          force: options.force,
        })),
      };
      break;
    case "planetterp":
      result = {
        ...(await runPlanetTerp({
          ...common,
          ...(options.gradeRequests !== undefined
            ? { gradeRequests: options.gradeRequests }
            : {}),
        })),
      };
      break;
    case "calendar":
      result = { ...(await runCalendar(common)) };
      break;
    case "buildings":
      result = { ...(await runBuildings(common)) };
      break;
    case "routes":
      result = { ...(await runRoutes({ ...common, force: options.force })) };
      break;
  }
  const cpu = process.cpuUsage(cpuStart);
  const summary = {
    job,
    wallMs: Math.round(performance.now() - started),
    cpuMs: Math.round((cpu.user + cpu.system) / 1000),
    requests: http.stats,
    ...result,
    errors: (result.errors ?? []).slice(0, 30),
  };
  console.info(JSON.stringify(summary, null, 2));
  return summary;
}
