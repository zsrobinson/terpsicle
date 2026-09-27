import { useRouter } from "@tanstack/react-router";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useShortcut } from "~/app/shortcuts";
import { useIsMobile } from "~/app/use-media-query";
import {
  lazyDrawer,
  Workbench,
  WorkbenchSidebar,
} from "~/app/workbench/layout";
import { RailButton, railHint, WorkbenchRail } from "~/app/workbench/rail";
import { PLAN_VIEW_PATHS } from "~/core/routing/plan-location";
import type { IsoDate } from "~/core/schema";
import { SIDEBAR_WIDTH } from "~/core/schema";
import { changedFourYearKeys, type DocKey } from "~/core/sync";
import { newYorkClock } from "~/core/todo/list";
import { useAccount } from "~/features/auth/account-store";
import { InstallAppButton } from "~/features/pwa/install-entry";
import { SitePage } from "~/features/site/site-page";
import { readSidebarWidth } from "~/state/sidebar-width-pref";
import { Skeleton } from "~/ui/skeleton";
import { Board, PhoneBoard } from "./board";
import { fourYearDb, startFourYear, useDocDepts } from "./data";
import { EmptyState } from "./empty-state";
import { ImportCheck, useImportRecognized } from "./import-panel";
import { resetTranscriptImport } from "./import-state";
import {
  PlanModelProvider,
  type PlanNav,
  PlanNavProvider,
  usePlanModel,
} from "./model";
import { PlanBar } from "./plan-bar";
import {
  CreditsSummary,
  DegreeAuditNote,
  PLAN_SIDEBAR_ID,
  PlanSidebarContent,
} from "./plan-sidebar";
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

function Loading() {
  return (
    <div className="space-y-3" data-testid="plan-loading">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    </div>
  );
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
    if (!nav.search.course) return false;
    nav.back({ course: undefined });
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
function useWorkbenchFollowsUrl(nav: PlanNav) {
  const { tab, course } = nav.search;
  const place = `${tab} ${course ?? ""}`;
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
          tab === "gened" && !course
            ? INITIAL_PLAN_WORKBENCH.drawerSnap
            : raised,
      });
      return;
    }
    if (!moved) return;
    const ui = usePlanWorkbench.getState();
    if (!ui.sidebarOpen) ui.setSidebarOpen(true);
    if (ui.drawerSnap === "peek") ui.setDrawerSnap(raised);
  }, [place, tab, course]);
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
  usePreloadedViews();
  useWorkbenchFollowsUrl(nav);
  const { tab, course } = nav.search;
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
                    drilled: course !== undefined,
                  })}
                  shortcut={v.shortcut}
                  current={v.tab === tab}
                  open={sidebarOpen}
                  controls={PLAN_SIDEBAR_ID}
                  onClick={() => clickRailView(nav, v.tab)}
                  badge={v.tab === "problems" ? <ProblemsBadge /> : null}
                />
              ))}
            </WorkbenchRail>
          }
          sidebar={
            <WorkbenchSidebar
              id="plan-sidebar"
              open={sidebarOpen}
              width={sidebarWidth}
              onWidth={setSidebarWidth}
            >
              <PlanSidebarContent view={view} />
            </WorkbenchSidebar>
          }
          drawer={<PlanDrawer view={view} />}
          canvas={
            mobile ? (
              <div className="space-y-4 px-4 pt-3 pb-4">
                <CreditsSummary />
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
            )
          }
          canvasId={PLAN_BOARD_ID}
          canvasLabel="Semesters"
          canvasClassName="scroll-thin overflow-y-auto overscroll-y-contain"
        />
      </PlanModelProvider>
    </PlanNavProvider>
  );
}

/**
 * Each view is a route in its own chunk. Plan is local first, so once it
 * has loaded every view comes too, rather than on first use: a view opened
 * offline (an "Add a course" on the train) still opens.
 */
function usePreloadedViews() {
  const router = useRouter();
  useEffect(() => {
    for (const to of Object.values(PLAN_VIEW_PATHS))
      router.preloadRoute({ to }).catch(() => {});
  }, [router]);
}

/** The sidebar's saved width (the scheduler's too), once the page's database is open. */
function useSidebarWidth(loaded: boolean) {
  useEffect(() => {
    if (!loaded) return;
    const db = fourYearDb();
    let cancelled = false;
    (db ? readSidebarWidth(db) : Promise.resolve(SIDEBAR_WIDTH.default))
      .catch(() => SIDEBAR_WIDTH.default)
      .then((sidebarWidth) => {
        if (!cancelled) usePlanWorkbench.setState({ sidebarWidth });
      });
    return () => {
      cancelled = true;
    };
  }, [loaded]);
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
  useSidebarWidth(loaded);
  // The toasts stay put as the page changes under them (Delete, then Undo).
  return (
    <>
      <PlanToasts />
      {doc && phase !== "loading" ? (
        <Workspace nav={nav} view={view} />
      ) : (
        <SitePage layout="wide">
          {phase === "loading" ? (
            <Loading />
          ) : (
            <EmptyState today={today} nav={nav} />
          )}
        </SitePage>
      )}
    </>
  );
}
