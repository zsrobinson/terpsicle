import { type HistoryLocation, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { pickTerm } from "~/core/catalog";
import { SCHEDULE_PATH } from "~/core/routing";
import { historyMode, urlSearch } from "~/core/routing/history";
import {
  type ScheduleHistoryState,
  ScheduleHistoryStateSchema,
  type ScheduleSearch,
  type ScheduleSearchInput,
  ScheduleSearchSchema,
} from "~/core/schema";
import { filterParams, filtersFromParams, sameFilters } from "~/core/search";
import { useGenerateRun } from "~/features/generate/run-store";
import { useSearchStore } from "~/features/search/search-store";
import { useCatalog } from "~/state/catalog-store";
import type { DrillEntry } from "~/state/drill";
import { activePlanId } from "~/state/plan-ops";
import { type UrlTarget, useUi } from "~/state/ui-store";
import { useWorkspace } from "~/state/workspace-store";
import { backLanded, setHistoryBack } from "./actions";
import { track } from "./analytics";
import { featureRegistry } from "./registry";
import { monoFor, nameFor } from "./sidebar";
import { tabById } from "./tabs";

// Where you are in the scheduler lives in its URL too (src/app/README.md,
// "URL state"), so Back and Forward, a reload and a copied link all land on
// the same view. The stores stay the app's source: a change to them is
// written to the URL, pushing a history entry when someone went somewhere
// (`navSeq`) and replacing it otherwise; a move through history (Back,
// Forward, a link) is followed back into them.

type Router = ReturnType<typeof useRouter>;

/** What the router's history tells its subscribers. */
interface HistoryChange {
  location: HistoryLocation;
  action:
    | { type: "PUSH" | "REPLACE" | "BACK" | "FORWARD" }
    | { type: "GO"; index: number };
}

/** Binds the URL once local state and the term list are in. */
export function useScheduleUrl(): void {
  const router = useRouter();
  const restored = useUi((s) => s.restored);
  const termsKnown = useCatalog(
    (s) => s.terms !== null || s.termsState === "error",
  );
  // Once bound, stay bound: a retried term load mustn't start over.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (restored && termsKnown) setReady(true);
  }, [restored, termsKnown]);
  useEffect(
    () => (ready ? bindScheduleUrl(router) : undefined),
    [ready, router],
  );
}

/**
 * Follows the URL the page opened on, writes the view back as the URL, then
 * keeps the two in step until the returned function stops it.
 */
export function bindScheduleUrl(router: Router): () => void {
  let writing = false;
  let scheduled = false;
  let seenNav = useUi.getState().navSeq;

  const write = (
    search: ScheduleSearchInput,
    mode: "push" | "replace",
    state: ScheduleHistoryState,
  ) => {
    writing = true;
    try {
      void router.navigate({
        to: SCHEDULE_PATH,
        search: urlSearch(search),
        replace: mode === "replace",
        // The router keeps its own keys in the state; ours go alongside.
        state: (prev) => ({ ...prev, ...state }),
        resetScroll: false,
      });
    } finally {
      writing = false;
    }
  };

  const flush = () => {
    scheduled = false;
    const location = router.history.location;
    if (location.pathname !== SCHEDULE_PATH) return;
    const current = parseSearch(router, location.search);
    const next = desiredSearch(current);
    const navSeq = useUi.getState().navSeq;
    const mode = historyMode(current, next, navSeq !== seenNav);
    seenNav = navSeq;
    if (mode === "none") return;
    if (mode === "replace") {
      write(next, "replace", {
        ...historyStateOf(location.state),
        inApp: true,
      });
      return;
    }
    const from = viewName(current);
    write(next, "push", {
      inApp: true,
      backLabel: from.label,
      backMono: from.mono,
    });
    useUi.setState({ historyBack: from });
  };
  const schedule = () => {
    if (scheduled || writing) return;
    scheduled = true;
    queueMicrotask(flush);
  };

  // The page's first entry.
  const start = router.history.location;
  const opened = parseSearch(router, start.search);
  const here = historyStateOf(start.state);
  const arrived = !here.inApp;
  follow(opened, "other");
  if (arrived && opened.term && !opened.tab) trackDeepLink(opened);
  const next = desiredSearch(opened);
  if (arrived && useUi.getState().stack.length > 0) {
    // A link straight to a course: put the view it opens over first, so
    // Back goes there rather than out of the app.
    const base = { ...next, course: undefined, connection: undefined };
    const from = viewName(urlSearch({ ...base, result: undefined }));
    write({ ...base, result: undefined }, "replace", { inApp: true });
    router.history.flush();
    write(next, "push", {
      inApp: true,
      backLabel: from.label,
      backMono: from.mono,
    });
  } else {
    write(next, "replace", { ...here, inApp: true });
  }
  showHistoryBack(router.history.location.state);
  setHistoryBack(() => router.history.back());
  seenNav = useUi.getState().navSeq;

  const stopStores = [
    useUi.subscribe(schedule),
    useWorkspace.subscribe(schedule),
    useSearchStore.subscribe(schedule),
    useGenerateRun.subscribe(schedule),
  ];
  const stopHistory = router.history.subscribe(
    ({ location, action }: HistoryChange) => {
      if (writing || location.pathname !== SCHEDULE_PATH) return;
      backLanded();
      const direction: UrlTarget["direction"] =
        action.type === "BACK"
          ? "back"
          : action.type === "FORWARD"
            ? "forward"
            : action.type === "GO"
              ? action.index < 0
                ? "back"
                : "forward"
              : "other";
      follow(parseSearch(router, location.search), direction);
      showHistoryBack(location.state);
      // Following never counts as a move: whatever it corrects replaces.
      seenNav = useUi.getState().navSeq;
      schedule();
    },
  );

  return () => {
    for (const stop of stopStores) stop();
    stopHistory();
    setHistoryBack(null);
    useUi.setState({ historyBack: null });
  };
}

