import {
  type AnyRoute,
  type AnyRouter,
  useRouter,
} from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useState } from "react";
import { pickTerm } from "~/core/catalog";
import { chipParams } from "~/core/generate/url";
import {
  CONNECTION_PATH,
  COURSE_PATH,
  compactSearch,
  RESULT_PATH,
  type ScheduleLocation,
  TAB_PATHS,
} from "~/core/routing/schedule-location";
import type { DrillTarget } from "~/core/schema";
import type { CourseDetailsTab } from "~/core/schema/primitives";
import {
  GenerateTabSearchSchema,
  type ScheduleHistoryState,
  ScheduleHistoryStateSchema,
  type ScheduleSearch,
  ScheduleSearchSchema,
} from "~/core/schema/schedule-url";
import { filterParams } from "~/core/search/url";
import { useSearchStore } from "~/features/search/search-store";
import { track } from "~/lib/analytics";
import { useCatalog } from "~/state/catalog-store";
import type { DrillEntry } from "~/state/drill";
import { restorableTarget, sameDrillSubject } from "~/state/drill";
import { useGenerateDrafts } from "~/state/generate-drafts";
import { useGenerateRun } from "~/state/generate-run-store";
import { activePlanId } from "~/state/plan-ops";
import { useUi } from "~/state/ui-store";
import { useWorkspace } from "~/state/workspace-store";
import {
  routeAt,
  type ScheduleView,
  useTabSearch,
  useViewInUrl,
  viewAt,
  viewName,
} from "./schedule-view";

// Going places in the scheduler. Each tab and drill-in is a route, so a move
// is a router navigation and Back and Forward are the router's history
// (src/features/schedule/README.md, "URL state"). This file adds what the router doesn't
// know: which params a tab carries back (Search's text, Generate's results),
// the short name Back is labeled with, a base view under a link straight to
// a drill-in, and the term and open plan, which are saved app state the URL
// also carries.

let router: AnyRouter | null = null;

/** Hands the router to the non-React actions below; the scheduler's route calls it. */
export function useScheduleRouter(): AnyRouter {
  const current = useRouter();
  // In an effect, not during render: React may unmount and remount the
  // shell without rendering it again (StrictMode does, in dev), and the
  // remount must hand the router over again.
  useLayoutEffect(() => {
    router = current;
    return () => {
      if (router === current) router = null;
    };
  }, [current]);
  return current;
}

/**
 * The URL's latest location: the history's, parsed. The router's state
 * catches up once the route has loaded, a moment later.
 */
function latest(r: AnyRouter) {
  return r.parseLocation(r.history.location);
}

/** The view on screen now (or about to be), outside React. */
export function currentView(): ScheduleView {
  const location = router ? latest(router) : undefined;
  const view = router && location ? viewAt(router, location) : null;
  return view ?? { tab: useUi.getState().lastTab, drill: null };
}

/** The term on screen, once the term list is in (the shared plan's aside). */
function ownTermId(): string | null {
  const { terms } = useCatalog.getState();
  return terms
    ? (pickTerm(terms, useUi.getState().lastTermId)?.id ?? null)
    : null;
}

/** The params every scheduler URL keeps, as the current one has them. */
function currentShared(): ScheduleSearch {
  // `from` is for the page it lands on (docs/V3.md §2.12), not for later moves.
  const { from: _from, ...shared } = ScheduleSearchSchema.parse(
    router ? latest(router).search : {},
  );
  return shared;
}

function currentState(): ScheduleHistoryState {
  return ScheduleHistoryStateSchema.parse(router?.history.location.state);
}

/** Search's text and chips as last left in a term, for its tab's URL. */
function searchParams(termId: string | null) {
  const typed = termId ? useSearchStore.getState().byTerm[termId] : undefined;
  return typed
    ? {
        q: typed.query,
        ...filterParams(typed.filters),
        sort: typed.sort === "relevance" ? undefined : typed.sort,
      }
    : {};
}

/**
 * Generate's filter and preference chips as last left in a term, and its
 * results when they're this term's and last shown.
 */
