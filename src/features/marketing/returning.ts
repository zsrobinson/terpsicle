import {
  RETURNING_FLAG_KEY,
  SCHEDULE_PATH,
  STAY_PARAM,
  shouldSkipMarketing,
  wantsToStay,
} from "~/core/routing";
import { LOCAL_DB_NAME } from "~/core/schema";

// The browser's half of the rule for `/` (docs/V2.md §2; the Worker handles
// the session cookie in src/server/routing.ts). A head script on `/` checks
// the returning flag synchronously, before first paint. Without the flag
// (storage cleared, or plans from before it existed) it counts plans in
// IndexedDB, keeping the page hidden meanwhile so nobody headed to the
// scheduler sees the marketing page flash by. No Dexie on `/`: a raw count.

/** Longest the page stays hidden while IndexedDB answers (V2.md §2). */
export const RETURNING_CHECK_TIMEOUT_MS = 150;

/**
 * Calls `done` with the number of saved plans, or 0 when there's no
 * database or it can't be read. Never creates the database.
 *
 * Stringified into the head of `/`, so it must be self-contained: no
 * imports, no references to anything else in this module.
 */
export function readPlanCount(dbName: string, done: (count: number) => void) {
  let answered = false;
  const answer = (count: number) => {
    if (answered) return;
    answered = true;
    done(count);
  };
  try {
    const request = indexedDB.open(dbName);
    // No database yet: abort, so this check doesn't create an empty one.
    request.onupgradeneeded = () => request.transaction?.abort();
    request.onerror = () => answer(0);
    request.onblocked = () => answer(0);
    request.onsuccess = () => {
      const db = request.result;
      try {
        if (!db.objectStoreNames.contains("plans")) {
          db.close();
          answer(0);
          return;
        }
        const count = db
          .transaction("plans", "readonly")
          .objectStore("plans")
          .count();
        count.onsuccess = () => {
          db.close();
          answer(count.result);
        };
        count.onerror = () => {
          db.close();
          answer(0);
        };
      } catch {
        db.close();
        answer(0);
      }
    };
  } catch {
    // IndexedDB missing or blocked (some private modes).
    answer(0);
  }
}

function readFlag(): boolean {
  try {
    return window.localStorage.getItem(RETURNING_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Marks this browser as returning once it holds a plan. The scheduler calls
 * it whenever its plans change; signing out with "remove plans" clears it.
 */
export function markReturning(planCount: number): void {
  if (planCount === 0) return;
  try {
    window.localStorage.setItem(RETURNING_FLAG_KEY, "1");
  } catch {
    // Storage blocked: `/` falls back to counting plans.
  }
}

/** The same rule for a router navigation to `/` (no head script runs then). */
export async function skipMarketingInBrowser(search: string): Promise<boolean> {
  if (typeof window === "undefined" || wantsToStay(search)) return false;
  const returningFlag = readFlag();
  const decide = (planCount: number | null) =>
    shouldSkipMarketing({ hasSessionCookie: false, returningFlag, planCount });
  if (decide(null)) return true;
  if (typeof indexedDB === "undefined") return false;
  const count = await new Promise<number>((resolve) =>
    readPlanCount(LOCAL_DB_NAME, resolve),
  );
  return decide(count);
}

// Stringified into the head of `/`, so it must be self-contained.
function checkReturning(
  dbName: string,
  flagKey: string,
  stayParam: string,
  target: string,
  timeoutMs: number,
  read: typeof readPlanCount,
  decide: typeof shouldSkipMarketing,
) {
  // Once per document. TanStack's <HeadContent> runs a head script again
  // after hydration when the client's copy of its text differs from the
  // server's (the two builds print functions differently); a second run
  // would hide the page again after it had shown.
  const w = window as unknown as Record<string, unknown>;
  if (w.__terpsicleReturningCheck) return;
  w.__terpsicleReturningCheck = true;
  const root = document.documentElement;
  const check = () => {
    if (new URLSearchParams(window.location.search).has(stayParam)) return;
    let returningFlag = false;
    try {
      returningFlag = window.localStorage.getItem(flagKey) === "1";
    } catch {
      // Storage blocked: count plans instead.
    }
    // styles.css hides the body while this is set.
    root.setAttribute("data-landing", "checking");
    const go = () => window.location.replace(target + window.location.search);
    if (decide({ hasSessionCookie: false, returningFlag, planCount: null })) {
      go();
      return;
    }
    const show = () => root.removeAttribute("data-landing");
    const timer = setTimeout(show, timeoutMs);
    read(dbName, (planCount) => {
      clearTimeout(timer);
      if (!decide({ hasSessionCookie: false, returningFlag, planCount })) {
        show();
        return;
      }
      try {
        window.localStorage.setItem(flagKey, "1");
      } catch {
        // Storage blocked: the next visit counts again.
      }
      // Even past the timeout: someone with plans belongs in the scheduler.
      go();
    });
  };
  check();
  // Back from the scheduler can restore this page from the back/forward
  // cache without running scripts again; plans may have been saved since.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) check();
  });
}

/** The head script for `/` (docs/V2.md §2, rule 3). */
export const returningCheckScript = `(${checkReturning.toString()})(${[
  LOCAL_DB_NAME,
  RETURNING_FLAG_KEY,
  STAY_PARAM,
  SCHEDULE_PATH,
]
  .map((s) => JSON.stringify(s))
  .join(
    ",",
  )},${RETURNING_CHECK_TIMEOUT_MS},${readPlanCount.toString()},${shouldSkipMarketing.toString()});`;
