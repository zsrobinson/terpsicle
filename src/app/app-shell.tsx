import { useEffect, useState } from "react";
import { toast } from "sonner";
import { deptOf, useCatalog } from "~/state/catalog-store";
import { useCatalogPolling } from "~/state/data-hooks";
import { useActiveTerm, useCurrentPlan } from "~/state/hooks";
import { saveSharedCopy, useShare } from "~/state/share-store";
import { useUi } from "~/state/ui-store";
import { useWorkspace } from "~/state/workspace-store";
import { Skeleton } from "~/ui/skeleton";
import { openTab, redo, undo } from "./actions";
import { track } from "./analytics";
import { CalendarRegion } from "./calendar/calendar-region";
import { CatalogError, useCatalogFailure } from "./catalog-error";
import { MobileDrawer, PEEK_HEIGHT } from "./mobile-drawer";
import { PlanTabs } from "./plan-tabs";
import { Rail } from "./rail";
import { FeatureEffects } from "./registry";
import { SharedPill } from "./shared-pill";
import { useShortcut } from "./shortcuts";
import { SidebarContent } from "./sidebar";
import { TABS } from "./tabs";
import { TermSwitcher } from "./term-switcher";
import { ThemeToggle } from "./theme-toggle";
import { TopBar } from "./top-bar";
import { UndoToasts } from "./undo-toasts";
import { useIsMobile } from "./use-media-query";

// The layout in SPEC §2: top bar; rail, one sidebar panel and a calendar that
// fills the rest. On phones, the same pieces with the sidebar in a bottom
// drawer. State lives in src/state; this file wires it to the screen.

export interface AppShellProps {
  /** `?plan=` from the URL: a shared plan to show read-only. */
  sharedParam?: string | undefined;
  /** Drops `?plan=` from the URL (Save a copy, ✕, or a bad link). */
  onClearShared?: () => void;
}

export function AppShell({ sharedParam, onClearShared }: AppShellProps) {
  const mobile = useIsMobile();
  const sidebarOpen = useUi((s) => s.sidebarOpen);

  useShellShortcuts();
  useDefaultPlan(Boolean(sharedParam));
  useTermData();
  const shared = useSharedLink(sharedParam, onClearShared, mobile);
  const failure = useCatalogFailure();
  const calendar = failure ? (
    <CatalogError message={failure} />
  ) : (
    <CalendarRegion />
  );

  const topBar = (
    <TopBar
      compact={mobile}
      term={<TermSwitcher />}
      plans={shared.plans}
      end={mobile ? <ThemeToggle side="bottom" /> : null}
    />
  );

  if (mobile) {
    return (
      <div className="flex h-dvh flex-col bg-bg text-fg">
        {topBar}
        <main className="min-h-0 flex-1" style={{ paddingBottom: PEEK_HEIGHT }}>
          {calendar}
        </main>
        <MobileDrawer />
        <UndoToasts />
        <FeatureEffects />
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-bg text-fg">
      {topBar}
      <div className="flex min-h-0 flex-1">
        <Rail />
        <aside
          aria-label="Sidebar"
          hidden={!sidebarOpen}
          className="flex w-[360px] shrink-0 flex-col border-hairline border-r"
        >
          <SidebarContent />
        </aside>
        <main className="min-w-0 flex-1">{calendar}</main>
      </div>
      <UndoToasts />
      <FeatureEffects />
    </div>
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

/** First visit (or a new term): make sure there's a plan to show. */
function useDefaultPlan(linkInUrl: boolean) {
  const { termId } = useActiveTerm();
  const hydrated = useWorkspace((s) => s.hydrated);
  const sharing = useShare((s) => s.shared !== null) || linkInUrl;
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
      toast.error(result.error.message);
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
        toast(
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
