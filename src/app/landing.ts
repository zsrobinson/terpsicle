import { LOCAL_DB_NAME } from "~/core/schema";
import { hasSavedWork, SCHEDULE_PATH } from "~/core/site";

// Who skips the marketing page at `/` (core's `landingFor`). A session cookie
// is checked by the Worker before any HTML is sent (src/server/worker.ts);
// plans saved in this browser are checked here, by a head script on `/` that
// hides the page until IndexedDB answers, so nobody with plans sees the
// marketing page flash by. No Dexie: a raw read of two tables.

/** Longest the page stays hidden if IndexedDB never answers. */
export const LANDING_CHECK_TIMEOUT_MS = 1000;

/**
 * Calls `done(true)` when this browser's plans hold saved work, and
 * `done(false)` otherwise, including when there's no database or it can't
 * be read. Never creates the database.
 *
 * Stringified into the head of `/`, so it must be self-contained: no
 * imports, no references to anything else in this module.
 */
export function readSavedWork(
  dbName: string,
  isSaved: (plans: unknown[], blocks: unknown[]) => boolean,
  done: (saved: boolean) => void,
) {
  let answered = false;
  const answer = (saved: boolean) => {
    if (answered) return;
    answered = true;
    done(saved);
  };
  try {
    const request = indexedDB.open(dbName);
    // No database yet: abort, so this check doesn't create an empty one.
    request.onupgradeneeded = () => request.transaction?.abort();
    request.onerror = () => answer(false);
    request.onblocked = () => answer(false);
    request.onsuccess = () => {
      const db = request.result;
      try {
        const names = db.objectStoreNames;
        if (!names.contains("plans") || !names.contains("blocks")) {
          db.close();
          answer(false);
          return;
        }
        const tx = db.transaction(["plans", "blocks"], "readonly");
        const plans = tx.objectStore("plans").getAll();
        const blocks = tx.objectStore("blocks").getAll();
        tx.oncomplete = () => {
          db.close();
          answer(isSaved(plans.result, blocks.result));
        };
        tx.onerror = () => {
          db.close();
          answer(false);
        };
      } catch {
        db.close();
        answer(false);
      }
    };
  } catch {
    // IndexedDB missing or blocked (some private modes).
    answer(false);
  }
}

/** Resolves `readSavedWork` for this browser (client-side navigations to `/`). */
export function savedWorkInBrowser(): Promise<boolean> {
  if (typeof indexedDB === "undefined") return Promise.resolve(false);
  return new Promise((resolve) =>
    readSavedWork(LOCAL_DB_NAME, hasSavedWork, resolve),
  );
}

// Stringified into the head of `/`, so it must be self-contained.
function checkLanding(
  dbName: string,
  target: string,
  timeoutMs: number,
  read: typeof readSavedWork,
  isSaved: typeof hasSavedWork,
) {
  const root = document.documentElement;
  const check = () => {
    // styles.css hides the body while this is set.
    root.setAttribute("data-landing", "checking");
    const show = () => root.removeAttribute("data-landing");
    const timer = setTimeout(show, timeoutMs);
    read(dbName, isSaved, (saved) => {
      clearTimeout(timer);
      if (saved) window.location.replace(target);
      else show();
    });
  };
  check();
  // Back from the scheduler can restore this page from the back/forward
  // cache without running scripts again; plans may have been saved since.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) check();
  });
}

/** The head script for `/`: straight to the scheduler if plans are saved. */
export const landingCheckScript = `(${checkLanding.toString()})(${JSON.stringify(LOCAL_DB_NAME)},${JSON.stringify(SCHEDULE_PATH)},${LANDING_CHECK_TIMEOUT_MS},${readSavedWork.toString()},${hasSavedWork.toString()});`;
