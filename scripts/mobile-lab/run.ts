// Runs the mobile scenarios against a deployed Terpsicle on one engine and
// writes screenshots, recordings, summary.json and README.md.
//
//   pnpm tsx scripts/mobile-lab/run.ts --engine webkit --url https://terpsicle.com
//
// docs/MOBILE-TESTING.md has the engines, the CI workflow and how to read a run.

import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import type { Device, Engine } from "./device";
import { Lab } from "./lab";
import { shrinkVideo } from "./media";
import {
  markdown,
  passed,
  type RunResult,
  type ScenarioResult,
  tally,
} from "./report";
import { SCENARIOS } from "./scenarios";

const ENGINES: Engine[] = ["webkit", "chromium", "android", "ios"];

const { values } = parseArgs({
  allowNegative: true,
  options: {
    engine: { type: "string", default: "webkit" },
    url: { type: "string", default: "https://terpsicle.com" },
    out: { type: "string" },
    only: { type: "string" },
    video: { type: "boolean", default: true },
    source: { type: "string" },
    // Each scenario this many times in a row: for flaky failures.
    repeat: { type: "string", default: "1" },
  },
});

const engine = values.engine as Engine;
if (!ENGINES.includes(engine))
  throw new Error(`--engine must be one of ${ENGINES.join(", ")}`);
const url = values.url;
const out = path.resolve(
  values.out ??
    `mobile-lab-results/${new Date().toISOString().replace(/[:.]/g, "-")}-${engine}`,
);
const only = values.only?.split(",").map((s) => s.trim());
const chosen = only ? SCENARIOS.filter((s) => only.includes(s.id)) : SCENARIOS;
if (chosen.length === 0) throw new Error(`no scenarios match ${only}`);
const repeat = Math.max(1, Math.min(20, Number(values.repeat) || 1));
// Repeats get their own ids (and folders): tabs, tabs-2, tabs-3, ...
const scenarios = chosen.flatMap((s) =>
  Array.from({ length: repeat }, (_, i) =>
    i === 0
      ? s
      : { ...s, id: `${s.id}-${i + 1}`, title: `${s.title} (run ${i + 1})` },
  ),
);

async function device(): Promise<Device> {
  switch (engine) {
    case "webkit":
    case "chromium":
      return (await import("./devices/playwright")).playwrightDevice(engine);
    case "android":
      return (await import("./devices/android")).androidDevice();
    case "ios":
      return (await import("./devices/ios")).iosDevice();
  }
}

mkdirSync(out, { recursive: true });
const started = Date.now();
let phone: Device;
try {
  phone = await device();
} catch (error) {
  // Still leave a report, so a run that never started says why.
  const message = error instanceof Error ? error.message : String(error);
  const failed: RunResult = {
    engine,
    device: `couldn't start: ${message}`,
    url,
    startedAt: new Date(started).toISOString(),
    ms: Date.now() - started,
    source: values.source ?? null,
    scenarios: [],
  };
  writeFileSync(
    path.join(out, "summary.json"),
    JSON.stringify(failed, null, 1),
  );
  writeFileSync(path.join(out, "README.md"), markdown(failed));
  writeFileSync(
    path.join(out, "RESULT"),
    `Failed: the ${engine} device didn't start\n${engine}: ${message.slice(0, 200)}\n${url}\n`,
  );
  throw error;
}
const run: RunResult = {
  engine,
  device: await phone.describe(),
  url,
  startedAt: new Date(started).toISOString(),
  ms: 0,
  source: values.source ?? null,
  scenarios: [],
};

function save(): void {
  run.ms = Date.now() - started;
  writeFileSync(path.join(out, "summary.json"), JSON.stringify(run, null, 1));
  try {
    writeFileSync(path.join(out, "README.md"), markdown(run));
  } catch (error) {
    writeFileSync(
      path.join(out, "README.md"),
      `# Mobile lab: ${engine}\n\nThe report failed to render (${error}); summary.json has the run.\n`,
    );
  }
  // Three lines for the mobile-runs index (publish.sh).
  const t = tally(run.scenarios);
  writeFileSync(
    path.join(out, "RESULT"),
    `${passed(run) ? "Passed" : "Failed"}: ${t.failed} failed, ${t.warnings} warnings, ${t.errors} errors\n${engine}: ${run.device}\n${url}\n`,
  );
}

console.log(`${run.device}\n${url} → ${out}`);
for (const scenario of scenarios) {
  const dir = path.join(out, scenario.id);
  mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  const lab = new Lab(phone, url, dir);
  const result: ScenarioResult = {
    id: scenario.id,
    title: scenario.title,
    ms: 0,
    video: null,
    error: null,
    skipped: scenario.skip?.(engine) ?? null,
    steps: lab.steps,
  };
  run.scenarios.push(result);
  if (result.skipped) {
    console.log(`${scenario.id}: skipped (${result.skipped})`);
    continue;
  }
  try {
    await phone.begin(url, values.video ? path.join(dir, "video") : null);
    await scenario.run(lab);
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    console.error(`  ${scenario.id}: ${result.error}`);
    try {
      await lab.failure(error);
    } catch {
      // The device may be gone; the error above says why.
    }
  }
  try {
    const video = await phone.end();
    if (video && existsSync(video)) {
      const name = `video${path.extname(video)}`;
      renameSync(video, path.join(dir, name));
      shrinkVideo(path.join(dir, name));
      result.video = `${scenario.id}/${name}`;
    }
  } catch (error) {
    console.error(`  ${scenario.id}: stopping the recording failed: ${error}`);
  }
  result.ms = Date.now() - t0;
  const t = tally([result]);
  console.log(
    `${scenario.id}: ${lab.steps.length} steps, ${t.failed} failed, ${t.warnings} warnings, ${t.errors} errors (${Math.round(result.ms / 1000)} s)`,
  );
  save();
}
await phone.close().catch(() => undefined);
save();
const t = tally(run.scenarios);
console.log(
  `\n${passed(run) ? "PASSED" : "FAILED"}: ${t.failed} failed checks, ${t.warnings} warnings, ${t.errors} errors in ${Math.round(run.ms / 1000)} s\n${path.join(out, "README.md")}`,
);
process.exitCode = passed(run) ? 0 : 1;
