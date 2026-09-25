import { z } from "zod";
import {
  type Building,
  BuildingsFileSchema,
  buildingsKey,
  GEO_MANIFEST_KEY,
  GeoManifestSchema,
  JOBS_PREFIX,
  RouteGeometrySchema,
  routeGeometryKey,
  routesKey,
  SCHEMA_VERSIONS,
  TRAVEL_MODES,
  type TravelMode,
} from "~/core/schema";
import type { BlobStore } from "../blob-store";
import { contentHash, JSON_TYPE, toJsonBytes } from "../hash";
import { type HttpClient, mapLimit } from "../http";
import {
  type Logger,
  readJson,
  readJsonOrNull,
  updatePointer,
  writeJson,
} from "../publish";
import { encodeRoutes, simplifyPath } from "./encode";
import {
  type Closest,
  type Entrance,
  fetchEntrances,
  fetchToken,
  type RouteRequest,
  solveClosest,
  solveRoutes,
} from "./gis";

// Walking distances and route geometry for every pair of catalog buildings
// (DATA.md §4.2–4.3), from UMD's routing network. Runs as a Node script in
// GitHub Actions, not a Worker cron: Workers can't fetch the token from
// maps.umd.edu (HTTP 526, incomplete TLS chain; STATUS.md). Incremental: only
// pairs that are new, whose entrances changed, or whose geometry is missing
// are solved again.

const STATE_KEY = `${JOBS_PREFIX}routes/state.json`;

/** Absent: not solved yet. null: solved, no route. */
const PairSchema = z.object({
  standard: z.number().int().nullable().optional(),
  accessible: z.number().int().nullable().optional(),
});
const StateSchema = z.object({
  /** Building number → hash of its routable entrances per mode (null: none). */
  entrances: z.record(
    z.string(),
    z.object({
      standard: z.string().nullable(),
      accessible: z.string().nullable(),
    }),
  ),
  /** "<a>|<b>" (building numbers, a < b) → feet per mode, null when there's no route. */
  pairs: z.record(z.string(), PairSchema),
  /** "<FROM>|<TO>|<mode>" (codes) → the lengthFeet of the geometry file written. */
  geometry: z.record(z.string(), z.number()),
});
type State = z.infer<typeof StateSchema>;

/** Route/solve requests per call. */
const ROUTES_PER_SOLVE = 50;
const GIS_CONCURRENCY = 2;
const WRITE_CONCURRENCY = 16;

export interface RoutesOptions {
  /** For gis.umd.edu. */
  http: HttpClient;
  /** For the token at maps.umd.edu (needs the extra intermediates); defaults to `http`. */
  tokenHttp?: HttpClient;
  store: BlobStore;
  now: Date;
  log: Logger;
  /** Solve every pair again. */
  force?: boolean;
}

