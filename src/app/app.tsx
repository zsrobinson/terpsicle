import { useEffect } from "react";
import { toast } from "sonner";
import { useCatalog } from "~/state/catalog-store";
import { createDataReader, createDataSource } from "~/state/data-source";
import { TerpsicleDb } from "~/state/db";
import { demoRequested, loadDemoState } from "~/state/demo";
import {
  hydrate,
  hydrateEmpty,
  type Persistence,
  startPersisting,
} from "~/state/persist";
import { startSeatAlerts, startSeatAlertsInMemory } from "~/state/seat-alerts";
import { useUi } from "~/state/ui-store";
import { AppShell, type AppShellProps } from "./app-shell";
import { type ClientConfig, clientConfig } from "./config";
import { applyThemePreference } from "./theme";

/** The app: loads local state and the catalog, then shows the shell. */
export function App(props: AppShellProps) {
  useBootstrap(clientConfig);
  return <AppShell {...props} />;
}

function useBootstrap(config: ClientConfig) {
  useEffect(() => {
    let cancelled = false;
    let persistence: Persistence | undefined;
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
      catalog.setReader(createDataReader(source));
      await catalog.loadTerms();
      const error = useCatalog.getState().termsError;
      if (error && !cancelled) toast.error(error, { id: "terms" });
    })();

    return () => {
      cancelled = true;
      persistence?.stop();
      db.close();
    };
  }, [config]);
}
