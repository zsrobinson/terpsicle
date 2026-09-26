import { useEffect } from "react";
import { toast } from "sonner";
import { useAccount } from "~/features/auth/account-store";
import { markReturning } from "~/features/marketing/returning";
import type { SyncHost } from "~/features/sync/running";
import { useSyncStatus } from "~/features/sync/status";
import { useCatalog } from "~/state/catalog-store";
import { createDexieCache } from "~/state/data-cache";
import { createDataReader, createDataSource } from "~/state/data-source";
import { TerpsicleDb } from "~/state/db";
import { demoRequested, loadDemoState } from "~/state/demo";
import { newLocalId, nowIso } from "~/state/ids";
import {
  hydrate,
  hydrateEmpty,
  type Persistence,
  startPersisting,
} from "~/state/persist";
import { startSeatAlerts, startSeatAlertsInMemory } from "~/state/seat-alerts";
import { useUi } from "~/state/ui-store";
import { useWorkspace } from "~/state/workspace-store";
import { trackCatalogEvent } from "./actions";
import { track } from "./analytics";
import { AppShell, type AppShellProps } from "./app-shell";
import { type ClientConfig, clientConfig } from "./config";
import { registerServiceWorker } from "./service-worker-registration";
import { applyThemePreference } from "./theme";

/** The app: loads local state and the catalog, then shows the shell. */
export function App(props: AppShellProps) {
  useBootstrap(clientConfig);
  return <AppShell {...props} />;
}

function useBootstrap(config: ClientConfig) {
  useEffect(() => {
    let cancelled = false;
    registerServiceWorker(config);
    let persistence: Persistence | undefined;
    let stopReturning: (() => void) | undefined;
    let stopAccount: (() => void) | undefined;
    let sync: typeof import("~/features/sync/boot") | undefined;
    const db = new TerpsicleDb();
    // Apart from plans: a broken alerts table mustn't block the schedule.
    startSeatAlerts(db).catch((error: unknown) => {
      // Closed by our own cleanup (a remount): the next mount has it.
      if (cancelled) return;
      console.error(error);
      startSeatAlertsInMemory();
    });

    void (async () => {
      try {
        await hydrate(db);
        if (cancelled) return;
        persistence = startPersisting(db, (error) => {
          console.error(error);
          toast.error(
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
        // download none of it (scripts/check-bundle.ts).
        const host: SyncHost = {
          db,
          persistence,
          workspace: useWorkspace,
          status: useSyncStatus,
          ids: { now: nowIso, newId: newLocalId },
          reloadAccount: () => void useAccount.getState().load(),
          toast: (title, description) =>
            toast(title, {
              ...(description ? { description } : {}),
              duration: 10_000,
            }),
          trackFirstSignIn: (counts) => track("sync_first_sign_in", counts),
        };
        const follow = () => {
          const { status, user } = useAccount.getState();
          if (status === "signed-in" && user)
            void import("~/features/sync/boot").then((module) => {
              // Signed out (or someone else) while it loaded.
              if (cancelled || useAccount.getState().user?.id !== user.id)
                return;
              sync = module;
              module.startSync(host, user.id);
            });
          else if (status === "signed-out") sync?.stopSync();
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
        toast.error(
          "This browser won't let Terpsicle store plans, so changes last only until you close the tab.",
          { id: "storage-open", duration: 10_000 },
        );
      }
      applyThemePreference(useUi.getState().theme);
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
      // A failure shows in place of the calendar, with a retry (catalog-error.tsx).
      await catalog.loadTerms();
    })();

    return () => {
      cancelled = true;
      stopAccount?.();
      sync?.stopSync();
      persistence?.stop();
      stopReturning?.();
      db.close();
    };
  }, [config]);
}
