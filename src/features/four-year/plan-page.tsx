import { useEffect, useMemo, useRef, useState } from "react";
import { useShortcut } from "~/app/shortcuts";
import { useMediaQuery } from "~/app/use-media-query";
import type { IsoDate } from "~/core/schema";
import { changedFourYearKeys, type DocKey } from "~/core/sync";
import { newYorkClock } from "~/core/todo/list";
import { useAccount } from "~/features/auth/account-store";
import { SitePage } from "~/features/site/site-page";
import { Skeleton } from "~/ui/skeleton";
import { Board, PhoneBoard } from "./board";
import { startFourYear, useDocDepts } from "./data";
import { EmptyState } from "./empty-state";
import { PlanHeader } from "./header";
import { ImportCheck, useImportRecognized } from "./import-panel";
import { resetTranscriptImport } from "./import-state";
import {
  PLAN_WIDE_QUERY,
  PlanModelProvider,
  type PlanNav,
  PlanNavProvider,
  usePlanModel,
} from "./model";
import { focusSearch } from "./search-panel";
import { CreditsSummary, SidePanel } from "./side-panel";
import { useActiveFourYear, useFourYear } from "./store";
import { PlanToasts } from "./toasts";

// `/plan` (docs/V3.md §2.13): the four-year plan, local first. Desktop shows
// every semester beside the side panel; a phone shows a strip of semesters
// and one at a time, with the panel under it.

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
    if (nav.search.tab !== "search" || nav.search.course)
      nav.go({ tab: "search", course: undefined });
    focusSearch();
    return true;
  });
  useShortcut({ key: "Escape" }, () => {
    if (!nav.search.course) return false;
    nav.back({ course: undefined });
    return true;
  });
  return null;
}

function Workspace({ nav }: { nav: PlanNav }) {
  // biome-ignore lint/style/noNonNullAssertion: rendered only with an open doc
  const doc = useActiveFourYear()!;
  const today = useToday();
  const model = usePlanModel(doc, today, nav.search.semester);
  const wide = useMediaQuery(PLAN_WIDE_QUERY);
  useDocDepts(doc);
  const importing = nav.search.tab === "import";
  const checking = useImportRecognized() && importing;
  // Leaving the Import tab, or Plan, forgets the paste. A resize that moves
  // the panel between layouts doesn't.
  useEffect(() => {
    if (!importing) resetTranscriptImport();
  }, [importing]);
  useEffect(() => resetTranscriptImport, []);
  return (
    <PlanNavProvider value={nav}>
      <PlanModelProvider value={model}>
        <Shortcuts nav={nav} />
        <div className="space-y-3">
          <PlanHeader />
          {wide ? (
            <div className="grid grid-cols-[320px_minmax(0,1fr)] items-start gap-4">
              <SidePanel className="sticky top-3 max-h-[calc(100dvh-24px)]" />
              {/* The check step, live next to the paste (V3 §2.10). */}
              {checking ? (
                <div className="border border-hairline bg-panel">
                  <ImportCheck columns />
                </div>
              ) : (
                <Board />
              )}
            </div>
          ) : importing || nav.search.tab === "templates" ? (
            // Importing, or picking a sample plan, is the task at hand: it
            // comes before the semesters.
            <div className="space-y-4">
              <CreditsSummary />
              <SidePanel credits={false} />
              <PhoneBoard selected={model.target} />
            </div>
          ) : (
            <div className="space-y-4">
              <CreditsSummary />
              <PhoneBoard selected={model.target} />
              <SidePanel credits={false} />
            </div>
          )}
        </div>
      </PlanModelProvider>
    </PlanNavProvider>
  );
}

export function PlanPage({ nav }: { nav: PlanNav }) {
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
  return (
    <SitePage layout="wide">
      <PlanToasts />
      {phase === "loading" ? (
        <Loading />
      ) : doc ? (
        <Workspace nav={nav} />
      ) : (
        <EmptyState today={today} nav={nav} />
      )}
    </SitePage>
  );
}