export interface RoutesResult {
  buildings: number;
  numbers: number;
  solvedPairs: number;
  gisRequests: number;
  geometryWritten: number;
  knownPairs: Record<TravelMode, number>;
  noRoute: Record<TravelMode, number>;
  hash: string;
  errors: string[];
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export async function runRoutes(options: RoutesOptions): Promise<RoutesResult> {
  const { http, store, now, log } = options;
  const errors: string[] = [];
  const manifest = await readJson(store, GEO_MANIFEST_KEY, GeoManifestSchema);
  if (!manifest)
    throw new Error(
      `${GEO_MANIFEST_KEY} is missing; run the buildings job first`,
    );
  const buildingsFile = await readJson(
    store,
    buildingsKey(manifest.buildings.hash),
    BuildingsFileSchema,
  );
  if (!buildingsFile)
    throw new Error(`The buildings file in ${GEO_MANIFEST_KEY} is missing`);
  const buildings = buildingsFile.buildings;
  const codesByNumber = new Map<string, Building[]>();
  for (const b of buildings)
    codesByNumber.set(b.number, [...(codesByNumber.get(b.number) ?? []), b]);
  const numbers = [...codesByNumber.keys()].sort();

  const saved = options.force
    ? null
    : await readJsonOrNull(store, STATE_KEY, StateSchema, log);
  const state: State = saved ?? { entrances: {}, pairs: {}, geometry: {} };
  const requestsBefore = http.stats.requests;
  const { token } = await fetchToken(options.tokenHttp ?? http);

  const noRoute: Record<TravelMode, number> = { standard: 0, accessible: 0 };
  let solvedPairs = 0;
  let geometryWritten = 0;
  const entranceHashes: State["entrances"] = {};

  for (const mode of TRAVEL_MODES) {
    const entrances = await fetchEntrances(http, token, mode, numbers);
    for (const n of numbers) {
      const list = entrances.get(n);
      entranceHashes[n] ??= { standard: null, accessible: null };
      entranceHashes[n][mode] = list
        ? await contentHash(JSON.stringify(list))
        : null;
    }
    const changed = new Set(
      numbers.filter(
        (n) => state.entrances[n]?.[mode] !== entranceHashes[n]?.[mode],
      ),
    );

    const needsGeometry = (a: string, b: string, feet: number) =>
      (codesByNumber.get(a) ?? []).some((ca) =>
        (codesByNumber.get(b) ?? []).some(
          (cb) =>
            state.geometry[`${ca.code}|${cb.code}|${mode}`] !==
              Math.round(feet) ||
            state.geometry[`${cb.code}|${ca.code}|${mode}`] !==
              Math.round(feet),
        ),
      );

    // Origin → destinations to solve this run.
    const work = new Map<string, string[]>();
    for (const [i, a] of numbers.entries()) {
      for (const b of numbers.slice(i + 1)) {
        const prior = state.pairs[pairKey(a, b)];
        const feet = prior?.[mode];
        const stale =
          prior === undefined ||
          feet === undefined ||
          changed.has(a) ||
          changed.has(b) ||
          (feet !== null && needsGeometry(a, b, feet));
        if (stale && entrances.has(a) && entrances.has(b))
          work.set(a, [...(work.get(a) ?? []), b]);
        else if (stale) setPair(state, a, b, mode, null);
      }
    }

    const solved: Closest[] = [];
    await mapLimit([...work], GIS_CONCURRENCY, async ([a, bs]) => {
      const from = entrances.get(a) ?? [];
      const to = bs.flatMap((b) => entrances.get(b) ?? []);
      try {
        const best = await solveClosest(http, token, mode, from, to);
        for (const b of bs) {
          const hit = best.get(b);
          setPair(state, a, b, mode, hit ? hit.feet : null);
          if (hit) solved.push(hit);
          else noRoute[mode]++;
          solvedPairs++;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${mode} from ${a}: ${message}`);
      }
    });

    // Geometry for every solved pair, in batches, both directions for every code.
    const requests: (RouteRequest & {
      closest: Closest;
      fromNumber: string;
    })[] = solved.map((c) => ({
      id: `${c.from.building}-${c.to}`,
      from: c.from,
      to: c.toEntrance,
      closest: c,
      fromNumber: c.from.building,
    }));
    const batches: (typeof requests)[] = [];
    for (let i = 0; i < requests.length; i += ROUTES_PER_SOLVE)
      batches.push(requests.slice(i, i + ROUTES_PER_SOLVE));
    await mapLimit(batches, GIS_CONCURRENCY, async (batch) => {
      let paths: Awaited<ReturnType<typeof solveRoutes>>;
      try {
        paths = await solveRoutes(http, token, mode, batch);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${mode} geometry: ${message}`);
        return;
      }
      const writes: {
        key: string;
        bytes: Uint8Array;
        id: string;
        feet: number;
      }[] = [];
      for (const r of batch) {
        const path = paths.get(r.id)?.path;
        if (!path) continue;
        const feet = Math.round(r.closest.feet);
        const forward = simplifyPath(path);
        for (const ca of codesByNumber.get(r.fromNumber) ?? []) {
          for (const cb of codesByNumber.get(r.closest.to) ?? []) {
            for (const [from, to, coordinates] of [
              [ca.code, cb.code, forward],
              [cb.code, ca.code, [...forward].reverse()],
            ] as const) {
              const file = RouteGeometrySchema.parse({
                schemaVersion: SCHEMA_VERSIONS.geo,
                from,
                to,
                mode,
                lengthFeet: feet,
                coordinates,
                source: "umd-gis",
                fetchedAt: now.toISOString(),
              });
              writes.push({
                key: routeGeometryKey(from, to, mode),
                bytes: toJsonBytes(file),
                id: `${from}|${to}|${mode}`,
                feet,
              });
            }
          }
        }
      }
      await mapLimit(writes, WRITE_CONCURRENCY, async (w) => {
        await store.put(w.key, w.bytes, { contentType: JSON_TYPE });
        state.geometry[w.id] = w.feet;
        geometryWritten++;
      });
    });
  }
  state.entrances = entranceHashes;
  await writeJson(store, STATE_KEY, state);

  // The distance matrices, by code.
  const codes = buildings.map((b) => b.code).sort();
  const numberOf = new Map(buildings.map((b) => [b.code, b.number]));
  const knownPairs: Record<TravelMode, number> = { standard: 0, accessible: 0 };
  const matrices = TRAVEL_MODES.map((mode) =>
    codes.flatMap((ci) =>
      codes.map((cj) => {
        const a = numberOf.get(ci) ?? "";
        const b = numberOf.get(cj) ?? "";
        if (a === b) return 0;
        // undefined: not solved yet; null: no route.
        const feet = state.pairs[pairKey(a, b)]?.[mode];
        if (typeof feet === "number") knownPairs[mode]++;
        return feet;
      }),
    ),
  );
  const bytes = encodeRoutes(
    { buildings: codes, modes: ["standard", "accessible"] },
    matrices,
  );
  const hash = await contentHash(bytes);
  if (manifest.routes?.hash !== hash) {
    await store.put(routesKey(hash), bytes, {
      contentType: "application/octet-stream",
    });
  }
  await updatePointer(store, GEO_MANIFEST_KEY, GeoManifestSchema, (current) =>
    current
      ? {
          ...current,
          generatedAt: now.toISOString(),
          routes: {
            hash,
            buildingCount: codes.length,
            knownPairs,
            builtAt: now.toISOString(),
          },
        }
      : null,
  );
  return {
    buildings: codes.length,
    numbers: numbers.length,
    solvedPairs,
    gisRequests: http.stats.requests - requestsBefore,
    geometryWritten,
    knownPairs,
    noRoute,
    hash,
    errors,
  };
}

function setPair(
  state: State,
  a: string,
  b: string,
  mode: TravelMode,
  feet: number | null,
) {
  const key = pairKey(a, b);
  const pair = state.pairs[key] ?? {};
  // Whole feet, the same rounding as the binary and the geometry files.
  pair[mode] = feet === null ? null : Math.round(feet);
  state.pairs[key] = pair;
}

export type { Entrance };