function parseSearch(router: Router, searchStr: string): ScheduleSearch {
  return ScheduleSearchSchema.parse(router.options.parseSearch(searchStr));
}

function historyStateOf(state: unknown): ScheduleHistoryState {
  return ScheduleHistoryStateSchema.parse(state);
}

/** Labels the sidebar's Back with the entry before this one, when it's ours. */
function showHistoryBack(state: unknown): void {
  const { backLabel, backMono } = historyStateOf(state);
  const next = backLabel ? { label: backLabel, mono: backMono ?? false } : null;
  const shown = useUi.getState().historyBack;
  if (shown?.label !== next?.label || shown?.mono !== next?.mono)
    useUi.setState({ historyBack: next });
}

/** The view a URL shows, by its short name: "Search", "CMSC351", "Option 3". */
export function viewName(search: ScheduleSearch): {
  label: string;
  mono: boolean;
} {
  const drill = drillOf(search, { anyResult: true });
  if (drill)
    return {
      label: nameFor(featureRegistry, drill),
      mono: monoFor(featureRegistry, drill),
    };
  return { label: tabById(search.tab ?? "courses").label, mono: false };
}

/** The drill-in a URL names. A generated plan counts only while its run is here. */
function drillOf(
  search: ScheduleSearch,
  { anyResult = false }: { anyResult?: boolean } = {},
): DrillEntry | null {
  if (search.course) return { kind: "course", courseCode: search.course };
  if (search.connection)
    return { kind: "connection", connectionId: search.connection };
  if (search.result && (anyResult || resultExists(search.result)))
    return { kind: "generated-plan", resultId: search.result };
  return null;
}

function resultExists(resultId: string): boolean {
  const { status } = useGenerateRun.getState();
  return (
    status.kind === "done" &&
    status.result.results.some((r) => r.id === resultId)
  );
}

/** The term on screen, once the term list is in (the shared plan's aside). */
function ownTermId(lastTermId = useUi.getState().lastTermId): string | null {
  const { terms } = useCatalog.getState();
  return terms ? (pickTerm(terms, lastTermId)?.id ?? null) : null;
}

/** The URL for what's on screen now. `current` supplies what the stores don't know. */
export function desiredSearch(current: ScheduleSearch): ScheduleSearchInput {
  const ui = useUi.getState();
  const termId = ownTermId();
  const top = ui.stack.at(-1);
  const typed =
    ui.tab === "search" && termId
      ? useSearchStore.getState().byTerm[termId]
      : undefined;
  const run = useGenerateRun.getState();
  const results =
    ui.tab === "generate" &&
    run.view === "results" &&
    run.termId === termId &&
    run.status.kind === "done";
  return {
    // Not the stores': the shared link and the demo switch stay as opened.
    plan: current.plan,
    demo: current.demo,
    term: termId ?? current.term,
    planId: termId
      ? activePlanId(useWorkspace.getState(), termId)
      : current.planId,
    tab: ui.tab,
    course: top?.kind === "course" ? top.courseCode : undefined,
    connection: top?.kind === "connection" ? top.connectionId : undefined,
    result: top?.kind === "generated-plan" ? top.resultId : undefined,
    view: results ? "results" : undefined,
    q: typed?.query,
    ...(typed ? filterParams(typed.filters) : {}),
  };
}

/**
 * Shows what a URL says. Links from outside name only some of it
 * (`?term=&course=` from a seat-alert email): what they leave out stays as
 * it was. The app's own URLs always name the tab, and say everything.
 */
export function follow(
  search: ScheduleSearch,
  direction: UrlTarget["direction"],
): void {
  const ui = useUi.getState();
  const { terms } = useCatalog.getState();
  const own = search.tab !== undefined;
  const drill = drillOf(search);

  let lastTermId = ui.lastTermId;
  if (
    search.term &&
    terms?.some((t) => t.id === search.term) &&
    ownTermId() !== search.term
  )
    lastTermId = search.term;

  if (search.planId) {
    const w = useWorkspace.getState();
    const plan = w.plans.find((p) => p.id === search.planId);
    if (plan && activePlanId(w, plan.termId) !== plan.id)
      w.activatePlan(plan.termId, plan.id);
  }

  if (own || drill || lastTermId !== ui.lastTermId)
    ui.followUrl({
      // A course link without a tab opens over Courses, as it always has.
      tab: search.tab ?? (drill ? "courses" : ui.tab),
      drill,
      lastTermId,
      direction,
    });
  if (!own) return;

  const termId = ownTermId(lastTermId);
  if (search.tab === "search" && termId) {
    const store = useSearchStore.getState();
    const now = store.byTerm[termId] ?? {
      query: "",
      filters: filtersFromParams({}),
    };
    const query = search.q ?? "";
    const filters = filtersFromParams(search);
    if (now.query !== query || !sameFilters(now.filters, filters))
      useSearchStore.setState({
        byTerm: { ...store.byTerm, [termId]: { query, filters } },
      });
  }
  if (search.tab === "generate") {
    const view = search.view ?? "form";
    if (useGenerateRun.getState().view !== view)
      useGenerateRun.setState({ view });
  }
}

function trackDeepLink(search: ScheduleSearch): void {
  const { terms } = useCatalog.getState();
  track("deep_link_opened", {
    outcome: terms?.some((t) => t.id === search.term) ? "ok" : "unknown-term",
  });
}