function generateParams(termId: string | null) {
  const run = useGenerateRun.getState();
  const draft = termId ? useGenerateDrafts.getState().drafts[termId] : null;
  return {
    ...(draft ? chipParams(draft) : {}),
    ...(run.view === "results" &&
    run.termId === termId &&
    run.status.kind === "done"
      ? { view: "results" as const }
      : {}),
  };
}

/** Where a view is, with the params its tab carries back. */
export function locationOf(
  view: ScheduleView,
  shared: ScheduleSearch = currentShared(),
): ScheduleLocation {
  const search = compactSearch(shared);
  const { drill, tab } = view;
  if (!drill) {
    const termId = search.term ?? ownTermId();
    return {
      to: TAB_PATHS[tab],
      search: compactSearch({
        ...search,
        ...(tab === "search" ? searchParams(termId) : {}),
        ...(tab === "generate" ? generateParams(termId) : {}),
      }),
    };
  }
  switch (drill.kind) {
    case "course":
      return {
        to: COURSE_PATH,
        params: { code: drill.courseCode },
        search: { ...search, tab },
      };
    case "connection":
      return {
        to: CONNECTION_PATH,
        params: { connectionId: drill.connectionId },
        search: { ...search, tab },
      };
    case "generated-plan":
      return {
        to: RESULT_PATH,
        params: { resultId: drill.resultId },
        search: { ...search, tab },
      };
  }
}

export interface GoOptions {
  /** Replace the current entry: the app correcting itself, not a move. */
  replace?: boolean;
  /** Params to change on the way (a term, a plan). */
  shared?: Partial<ScheduleSearch>;
}

/**
 * Shows a view. A push labels the new entry's Back with the view it came
 * from ("‹ Search"); the same URL is never pushed twice.
 */
export function goTo(view: ScheduleView, options: GoOptions = {}): void {
  if (!router) return;
  const location = locationOf(view, {
    ...currentShared(),
    ...options.shared,
  });
  const detailsTab: CourseDetailsTab | undefined =
    view.drill?.kind === "course" ? view.drill.tab : undefined;
  const same =
    router.buildLocation(location as never).href ===
    router.history.location.href;
  const here = currentState();
  if (same && here.detailsTab === detailsTab) return;
  const from = viewName(currentView());
  // Plain `/schedule` names no view, so there's nothing for Back to return
  // to: the first move from it (a tab tapped before saved state loaded)
  // takes its place.
  const replace = options.replace || same || onIndex(router);
  const state: ScheduleHistoryState = replace
    ? { ...here, inApp: true, detailsTab }
    : { inApp: true, backLabel: from.label, backMono: from.mono, detailsTab };
  void router.navigate({
    ...(location as object),
    replace,
    state: (prev: object) => ({ ...prev, ...state }),
    resetScroll: false,
  } as never);
}

/**
 * Shows a drill-in view first put over its tab's own view: a link from
 * outside, or the view a plain `/schedule` reopens, so Back stays in the app.
 */
function goToWithBase(view: ScheduleView): void {
  if (!router) return;
  goTo({ tab: view.tab, drill: null }, { replace: true });
  if (!view.drill) return;
  // The history batches writes in one tick into one; the base must land.
  router.history.flush();
  goTo(view);
}

/** Starts loading a view's route (its chunk), on intent: hover, focus, a touch. */
export function preloadView(view: ScheduleView): void {
  if (!router) return;
  router.preloadRoute(locationOf(view) as never).catch(() => {});
}

const DRILL_PATHS: Record<DrillEntry["kind"], string> = {
  course: COURSE_PATH,
  connection: CONNECTION_PATH,
  "generated-plan": RESULT_PATH,
};

/**
 * Starts loading a kind of drill-in's route chunk, on intent, before there's
 * a particular one to open (hovering a travel pill).
 */
export function preloadDrill(kind: DrillEntry["kind"]): void {
  if (!router) return;
  const route = (router.routesById as unknown as Record<string, AnyRoute>)[
    DRILL_PATHS[kind]
  ];
  if (route) router.loadRouteChunk(route)?.catch(() => {});
}

/** The drill-in views the sidebar has mounted, innermost last (sidebar-stack.tsx). */
let mounted: readonly DrillEntry[] = [];
export function setMountedDrills(stack: readonly DrillEntry[]): void {
  mounted = stack;
}

