import { useRouter } from "@tanstack/react-router";
import {
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ChunkLoadError } from "~/app/panel-load-boundary";
import { useShortcut } from "~/app/shortcuts";
import { useIsMobile } from "~/app/use-media-query";
import { CanvasBar } from "~/app/workbench/canvas-bar";
import {
  lazyDrawer,
  Workbench,
  WorkbenchSidebar,
} from "~/app/workbench/layout";
import { RailButton, railHint, WorkbenchRail } from "~/app/workbench/rail";
import { SkipLinks } from "~/app/workbench/skip-links";
import { PLAN_VIEW_PATHS } from "~/core/routing/plan-location";
import {
  type DrawerSnap,
  type IsoDate,
  type PlanTab,
  SIDEBAR_WIDTH,
} from "~/core/schema";
import { changedFourYearKeys, type DocKey } from "~/core/sync";
import { newYorkClock } from "~/core/todo/list";
import { useAccount } from "~/features/auth/account-store";
import { claimAccountSync } from "~/features/prefs/synced-prefs";
import { InstallAppButton } from "~/features/pwa/install-entry";
import { SitePage } from "~/features/site/site-page";
import { readSidebarWidth } from "~/state/sidebar-width-pref";
import { PageSkeleton } from "~/ui/skeleton";
import { Board, PhoneBoard } from "./board";
import { fourYearDb, startFourYear, useDocDepts } from "./data";
import { ImportCheck, useImportRecognized } from "./import-panel";
import { resetTranscriptImport } from "./import-state";
import {
  CLOSE_DRILL,
  isDrilled,
  PlanModelProvider,
  type PlanNav,
  PlanNavProvider,
  usePlanModel,
} from "./model";
import { PlanBar } from "./plan-bar";
import {
  CreditsSummary,
  DegreeAuditNote,
  PLAN_SIDEBAR_FRAME_ID,
  PLAN_SIDEBAR_ID,
  PlanSidebarContent,
} from "./plan-sidebar";
import { PlanShare } from "./share";
import { useActiveFourYear, useFourYear } from "./store";
import { PlanToasts } from "./toasts";
import { clickRailView, openView } from "./view-nav";
import { PLAN_VIEWS, ProblemsBadge } from "./views";
import {
  INITIAL_PLAN_WORKBENCH,
  PLAN_BOARD_ID,
  usePlanWorkbench,
} from "./workbench-store";

// `/plan` (docs/V3.md §2.13): the four-year plan, local first, on the
// scheduler's workbench (src/app/workbench; docs/COHESION.md §4): the family
// bar with the plan's name, a rail of Plan's views, the open view in the
// sidebar and the semesters as the canvas. A phone shows a strip of
// semesters and one at a time, with the sidebar in the same drawer as the
// scheduler's. The first visit, with no plan yet, is a page of its own.

// The phone drawer (vaul) is its own chunk, fetched at once on phones only.
const PlanDrawer = lazyDrawer(() =>
  import("./plan-drawer").then((m) => m?.PlanDrawer),
);

// The first visit is its own chunk too, with Radix's select: someone who
// already has a plan never loads it. It's a moment, not a place (it shows
// until a plan exists, at any of Plan's URLs), so it isn't a route. A chunk
// that doesn't arrive throws to the route's error state, which reloads.
const PlanFirstVisit = lazy(() =>
  import("./first-visit").then((m) => {
    // Vite's loader resolves a failed chunk to nothing once load-recovery
    // has taken the error.
    if (!m) throw new ChunkLoadError(new Error("empty module"));
    return { default: m.PlanFirstVisit };
  }),
);

/** New York's date, for term status. */
export function useToday(): IsoDate {
  const date = newYorkClock(Date.now()).date;
  return useMemo(() => date, [date]);
}

/**
 * Syncs the four-year docs while someone is signed in (V3 §2.4), once they're
 * loaded (or read again, on coming back): a sync that started first could be
 * overwritten by that read. The engine loads with the first sign-in, so
 * signed-out visitors download none of it.
 */
function usePlanSync(ready: boolean) {
  const signedIn = useAccount((s) => s.status === "signed-in");
  const userId = useAccount((s) => s.user?.id ?? null);
  // Changes made before the engine loads (while /api/me answers and its
  // chunk arrives) are handed to it, or a synced doc's edit would never be
  // marked unsaved. Once it runs, it follows the store itself.
  const earlier = useRef(new Set<DocKey>());
  const running = useRef(false);
  // This page's plan sync carries the synced prefs: none of its own for them.
  useEffect(() => claimAccountSync(), []);
  useEffect(
    () =>
      useFourYear.subscribe((next, prev) => {
        const before = prev.history.present.docs;
        const after = next.history.present.docs;
        if (running.current || before === after) return;
        if (next.changedBy !== "person") return;
        for (const key of changedFourYearKeys(before, after))
          earlier.current.add(key);
      }),
    [],
  );
  useEffect(() => {
    if (!ready || !signedIn || !userId) return;
    let cancelled = false;
    let stop: (() => void) | undefined;
    void import("./sync").then((module) => {
      if (cancelled) return;
      running.current = true;
      const keys = [...earlier.current];
      earlier.current.clear();
      stop = module.startPlanSync(
        userId,
        () => void useAccount.getState().load(),
        keys,
      );
    });
    return () => {
      cancelled = true;
      running.current = false;
      stop?.();
    };
  }, [ready, signedIn, userId]);
}

