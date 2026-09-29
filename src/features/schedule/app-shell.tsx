import { useEffect, useState } from "react";
import type { TermId } from "~/core/schema";
import { useSeatWatchesSync } from "~/features/alerts/seat-watches";
import { usePlanHandoff } from "~/features/plan-handoff/use-plan-handoff";
import { track } from "~/lib/analytics";
import { useShortcut } from "~/lib/shortcuts";
import { deptOf, useCatalog } from "~/state/catalog-store";
import { useCatalogPolling } from "~/state/data-hooks";
import { useActiveTerm, useCurrentPlan } from "~/state/hooks";
import { saveSharedCopy, useShare } from "~/state/share-store";
import { useUi } from "~/state/ui-store";
import { useWorkspace } from "~/state/workspace-store";
import { Skeleton } from "~/ui/skeleton";
import { noteToast } from "~/ui/toast";
import { openTab, redo, undo } from "./actions";
import { CalendarRegion } from "./calendar-region";
import { CatalogError, useCatalogFailure } from "./catalog-error";
import { useDocumentTitle } from "./document-title";
import { PlanTabs } from "./plan-tabs";
import { Rail } from "./rail";
import { useScheduleNavigation } from "./schedule-nav";
import { useScheduleView } from "./schedule-view";
import { SharedPill } from "./shared-pill";
import { SidebarContent } from "./sidebar";
import { SidebarStackProvider } from "./sidebar-stack";
import { CALENDAR_MAIN_ID, SkipLinks } from "./skip-links";

/** The desktop sidebar's element, which its resize handle controls. */
const SIDEBAR_ID = "sidebar";

import {
  lazyDrawer,
  Workbench,
  WorkbenchSidebar,
} from "~/components/workbench/layout";
import { useIsMobile } from "~/hooks/use-media-query";
import { TABS } from "./tabs";
import { TermSwitcher } from "./term-switcher";
import { TopBar } from "./top-bar";
import { UndoToasts } from "./undo-toasts";

// The phone drawer (Base UI's Drawer) is its own chunk, fetched at once on phones only.
const MobileDrawer = lazyDrawer(() =>
  import("./mobile-drawer").then((m) => m?.MobileDrawer),
);

// The layout in SPEC §2, on the workbench (~/components/workbench): top bar; rail, one
// sidebar panel and a calendar that fills the rest. On phones, the same
// pieces with the sidebar in a bottom drawer. State lives in src/state;
// this file wires it to the screen.

export interface AppShellProps {
  /** `?plan=` from the URL: a shared plan to show read-only. */
  sharedParam?: string | undefined;
  /** Drops `?plan=` from the URL (Save a copy, ✕, or a bad link). */
  onClearShared?: () => void;
  /** `?from=plan`: the term Plan's "View schedule" hands over (docs/V3.md §2.12). */
  handoff?: { readonly termId: TermId | undefined } | null;
  /** Drops `?from=` once the handoff is done. */
  onHandoffDone?: () => void;
}

export function AppShell(props: AppShellProps) {
  useScheduleNavigation(useScheduleView());
  useSeatWatchesSync();
  return (
    <SidebarStackProvider>
      <Shell {...props} />
    </SidebarStackProvider>
  );
}

function Shell({
  sharedParam,
  onClearShared,
  handoff = null,
  onHandoffDone = noop,
}: AppShellProps) {
  const mobile = useIsMobile();

  useShellShortcuts();
  useDocumentTitle();
  const handingOff = usePlanHandoff(handoff, onHandoffDone);
  useDefaultPlan(Boolean(sharedParam) || handingOff);
  useTermData();
  const shared = useSharedLink(sharedParam, onClearShared, mobile);
  const failure = useCatalogFailure();
  const calendar = failure ? (
    <CatalogError message={failure} />
  ) : (
    <CalendarRegion />
  );

  const topBar = (
    <TopBar compact={mobile} term={<TermSwitcher />} plans={shared.plans} />
  );

  return (
    <Workbench
      mobile={mobile}
      before={<SkipLinks />}
      bar={topBar}
      rail={<Rail />}
      sidebar={<SchedulerSidebar />}
      drawer={<MobileDrawer />}
      canvas={calendar}
      canvasId={CALENDAR_MAIN_ID}
      after={<UndoToasts />}
    />
  );
}

/**
 * The desktop sidebar. Its width is subscribed to here, not in the shell, so
 * a drag doesn't redraw the calendar. The handle waits for the saved prefs:
 * the head script has already drawn the saved width, and the store's
 * default would flash it back first.
 */
function SchedulerSidebar() {
  const open = useUi((s) => s.sidebarOpen);
  const width = useUi((s) => (s.restored ? s.sidebarWidth : null));
  const setWidth = useUi((s) => s.setSidebarWidth);
  return (
    <WorkbenchSidebar
      id={SIDEBAR_ID}
      open={open}
      width={width}
      onWidth={setWidth}
    >
      <SidebarContent />
    </WorkbenchSidebar>
  );
}

