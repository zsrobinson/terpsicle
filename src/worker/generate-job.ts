import { buildCatalogIndex } from "~/core/catalog";
import { generatePlans, sectionQuality } from "~/core/generate";
import type {
  Course,
  GenerateProgress,
  GenerateRequest,
  GenerateResult,
  PlanetTerpDept,
} from "~/core/schema";
import type { SeatsMap } from "~/core/seats";
import type { CampusMap } from "~/core/travel";

// One generator run: what the main thread sends, and the pure call on the
// other side. Everything here is structured-cloneable so it crosses into the
// worker as is.

export type { GenerateProgress };

export type GenerateInput = {
  /** The request's courses, from the catalog the main thread has loaded. */
  readonly courses: readonly Course[];
  readonly seats: SeatsMap | null;
  readonly campus: CampusMap;
  /** PlanetTerp files for the request's departments (ratings and GPAs). */
  readonly ratings: readonly PlanetTerpDept[];
};

export function runGenerate(
  request: GenerateRequest,
  input: GenerateInput,
  onProgress?: (progress: GenerateProgress) => void,
  shouldCancel?: () => boolean,
): GenerateResult {
  return generatePlans(
    request,
    {
      index: buildCatalogIndex(request.termId, input.courses),
      seats: input.seats,
      campus: input.campus,
      quality: sectionQuality(input.courses, input.ratings),
    },
    {
      ...(onProgress ? { onProgress } : {}),
      ...(shouldCancel ? { shouldCancel } : {}),
    },
  );
}

/** What the worker exposes over Comlink (a plain object so tests can expose it on a MessagePort). */
export const generateWorkerApi = {
  generate(
    request: GenerateRequest,
    input: GenerateInput,
    onProgress: (progress: GenerateProgress) => void,
  ): GenerateResult {
    return runGenerate(request, input, onProgress);
  },
};

export type GenerateWorkerApi = typeof generateWorkerApi;