/**
 * Drills into a view over the current tab, opening the sidebar. Opening
 * what's already on top does nothing, beyond a new details sub-tab.
 */
export function openDrill(entry: DrillEntry): void {
  useUi.getState().setSidebarOpen(true);
  const view = currentView();
  if (view.drill && sameDrillSubject(view.drill, entry)) {
    const tab = entry.kind === "course" ? entry.tab : undefined;
    if (tab) goTo({ tab: view.tab, drill: entry }, { replace: true });
    return;
  }
  goTo({ tab: view.tab, drill: entry });
}

/**
 * Closes the top view, showing the one under it: a new place, so it pushes
 * (Add as Plan C, a travel fix). False when already at the tab's root.
 */
export function closeDrill(): boolean {
  const view = currentView();
  if (!view.drill) return false;
  const top = mounted.at(-1);
  const under =
    top && sameDrillSubject(top, view.drill) ? (mounted.at(-2) ?? null) : null;
  goTo({ tab: view.tab, drill: under });
  return true;
}

/** Closes every view over the tab (the open course's block clicked again). */
export function closeToTab(): void {
  const view = currentView();
  if (view.drill) goTo({ tab: view.tab, drill: null });
}

/** Until then, a Back already sent to the browser hasn't landed yet. */
let backLandsBy = 0;

/**
 * Back from a drill-in (its Back button, `Esc`): the browser's own Back when
 * the entry before is one of ours, so the two are one thing and Forward
 * returns; otherwise (the app's first entry) the view closes. False when
 * there's nothing to go back from.
 */
export function goBack(): boolean {
  if (!router || !currentView().drill) return false;
  if (!currentState().backLabel || !router.history.canGoBack())
    return closeDrill();
  // A second Esc before the first lands would go back twice, maybe out of
  // the app.
  if (performance.now() < backLandsBy) return true;
  backLandsBy = performance.now() + 1000;
  router.history.back();
  return true;
}

/** Whether the current URL names a view, rather than being plain `/schedule`. */
function onIndex(r: AnyRouter): boolean {
  return routeAt(r, r.history.location.pathname).id === "/schedule/";
}

/**
 * The scheduler route's side of navigation: marks the page's first entry as
 * the app's (putting a tab under a link straight to a drill-in), opens the
 * saved view on a plain `/schedule`, drops a generated plan that's gone,
 * remembers the view for next time, and keeps the term and open plan in step
 * with the URL.
 */
export function useScheduleNavigation(view: ScheduleView): void {
  const r = useScheduleRouter();
  const restored = useUi((s) => s.restored);
  const termsKnown = useCatalog(
    (s) => s.terms !== null || s.termsState === "error",
  );
  const [deepLink, setDeepLink] = useState<string | null>(null);

  // The page's first entry.
  useEffect(() => {
    const here = ScheduleHistoryStateSchema.parse(r.history.location.state);
    const history = r.history.subscribe(() => {
      backLandsBy = 0;
    });
    if (here.inApp) return history;
    const location = latest(r);
    const shared = ScheduleSearchSchema.parse(location.search);
    if (shared.term) setDeepLink(shared.term);
    const opened = viewAt(r, location);
    // A generated plan's results aren't saved: it's dropped below instead.
    if (opened?.drill && opened.drill.kind !== "generated-plan")
      goToWithBase(opened);
    // Marked as the app's, exactly as it is: Search hasn't read its text yet.
    else if (opened)
      void r.navigate({
        to: r.history.location.pathname,
        search: (prev: object) => prev,
        replace: true,
        state: (prev: object) => ({ ...prev, inApp: true }),
        resetScroll: false,
      } as never);
    return history;
  }, [r]);

  useEffect(() => {
    if (!deepLink || !termsKnown) return;
    const { terms } = useCatalog.getState();
    track("deep_link_opened", {
      outcome: terms?.some((t) => t.id === deepLink) ? "ok" : "unknown-term",
    });
    setDeepLink(null);
  }, [deepLink, termsKnown]);

  // A plain `/schedule` opens what was saved (SPEC §3.13), once it's loaded.
  useEffect(() => {
    if (!restored || !onIndex(r)) return;
    const { lastTab, lastDrill } = useUi.getState();
    goToWithBase({ tab: lastTab, drill: lastDrill });
  }, [restored, r]);

  const drill = view.drill;
  const run = useGenerateRun((s) => s.status);
  useEffect(() => {
    if (drill?.kind !== "generated-plan") return;
    if (run.kind === "loading" || run.kind === "running") return;
    const here =
      run.kind === "done" &&
      run.result.results.some((x) => x.id === drill.resultId);
    // After a reload: results aren't saved, so the details are gone.
    if (!here) goTo({ tab: view.tab, drill: null }, { replace: true });
  }, [drill, run, view.tab]);

  // Generate's results after a reload: gone too, so the form shows.
  const generate = useTabSearch("generate");
  const results = generate
    ? GenerateTabSearchSchema.parse(generate).view === "results"
    : false;
  const runTermId = useGenerateRun((s) => s.termId);
  const termId = ScheduleSearchSchema.parse(r.state.location.search).term;
  useEffect(() => {
    if (!results || run.kind === "loading" || run.kind === "running") return;
    if (run.kind !== "done" || (termId && runTermId !== termId))
      goTo({ tab: "generate", drill: null }, { replace: true });
  }, [results, run, runTermId, termId]);

  // Saved for the next visit, once saved state can't overwrite it.
  const inUrl = useViewInUrl();
  const tab = view.tab;
  // By value: a new location with the same view isn't a change.
  const target = JSON.stringify(restorableTarget(drill));
  useEffect(() => {
    if (!restored || !inUrl) return;
    useUi.setState({
      lastTab: tab,
      lastDrill: JSON.parse(target) as DrillTarget | null,
    });
  }, [restored, inUrl, tab, target]);

  useTermAndPlanInUrl(r, restored && termsKnown);
}