/** `/` search, `1`–`7` tabs, ⌘Z undo, ⇧⌘Z redo. Esc lives with the sidebar. */
function useShellShortcuts() {
  useShortcut({ key: "/" }, () => {
    openTab("search", "shortcut");
    useUi.getState().requestFocus("search");
    return true;
  });
  useShortcut(
    TABS.map((t) => ({ key: t.shortcut })),
    (event) => {
      const tab = TABS.find((t) => t.shortcut === event.key);
      if (!tab) return false;
      openTab(tab.id, "shortcut");
      return true;
    },
  );
  useShortcut({ key: "z", mod: true, shift: false }, () => undo("shortcut"));
  useShortcut(
    [
      { key: "z", mod: true, shift: true },
      { key: "y", mod: true, shift: false },
    ],
    () => redo(),
  );
}

function noop() {}

/**
 * First visit (or a new term): make sure there's a plan to show. `hold`
 * waits: for a shared link, or for Plan's handoff to make the plan itself.
 */
function useDefaultPlan(hold: boolean) {
  const { termId } = useActiveTerm();
  const hydrated = useWorkspace((s) => s.hydrated);
  const sharing = useShare((s) => s.shared !== null) || hold;
  const ensurePlan = useWorkspace((s) => s.ensurePlan);
  useEffect(() => {
    // A shared link changes nothing until "Save a copy" (SPEC §3.11).
    if (hydrated && termId && !sharing) ensurePlan(termId);
  }, [hydrated, termId, sharing, ensurePlan]);
}

/**
 * Loads the catalog of the term on screen (search, fit and problems need all
 * of it; the plan's departments come first), polls it for seats, and loads
 * the campus map once the plan has somewhere to walk between.
 */
function useTermData() {
  const termId = useActiveTerm().termId;
  const reader = useCatalog((s) => s.reader);
  const ensureTerm = useCatalog((s) => s.ensureTerm);
  const ensureCampus = useCatalog((s) => s.ensureCampus);
  const current = useCurrentPlan();
  const placed = current?.plan.courses.some((c) => c.sectionCode !== null);
  const planDepts = current
    ? [...new Set(current.plan.courses.map((c) => deptOf(c.courseCode)))]
        .sort()
        .join(",")
    : "";
  useEffect(() => {
    // A shared link can name its term before the data source is ready.
    if (termId && reader)
      void ensureTerm(termId, planDepts ? planDepts.split(",") : []);
  }, [termId, reader, ensureTerm, planDepts]);
  useCatalogPolling(termId);
  useEffect(() => {
    if (placed && reader) void ensureCampus();
  }, [placed, reader, ensureCampus]);
}

/** Opens `?plan=` read-only in place of the plan tabs, and handles the pill. */
function useSharedLink(
  param: string | undefined,
  onClear: (() => void) | undefined,
  mobile: boolean,
) {
  const shared = useShare((s) => s.shared);
  const open = useShare((s) => s.open);
  const close = useShare((s) => s.close);
  const { termId } = useActiveTerm();
  const [saving, setSaving] = useState(false);
  // Saving takes fresh snapshots from the catalog, so it waits for it.
  const catalogReady = useCatalog((s) => s.termsState === "ready");

  useEffect(() => {
    if (!param) {
      close();
      return;
    }
    const result = open(param);
    track("shared_link_opened", {
      outcome: result.ok
        ? "ok"
        : result.error.kind === "malformed"
          ? "invalid"
          : "newer-version",
    });
    if (!result.ok) {
      // A link from a newer version opens once this tab is that version:
      // Reload goes back to the link, which clearing takes out of the URL.
      noteToast(result.error.message, {
        reload: result.error.kind === "newer-version" && {
          href: window.location.href,
        },
      });
      onClear?.();
    }
  }, [param, open, close, onClear]);

  const save = async () => {
    if (!shared || saving || !catalogReady) return;
    setSaving(true);
    try {
      const copy = await saveSharedCopy(shared.payload);
      track("plan_created", { source: "shared" });
      track("shared_plan_saved", { droppedSections: copy.dropped.length });
      if (copy.dropped.length > 0) {
        const list = copy.dropped.map((k) => k.replace("-", " ")).join(", ");
        // "CMSC320 0301 isn't offered anymore, so it wasn't copied."
        noteToast(
          `${list} ${copy.dropped.length === 1 ? "isn't" : "aren't"} offered anymore, so ${copy.dropped.length === 1 ? "it wasn't" : "they weren't"} copied.`,
        );
      }
      onClear?.();
    } finally {
      setSaving(false);
    }
  };

  const plans = shared ? (
    <SharedPill
      saving={saving || !catalogReady}
      onSave={() => void save()}
      onClose={() => {
        close();
        onClear?.();
      }}
    />
  ) : termId ? (
    <PlanTabs termId={termId} maxVisible={mobile ? 1 : 5} />
  ) : (
    <Skeleton className="h-4 w-16" />
  );
  return { plans };
}
