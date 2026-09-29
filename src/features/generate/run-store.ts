import type { QueryClient } from "@tanstack/react-query";
import { matchesWildcard, wildcardDept } from "~/core/catalog";
import {
  activeMustHaves,
  draftCourseCodes,
  requestItems,
} from "~/core/generate/draft";
import {
  activePreferences,
  preferenceLevels,
} from "~/core/generate/preferences";
import { ranksByQuality } from "~/core/generate/score";
import { sameChips } from "~/core/generate/url";
import {
  DEFAULT_GENERATE_LIMITS,
  type DeptCode,
  type GenerateDraft,
  type GenerateRequest,
  type PlanetTerpDept,
  type TermId,
} from "~/core/schema";
import { EMPTY_CAMPUS } from "~/core/travel";
import { currentView, goTo } from "~/features/schedule/schedule-nav";
import { track } from "~/lib/analytics";
import { deptOf, useCatalog } from "~/state/catalog-store";
import {
  type GenerateRunState,
  type GenerateView,
  INITIAL_RUN_STATE,
  useGenerateRun,
} from "~/state/generate-run-store";
import {
  ensureCampus,
  ensurePlanetTerpDepts,
  loadedCampus,
} from "~/state/query/catalog";
import { usePublishedSource } from "~/state/query/published";
import { useWorkspace } from "~/state/workspace-store";
import {
  defaultGenerator,
  GenerateCancelled,
  type GenerateInput,
  type Generator,
  GeneratorUnavailable,
} from "~/worker/generator";

// One Generate run at a time: load what the request needs, run the search in
// the worker, keep the result. Results aren't persisted (the drafts are);
// they're quick to recompute and the catalog may have moved on.

export {
  type GenerateRunState,
  type GenerateView,
  INITIAL_RUN_STATE,
  type RunStatus,
  useGenerateRun,
} from "~/state/generate-run-store";

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

async function gatherInput(
  request: GenerateRequest,
  client: QueryClient,
): Promise<GenerateInput> {
  const codes = draftCourseCodes(request.items);
  const wildcards = request.items.flatMap((i) =>
    i.kind === "wildcard" ? [i.wildcard] : [],
  );
  // A pattern needs its department; a gen-ed can match in any of them.
  const patternDepts = wildcards.flatMap((w) => wildcardDept(w) ?? []);
  const wholeTerm = wildcards.some((w) => wildcardDept(w) === null);
  const depts = [...new Set([...codes.map(deptOf), ...patternDepts])];
  const catalog = useCatalog.getState();
  const source = usePublishedSource.getState().source;
  // PlanetTerp files are extras: a department that fails to load is unrated,
  // which ranking treats as neutral. So is a campus map that can't load.
  const [, walking, planetTerp] = await Promise.all([
    wholeTerm
      ? catalog.ensureTerm(request.termId, depts)
      : catalog.ensureDepts(request.termId, depts),
    request.mustHaves.enoughTravelTime && source
      ? ensureCampus(client, source).catch(() => null)
      : null,
    source
      ? ensurePlanetTerpDepts(client, source, depts)
      : new Map<DeptCode, PlanetTerpDept>(),
  ]);
  const term = useCatalog.getState().byTerm[request.termId];
  if (!term || term.manifestState === "error")
    throw new Error(
      "Couldn't load this term's courses. Check your connection and try again.",
    );
  const listed = codes.flatMap((code) => {
    const course = term.index.courses.get(code);
    return course ? [course] : [];
  });
  const options = [...term.index.courses.values()].filter(
    (c) =>
      c.sections.length > 0 &&
      !codes.includes(c.code) &&
      wildcards.some((w) => matchesWildcard(w, c)),
  );
  // A gen-ed can span dozens of departments' PlanetTerp files. They're
  // fetched only when the ranking is by ratings or GPAs; otherwise those
  // options rank as unrated, which is neutral.
  const rated = new Set(depts);
  if (wholeTerm && ranksByQuality(request.rankBy) && source) {
    for (const c of options) rated.add(deptOf(c.code));
    const more = await ensurePlanetTerpDepts(client, source, [...rated]);
    for (const [dept, file] of more) planetTerp.set(dept, file);
  }
  // Without the travel check, whatever of the map is already here.
  const campus =
    walking ?? (source ? loadedCampus(client, source) : EMPTY_CAMPUS);
  const ratings = [...rated].flatMap((d) => {
    const file = planetTerp.get(d);
    return file ? [file] : [];
  });
  return {
    courses: [...listed, ...options],
    seats: term.seats?.seats ?? null,
    campus,
    ratings,
  };
}

/** The form the latest run was started from, so a chip change runs once. */
let asked: { termId: TermId; draft: GenerateDraft } | null = null;

/**
 * Generates plans for the form as it is. A newer run replaces an older one.
 * `relaxed` marks a run started from a suggested relaxation (analytics).
 * `live` is a chip changed over results already on screen: they stay, dimmed,
 * until the new ones land, and the view doesn't change.
 */
