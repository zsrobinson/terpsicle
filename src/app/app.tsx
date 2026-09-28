import { useEffect, useRef } from "react";
import { useAccount } from "~/features/auth/account-store";
import { markReturning } from "~/features/marketing/returning";
import {
  claimAccountSync,
  settleAccountPrefs,
  showSyncedPrefs,
} from "~/features/prefs/synced-prefs";
import type { SyncHost } from "~/features/sync/running";
import { useSyncStatus } from "~/features/sync/status";
import { termsSettled, useCatalog } from "~/state/catalog-store";
import { createDexieCache } from "~/state/data-cache";
import { createDataReader, createDataSource } from "~/state/data-source";
import { TerpsicleDb } from "~/state/db";
import { demoRequested, loadDemoState } from "~/state/demo";
import { useCurrentPlan } from "~/state/hooks";
import { newLocalId, nowIso } from "~/state/ids";
import {
  hydrate,
  hydrateEmpty,
  type Persistence,
  startPersisting,
} from "~/state/persist";
import { connectPublished } from "~/state/query/published";
import { useUi } from "~/state/ui-store";
import { useWorkspace } from "~/state/workspace-store";
import { noteToast } from "~/ui/toast";
import { trackCatalogEvent } from "./actions";
import { track } from "./analytics";
import { AppShell, type AppShellProps } from "./app-shell";
import { type ClientConfig, clientConfig } from "./config";
import { setFeedbackSources } from "./feedback-sources";
import {
  applyThemePreference,
  readThemePreference,
  subscribeThemePreference,
} from "./theme";

/** The app: loads local state and the catalog, then shows the shell. */
export function App(props: AppShellProps) {
  useBootstrap(clientConfig);
  useFeedbackSources();
  return <AppShell {...props} />;
}

/**
 * Offers the open plan (only the person's own) and the scheduler's
 * settings to feedback's "Include what I was doing".
 */
function useFeedbackSources() {
  const current = useCurrentPlan();
  const ref = useRef(current);
  ref.current = current;
  useEffect(
    () =>
      setFeedbackSources({
        plan: () => {
          const now = ref.current;
          return now && now.source === "own"
            ? { plan: now.plan, blocks: now.blocks }
            : null;
        },
        settings: () => {
          const ui = useUi.getState();
          return {
            sidebarOpen: ui.sidebarOpen,
            sidebarWidth: ui.sidebarWidth,
            themePreference: ui.theme,
            termId: ref.current?.termId ?? null,
            sharedView: ref.current?.source === "shared",
            plans: useWorkspace.getState().plans.length,
          };
        },
      }),
    [],
  );
}

function useBootstrap(config: ClientConfig) {
  useEffect(() => {
    let cancelled = false;
    useUi.setState({ restored: false });
    // This page's plan sync carries the synced prefs: none of its own for them.
    const releaseSync = claimAccountSync();
    let persistence: Persistence | undefined;
    let stopReturning: (() => void) | undefined;
    let stopAccount: (() => void) | undefined;
    let stopTheme: (() => void) | undefined;
    let sync: typeof import("~/features/sync/boot") | undefined;
    const db = new TerpsicleDb();
    // The email-token seat alerts' old local list: seat watches live on the
    // account now (V2.md §6.5).
    db.table("settings")
      .delete("seatAlerts")
      .catch(() => {});

    void (async () => {
      try {
        await hydrate(db);
        if (cancelled) return;
        persistence = startPersisting(db, (error) => {
          console.error(error);
          noteToast(
            "Couldn't save your last change. Your browser's storage may be full.",
            { id: "storage-write" },
          );
        });
        // `/` skips the marketing page once this browser holds a plan.
        markReturning(useWorkspace.getState().plans.length);
        stopReturning = useWorkspace.subscribe((next, prev) => {
          if (next.plans !== prev.plans) markReturning(next.plans.length);
        });
        // Plan sync loads only with a session, so signed-out visitors
        // download none of it (scripts/check-bundle.ts). It starts once the
        // term list has settled: a first visit's Plan A waits for a term,
        // and a device's first sign-in joins only what exists by then, so
        // starting sooner saved Plan A later with no "saved to your
        // account" toast.
        const host: SyncHost = {
          db,
          persistence,
          workspace: useWorkspace,
          status: useSyncStatus,
          ids: { now: nowIso, newId: newLocalId },
          reloadAccount: () => void useAccount.getState().load(),
          toast: (title, description) =>
            noteToast(title, description ? { description } : {}),
          trackFirstSignIn: (counts) => track("sync_first_sign_in", counts),
          showPrefs: showSyncedPrefs,
          settled: settleAccountPrefs,
        };
        const follow = () => {
          const { status, user } = useAccount.getState();
          if (status === "signed-in" && user)
            void Promise.all([
              import("~/features/sync/boot"),
              termsSettled(),
            ]).then(([module]) => {
              // Signed out (or someone else) while it loaded.
              if (cancelled || useAccount.getState().user?.id !== user.id)
                return;
              sync = module;
              module.startSync(host, user.id);
            });
          else if (status === "signed-out") sync?.stopSync(host);
        };
        follow();
        stopAccount = useAccount.subscribe((next, prev) => {
          if (next.status !== prev.status || next.user?.id !== prev.user?.id)
            follow();
        });
        if (demoRequested(window.location.search)) await loadDemoState();
      } catch (error) {
        // Closed by our own cleanup (a remount): not a storage problem.
        if (cancelled) return;
        console.error(error);
        hydrateEmpty();
        noteToast(
          "This browser won't let Terpsicle store plans, so changes last only until you close the tab.",
          { id: "storage-open" },
        );
      }
      // The theme may have changed on another page since UiPrefs were
      // saved; the store follows the saved copy from here on (theme.ts).
      const followTheme = () => {
        const theme = readThemePreference();
        if (useUi.getState().theme !== theme) useUi.getState().setTheme(theme);
      };
      followTheme();
      stopTheme = subscribeThemePreference(followTheme);
      applyThemePreference(readThemePreference());
      // The URL's term and plan are followed from here on, and a plain
      // /schedule opens the saved view: before, loading saved prefs or the
      // demo would undo them (schedule-nav.ts).
      if (!cancelled) useUi.setState({ restored: true });
    })();

    void (async () => {
      const source = await createDataSource(config);
      if (cancelled) return;
      const catalog = useCatalog.getState();
      // The same cached path in mock and live mode; the namespace keeps the
      // two apart when both run on localhost.
      catalog.setReader(createDataReader(source), {
        cache: createDexieCache(db, source.kind === "mock" ? "mock:" : ""),
        onEvent: trackCatalogEvent,
      });
      // Published data read through the query cache (Terpsicle reviews'
      // numbers so far), loaded per department on first use.
      connectPublished(source);
      // A failure shows in place of the calendar, with a retry (catalog-error.tsx).
      await catalog.loadTerms();
    })();

    return () => {
      cancelled = true;
      releaseSync();
      stopAccount?.();
      stopTheme?.();
      sync?.stopSync();
      persistence?.stop();
      stopReturning?.();
      db.close();
      // The stores outlive the page (Plan → Schedule again in the same tab):
      // until the next mount has read IndexedDB, nothing may treat them as
      // loaded, or a change made first would be overwritten by that read.
      useWorkspace.setState({ hydrated: false });
      useUi.setState({ restored: false });
    };
  }, [config]);
}
