import { useEffect, useMemo } from "react";
import { useShortcut } from "~/app/shortcuts";
import { useMediaQuery } from "~/app/use-media-query";
import type { IsoDate } from "~/core/schema";
import { newYorkClock } from "~/core/todo/list";
import { SitePage } from "~/features/site/site-page";
import { Skeleton } from "~/ui/skeleton";
import { Board, PhoneBoard } from "./board";
import { startFourYear, useDocDepts } from "./data";
import { EmptyState } from "./empty-state";
import { PlanHeader } from "./header";
import {
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

/** Where the side panel sits beside the semesters, rather than under them. */
export const PLAN_WIDE_QUERY = "(min-width: 1024px)";

/** New York's date, for term status. */
export function useToday(): IsoDate {
  const date = newYorkClock(Date.now()).date;
  return useMemo(() => date, [date]);
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
    nav.go({ course: undefined });
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
  return (
    <PlanNavProvider value={nav}>
      <PlanModelProvider value={model}>
        <Shortcuts nav={nav} />
        <div className="space-y-3">
          <PlanHeader />
          {wide ? (
            <div className="grid grid-cols-[320px_minmax(0,1fr)] items-start gap-4">
              <SidePanel className="sticky top-3 max-h-[calc(100dvh-24px)]" />
              <Board />
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
  useEffect(() => {
    void startFourYear();
  }, []);
  return (
    <SitePage layout="wide">
      <PlanToasts />
      {phase === "loading" ? (
        <Loading />
      ) : doc ? (
        <Workspace nav={nav} />
      ) : (
        <EmptyState today={today} />
      )}
    </SitePage>
  );
}