/**
 * The term on screen and the open plan are saved app state (the open plan
 * per term is part of the workspace, with undo), and the URL carries them
 * too so Back returns to the last plan tab. A move through history, or a
 * link, puts the stores where the URL says; an edit that moves them (a new
 * plan, undo, a plan that's gone) replaces the URL to match.
 */
function useTermAndPlanInUrl(r: AnyRouter, ready: boolean): void {
  useEffect(() => {
    if (!ready) return;
    const urlSearch = () =>
      ScheduleSearchSchema.parse(
        r.options.parseSearch(r.history.location.search),
      );
    const onScheduler = () =>
      routeAt(r, r.history.location.pathname).id?.startsWith("/schedule") ??
      false;

    const follow = () => {
      if (!onScheduler()) return;
      const { term, planId } = urlSearch();
      const { terms } = useCatalog.getState();
      if (term && terms?.some((t) => t.id === term) && ownTermId() !== term)
        useUi.getState().setLastTermId(term);
      if (planId) {
        const w = useWorkspace.getState();
        const plan = w.plans.find((p) => p.id === planId);
        if (plan && activePlanId(w, plan.termId) !== plan.id)
          w.activatePlan(plan.termId, plan.id);
      }
    };
    const write = () => {
      if (!onScheduler()) return;
      const term = ownTermId();
      if (!term) return;
      const planId = activePlanId(useWorkspace.getState(), term);
      const now = urlSearch();
      if (now.term === term && now.planId === planId) return;
      void r.navigate({
        to: r.history.location.pathname,
        // The params every view keeps come first, as `locationOf` writes them.
        search: ({
          plan,
          demo,
          term: _term,
          planId: _planId,
          ...rest
        }: Record<string, unknown>) =>
          compactSearch({ plan, demo, term, planId, ...rest }),
        replace: true,
        state: (prev: object) => prev,
        resetScroll: false,
      } as never);
    };

    follow();
    write();
    const stops = [
      r.history.subscribe(({ action }: { action: { type: string } }) => {
        if (action.type === "PUSH" || action.type === "REPLACE") return;
        follow();
        write();
      }),
      useWorkspace.subscribe(write),
      useUi.subscribe((s, prev) => {
        if (s.lastTermId !== prev.lastTermId) write();
      }),
      useCatalog.subscribe((s, prev) => {
        if (s.terms !== prev.terms) write();
      }),
    ];
    return () => {
      for (const stop of stops) stop();
    };
  }, [r, ready]);
}
