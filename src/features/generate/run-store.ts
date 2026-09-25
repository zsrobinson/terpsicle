import { create } from "zustand";
import { track } from "~/app/analytics";
import {
  activeMustHaves,
  draftCourseCodes,
  requestItems,
} from "~/core/generate/draft";
import {
  DEFAULT_GENERATE_LIMITS,
  type GenerateDraft,
  type GenerateRequest,
  type GenerateResult,
  type TermId,
} from "~/core/schema";
import { deptOf, useCatalog } from "~/state/catalog-store";
import { useWorkspace } from "~/state/workspace-store";
import {
  defaultGenerator,
  GenerateCancelled,
  type GenerateInput,
  type Generator,
} from "~/worker/generator";

// One Generate run at a time: load what the request needs, run the search in
// the worker, keep the result. Results aren't persisted (the drafts are);
// they're quick to recompute and the catalog may have moved on.

export type RunStatus =
  | { kind: "idle" }
  /** Loading the courses, seats, routes and ratings the request needs. */
  | { kind: "loading" }
  | { kind: "running"; steps: number; found: number }
  | {
      kind: "done";
      request: GenerateRequest;
      result: GenerateResult;
      durationMs: number;
    }
  | { kind: "error"; message: string };

/**
 * What the tab shows: the form, or the latest results under a one-line
 * summary of what was asked (UX-REVIEW §4.8). A finished run shows its
 * results; "Edit" goes back to the form.
 */
export type GenerateView = "form" | "results";

export interface GenerateRunState {
  termId: TermId | null;
  status: RunStatus;
  view: GenerateView;
  /** Result ids ticked for "Save N plans". */
  selected: readonly string[];
  toggleSelected: (resultId: string) => void;
  clearSelected: () => void;
  setView: (view: GenerateView) => void;
}

export const INITIAL_RUN_STATE = {
  termId: null,
  status: { kind: "idle" },
  view: "form",
  selected: [],
} satisfies Partial<GenerateRunState>;

export const useGenerateRun = create<GenerateRunState>()((set, get) => ({
  ...INITIAL_RUN_STATE,
  toggleSelected: (resultId) => {
    const { selected } = get();
    set({
      selected: selected.includes(resultId)
        ? selected.filter((id) => id !== resultId)
        : [...selected, resultId],
    });
  },
  clearSelected: () => set({ selected: [] }),
  setView: (view) => set({ view }),
}));

let generator: Generator | null = null;
/** Tests run the search in-process. */
export function setGenerator(next: Generator | null): void {
  generator = next;
}

let current: { seq: number; cancel: () => void } | null = null;
let seq = 0;

/** The request the form describes, for the term's blocks and travel settings. */
export function buildRequest(
  termId: TermId,
  draft: GenerateDraft,
): GenerateRequest {
  const { blocks, travel } = useWorkspace.getState();
  return {
    termId,
    items: requestItems(draft.items),
    mustHaves: draft.mustHaves,
    rankBy: draft.rankBy,
    blocks: blocks.filter((b) => b.termId === termId),
    travel,
    limits: DEFAULT_GENERATE_LIMITS,
  };
}

async function gatherInput(request: GenerateRequest): Promise<GenerateInput> {
  const codes = draftCourseCodes(request.items);
  const depts = [...new Set(codes.map(deptOf))];
  const catalog = useCatalog.getState();
  // PlanetTerp files are extras: a department that fails to load is unrated,
  // which ranking treats as neutral.
  await Promise.all([
    catalog.ensureDepts(request.termId, depts),
    request.mustHaves.enoughTravelTime ? catalog.ensureCampus() : null,
    ...depts.map((d) => catalog.ensureInstructors(d)),
  ]);
  const { byTerm, campus, instructors } = useCatalog.getState();
  const ratings = depts.flatMap((d) => {
    const file = instructors[d];
    return file ? [file] : [];
  });
  const term = byTerm[request.termId];
  if (!term || term.manifestState === "error")
    throw new Error(
      "Couldn't load this term's courses. Check your connection and try again.",
    );
  const courses = codes.flatMap((code) => {
    const course = term.index.courses.get(code);
    return course ? [course] : [];
  });
  return {
    courses,
    seats: term.seats?.seats ?? null,
    campus,
    ratings,
  };
}

/**
 * Generates plans for the form as it is. A newer run replaces an older one.
 * `relaxed` marks a run started from a suggested relaxation (analytics).
 */
export async function runGenerate(
  termId: TermId,
  draft: GenerateDraft,
  { relaxed = false }: { relaxed?: boolean } = {},
): Promise<void> {
  current?.cancel();
  const mine = ++seq;
  const isCurrent = () => current?.seq === mine;
  current = { seq: mine, cancel: () => {} };
  const set = (patch: Partial<GenerateRunState>) => {
    if (isCurrent()) useGenerateRun.setState(patch);
  };
  set({ termId, status: { kind: "loading" }, selected: [] });
  const started = performance.now();
  const request = buildRequest(termId, draft);
  try {
    const input = await gatherInput(request);
    if (!isCurrent()) return;
    generator ??= defaultGenerator();
    // Progress comes over its own Comlink port, so the last report can land
    // after the result does. Once the result is in, progress is stale.
    let finished = false;
    const job = generator.run(request, input, ({ steps, found }) => {
      if (!finished) set({ status: { kind: "running", steps, found } });
    });
    current = { seq: mine, cancel: job.cancel };
    set({ status: { kind: "running", steps: 0, found: 0 } });
    const result = await job.result;
    finished = true;
    if (!isCurrent()) return;
    const durationMs = Math.round(performance.now() - started);
    set({
      status: { kind: "done", request, result, durationMs },
      view: "results",
    });
    track("generate_run", {
      courses: input.courses.length,
      mustHaves: activeMustHaves(request.mustHaves, request.blocks.length > 0),
      rankBy: request.rankBy.preset,
      results: result.results.length,
      durationMs,
      truncated: result.truncated,
      relaxed,
    });
  } catch (error) {
    if (error instanceof GenerateCancelled) return;
    console.error(error);
    set({
      status: {
        kind: "error",
        message:
          error instanceof Error && error.message.startsWith("Couldn't")
            ? error.message
            : "Couldn't generate plans. Try again, or reload the page.",
      },
    });
  }
}

/** Stops the run in progress, back to the form. */
export function stopGenerate(): void {
  const running = current;
  if (!running) return;
  running.cancel();
  current = null;
  useGenerateRun.setState({ status: { kind: "idle" } });
}

/** Forgets the last run (switching terms, tests). */
export function resetGenerateRun(): void {
  current?.cancel();
  current = null;
  useGenerateRun.setState(INITIAL_RUN_STATE);
}