/** ⌘Z and ⇧⌘Z, `/` Search, `1`–`5` the views, Esc closes a course. */
function Shortcuts({ nav }: { nav: PlanNav }) {
  const undo = useFourYear((s) => s.undo);
  const redo = useFourYear((s) => s.redo);
  useShortcut({ key: "z", mod: true, shift: false }, () => {
    undo();
    return true;
  });
  useShortcut({ key: "z", mod: true, shift: true }, () => {
    redo();
    return true;
  });
  useShortcut({ key: "/" }, () => {
    openView(nav, "search");
    return true;
  });
  useShortcut(
    PLAN_VIEWS.map((v) => ({ key: v.shortcut })),
    (event) => {
      const view = PLAN_VIEWS.find((v) => v.shortcut === event.key);
      if (!view) return false;
      openView(nav, view.tab);
      return true;
    },
  );
  useShortcut({ key: "Escape" }, () => {
    if (!isDrilled(nav.search)) return false;
    nav.back(CLOSE_DRILL);
    return true;
  });
  return null;
}

/**
 * A place the URL names is one you can see, as in the scheduler: a view or
 * a course a link opens starts in view, and moving to another opens a
 * collapsed sidebar and raises a resting drawer. Importing, or picking a
 * sample plan, is the task at hand, so on a phone it takes the screen.
 */
/** Lowest to highest: a move only ever raises the drawer. */
const SNAP_ORDER: readonly DrawerSnap[] = ["peek", "half", "full"];

function useWorkbenchFollowsUrl(nav: PlanNav) {
  const { tab, course, credit } = nav.search;
  const place = `${tab} ${course ?? ""} ${credit ?? ""}`;
  const last = useRef<string | null>(null);
  useEffect(() => {
    const first = last.current === null;
    const moved = last.current !== place;
    last.current = place;
    const task = tab === "import" || tab === "templates";
    const raised = task ? "full" : "half";
    if (first) {
      // Each visit starts with the sidebar open.
      usePlanWorkbench.setState({
        sidebarOpen: true,
        drawerSnap:
          tab === "gened" && !course && !credit
            ? INITIAL_PLAN_WORKBENCH.drawerSnap
            : raised,
      });
      return;
    }
    if (!moved) return;
    const ui = usePlanWorkbench.getState();
    if (!ui.sidebarOpen) ui.setSidebarOpen(true);
    if (ui.keepDrawer) usePlanWorkbench.setState({ keepDrawer: false });
    else if (SNAP_ORDER.indexOf(ui.drawerSnap) < SNAP_ORDER.indexOf(raised))
      ui.setDrawerSnap(raised);
  }, [place, tab, course, credit]);
}

