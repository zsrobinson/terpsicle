// The College Park basemap: a Protomaps (OpenStreetMap) extract around
// campus → geo/tiles.pmtiles in R2. Run rarely (campus maps change slowly).
//
//   pnpm tsx scripts/build-tiles.ts [--out <file>] [--no-upload]
//
// Needs the pmtiles CLI: `go install github.com/protomaps/go-pmtiles@latest`
// (installs `go-pmtiles`), or a `pmtiles` release binary; set PMTILES_BIN to
// point at either. What it runs:
//
//   go-pmtiles extract https://build.protomaps.com/<latest>.pmtiles <out> \
//     --bbox=-76.965,38.975,-76.915,39.005
//
// z0–15, about 2.8 MB. MapLibre overzooms past 15. The data is OpenStreetMap
// (ODbL): the map must show "© OpenStreetMap".
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { TILES_KEY } from "~/core/schema";
import { relaunchWithNodeEnv } from "./lib/node-env";
import { createR2S3BlobStore } from "./lib/r2-s3-blob-store";

relaunchWithNodeEnv();

/** Campus plus a margin: lon −76.965…−76.915, lat 38.975…39.005. */
export const CAMPUS_BBOX = "-76.965,38.975,-76.915,39.005";

const { values } = parseArgs({
  options: {
    out: {
      type: "string",
      default: path.join(tmpdir(), "terpsicle-campus.pmtiles"),
    },
    "no-upload": { type: "boolean", default: false },
  },
});

function pmtilesBinary(): string {
  const candidates = [process.env.PMTILES_BIN, "pmtiles", "go-pmtiles"].filter(
    (c): c is string => Boolean(c),
  );
  for (const bin of candidates) {
    try {
      execFileSync(bin, ["version"], { stdio: "ignore" });
      return bin;
    } catch {
      // Try the next name.
    }
  }
  throw new Error(
    "No pmtiles CLI found. Install one with `go install github.com/protomaps/go-pmtiles@latest` or set PMTILES_BIN.",
  );
}

async function main() {
  const builds = (await (
    await fetch("https://build-metadata.protomaps.dev/builds.json")
  ).json()) as {
    key: string;
  }[];
  const latest = builds.at(-1)?.key;
  if (!latest) throw new Error("Protomaps lists no builds");
  const source = `https://build.protomaps.com/${latest}`;
  console.info(`Extracting ${CAMPUS_BBOX} from ${source}`);
  execFileSync(
    pmtilesBinary(),
    ["extract", source, values.out, `--bbox=${CAMPUS_BBOX}`],
    {
      stdio: "inherit",
    },
  );
  const bytes = statSync(values.out).size;
  console.info(`${values.out}: ${(bytes / 1e6).toFixed(2)} MB`);
  if (values["no-upload"]) return;
  const store = await createR2S3BlobStore();
  await store.put(TILES_KEY, new Uint8Array(readFileSync(values.out)), {
    contentType: "application/vnd.pmtiles",
  });
  console.info(`Uploaded to R2 ${TILES_KEY}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