export async function runGenerate(
  termId: TermId,
  draft: GenerateDraft,
  client: QueryClient,
  { relaxed = false, live = false }: { relaxed?: boolean; live?: boolean } = {},
): Promise<void> {
  current?.cancel();
  cancelLiveRun();
  const mine = ++seq;
  const isCurrent = () => current?.seq === mine;
  current = { seq: mine, cancel: () => {} };
  asked = { termId, draft };
  const set = (patch: Partial<GenerateRunState>) => {
    if (isCurrent()) useGenerateRun.setState(patch);
  };
  const before = useGenerateRun.getState();
  const keep =
    live && before.termId === termId && before.status.kind === "done";
  set(
    keep
      ? { refreshing: true }
      : { termId, status: { kind: "loading" }, refreshing: false },
  );
  const started = performance.now();
  const request = buildRequest(termId, draft);
  try {
    const input = await gatherInput(request, client);
    if (!isCurrent()) return;
    generator ??= defaultGenerator();
    // Progress comes over its own Comlink port, so the last report can land
    // after the result does. Once the result is in, progress is stale.
    let finished = false;
    const job = generator.run(request, input, ({ steps, found }) => {
      if (!finished && !keep)
        set({ status: { kind: "running", steps, found } });
    });
    current = { seq: mine, cancel: job.cancel };
    if (!keep) set({ status: { kind: "running", steps: 0, found: 0 } });
    const result = await job.result;
    finished = true;
    if (!isCurrent()) return;
    const durationMs = Math.round(performance.now() - started);
    set({
      status: { kind: "done", request, result, durationMs },
      refreshing: false,
    });
    if (!keep && isCurrent()) showGenerateView("results");
    track("generate_run", {
      courses: draftCourseCodes(request.items).length,
      wildcards: request.items.flatMap((i) =>
        i.kind === "wildcard" ? [i.wildcard.kind] : [],
      ),
      mustHaves: activeMustHaves(request.mustHaves, request.blocks.length > 0),
      rankBy: request.rankBy.preset,
      preferences: activePreferences(preferenceLevels(request.rankBy)),
      results: result.results.length,
      durationMs,
      truncated: result.truncated,
      relaxed,
      live,
    });
  } catch (error) {
    if (error instanceof GenerateCancelled) return;
    console.error(error);
    set({
      refreshing: false,
      status: {
        kind: "error",
        message:
          error instanceof Error && error.message.startsWith("Couldn't")
            ? error.message
            : "Couldn't generate plans. Try again.",
        ...(error instanceof GeneratorUnavailable ? { reload: true } : {}),
      },
    });
  }
}

/** How long the chips wait for the next click before running (a burst runs once). */
export const LIVE_RUN_DELAY_MS = 250;
let liveTimer: ReturnType<typeof setTimeout> | null = null;

function cancelLiveRun(): void {
  if (liveTimer !== null) clearTimeout(liveTimer);
  liveTimer = null;
}

/**
 * Whether a form differs from the latest run's only in its chips: the same
 * courses, other filters or preferences. Those run again on their own; a
 * changed course list waits for Generate again.
 */
export function chipsChangedSinceRun(
  termId: TermId,
  draft: GenerateDraft,
): boolean {
  const run = useGenerateRun.getState();
  if (!asked || asked.termId !== termId || run.termId !== termId) return false;
  if (run.status.kind === "idle") return false;
  const items = (d: GenerateDraft) => JSON.stringify(requestItems(d.items));
  return items(asked.draft) === items(draft) && !sameChips(asked.draft, draft);
}

/**
 * Ranks again after a chip changes (SPEC §3.9, "Live results"), once the
 * clicks stop for a moment, in the worker like any run.
 */
export function runLive(
  termId: TermId,
  draft: GenerateDraft,
  client: QueryClient,
): void {
  cancelLiveRun();
  liveTimer = setTimeout(() => {
    liveTimer = null;
    void runGenerate(termId, draft, client, { live: true });
  }, LIVE_RUN_DELAY_MS);
}

/**
 * Shows the form or the latest results. They're two places, so on screen
 * the change pushes an entry: Back returns to the other. Elsewhere, the tab
 * shows it when next opened.
 */
export function showGenerateView(view: GenerateView): void {
  useGenerateRun.getState().setView(view);
  const here = currentView();
  if (here.tab === "generate" && !here.drill)
    goTo({ tab: "generate", drill: null });
}

/** Stops the run in progress, back to the form. */
export function stopGenerate(): void {
  const running = current;
  if (!running) return;
  running.cancel();
  current = null;
  useGenerateRun.setState({ status: { kind: "idle" }, refreshing: false });
}

/** Forgets the last run (switching terms, tests). */
export function resetGenerateRun(): void {
  current?.cancel();
  cancelLiveRun();
  current = null;
  asked = null;
  useGenerateRun.setState(INITIAL_RUN_STATE);
}