function Workspace({ nav, view }: { nav: PlanNav; view: ReactNode }) {
  // biome-ignore lint/style/noNonNullAssertion: rendered only with an open doc
  const doc = useActiveFourYear()!;
  const today = useToday();
  const model = usePlanModel(doc, today, nav.search.semester);
  const mobile = useIsMobile();
  const sidebarOpen = usePlanWorkbench((s) => s.sidebarOpen);
  const sidebarWidth = usePlanWorkbench((s) => s.sidebarWidth);
  const setSidebarWidth = usePlanWorkbench((s) => s.setSidebarWidth);
  useDocDepts(doc);
  useSidebarWidth();
  useWorkbenchFollowsUrl(nav);
  const preload = usePreloadView();
  const { tab } = nav.search;
  const importing = tab === "import";
  const checking = useImportRecognized() && importing && !mobile;
  // Leaving the Import view, or Plan, forgets the paste. A resize that
  // moves the sidebar into the drawer doesn't.
  useEffect(() => {
    if (!importing) resetTranscriptImport();
  }, [importing]);
  useEffect(() => resetTranscriptImport, []);
  return (
    <PlanNavProvider value={nav}>
      <PlanModelProvider value={model}>
        <Shortcuts nav={nav} />
        <Workbench
          mobile={mobile}
          before={
            <SkipLinks
              canvasId={PLAN_BOARD_ID}
              canvasName="semesters"
              sidebarId={PLAN_SIDEBAR_ID}
              onSidebar={toSidebar}
            />
          }
          bar={
            <PlanBar
              compact={mobile}
              onOpenProblems={() => openView(nav, "problems")}
            />
          }
          rail={
            <WorkbenchRail
              label="Plan views"
              footer={<InstallAppButton side="right" />}
            >
              {PLAN_VIEWS.map((v) => (
                <RailButton
                  key={v.tab}
                  icon={v.icon}
                  label={v.label}
                  hint={railHint(v.label, {
                    current: v.tab === tab,
                    open: sidebarOpen,
                    drilled: isDrilled(nav.search),
                  })}
                  shortcut={v.shortcut}
                  current={v.tab === tab}
                  open={sidebarOpen}
                  controls={PLAN_SIDEBAR_ID}
                  onClick={() => clickRailView(nav, v.tab)}
                  onPreload={() => preload(v.tab)}
                  badge={v.tab === "problems" ? <ProblemsBadge /> : null}
                />
              ))}
            </WorkbenchRail>
          }
          sidebar={
            <WorkbenchSidebar
              id={PLAN_SIDEBAR_FRAME_ID}
              open={sidebarOpen}
              width={sidebarWidth}
              onWidth={setSidebarWidth}
            >
              <PlanSidebarContent view={view} />
            </WorkbenchSidebar>
          }
          drawer={<PlanDrawer view={view} onPreload={preload} />}
          canvas={
            <>
              {/* Share at the top left, as over the scheduler's calendar. A
                  phone has no bar: Share sits beside the credits instead,
                  so the semester below keeps its room above the drawer
                  (an add shows its course without lowering Search). */}
              {mobile ? null : (
                <CanvasBar
                  className="sticky top-0 z-10"
                  start={<PlanShare />}
                />
              )}
              {mobile ? (
                <div className="space-y-4 px-4 pt-3 pb-4">
                  <div className="flex items-start gap-3">
                    <PlanShare />
                    <div className="min-w-0 flex-1">
                      <CreditsSummary />
                    </div>
                  </div>
                  <PhoneBoard selected={model.target} />
                  <DegreeAuditNote />
                </div>
              ) : checking ? (
                // The check step, live next to the paste (V3 §2.10).
                <div className="p-3">
                  <div className="border border-hairline bg-panel">
                    <ImportCheck columns />
                  </div>
                </div>
              ) : (
                <div className="p-3">
                  <Board />
                </div>
              )}
            </>
          }
          canvasId={PLAN_BOARD_ID}
          canvasClassName="scroll-thin overflow-y-auto overscroll-y-contain"
        />
      </PlanModelProvider>
    </PlanNavProvider>
  );
}

/** Loads a view's route on intent (hover, focus, a touch), as the scheduler's rail does. */
function usePreloadView(): (tab: PlanTab) => void {
  const router = useRouter();
  return useCallback(
    (tab: PlanTab) => {
      router.preloadRoute({ to: PLAN_VIEW_PATHS[tab] }).catch(() => {});
    },
    [router],
  );
}

/** The skip link to the sidebar: opens it, or raises the drawer, then focuses it. */
function toSidebar() {
  const ui = usePlanWorkbench.getState();
  if (!ui.sidebarOpen) ui.setSidebarOpen(true);
  if (ui.drawerSnap === "peek") ui.setDrawerSnap("half");
  requestAnimationFrame(() =>
    document.getElementById(PLAN_SIDEBAR_ID)?.focus(),
  );
}

/**
 * The sidebar's saved width (the scheduler's too), read as the workbench
 * opens, and forgotten when it closes: the scheduler may change it before
 * the next visit, and a stale width here would flash before it's read.
 */
function useSidebarWidth() {
  useEffect(() => {
    const db = fourYearDb();
    let cancelled = false;
    (db ? readSidebarWidth(db) : Promise.resolve(SIDEBAR_WIDTH.default))
      .catch(() => SIDEBAR_WIDTH.default)
      .then((sidebarWidth) => {
        if (!cancelled) usePlanWorkbench.setState({ sidebarWidth });
      });
    return () => {
      cancelled = true;
      usePlanWorkbench.setState({ sidebarWidth: null });
    };
  }, []);
}

export function PlanPage({ nav, view }: { nav: PlanNav; view: ReactNode }) {
  const phase = useFourYear((s) => s.phase);
  const doc = useActiveFourYear();
  const today = useToday();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    // The course index failing doesn't stop the docs, or their sync.
    void startFourYear()
      .catch((error: unknown) => console.error(error))
      .then(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  usePlanSync(loaded && phase === "ready");
  // The toasts stay put as the page changes under them (Delete, then Undo).
  return (
    <>
      <PlanToasts />
      {doc && phase !== "loading" ? (
        <Workspace nav={nav} view={view} />
      ) : (
        // The first visit, and the moment before the plans are read, are
        // a page like Todo's front door.
        <SitePage layout="note">
          {phase === "loading" ? (
            <PageSkeleton label="Loading your four-year plans" />
          ) : (
            <Suspense
              fallback={<PageSkeleton label="Loading your four-year plans" />}
            >
              <PlanFirstVisit today={today} nav={nav} />
            </Suspense>
          )}
        </SitePage>
      )}
    </>
  );
}
