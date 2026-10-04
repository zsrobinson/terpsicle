import { useCallback, useEffect, useState } from "react";
import { clampSidebarWidth, SIDEBAR_WIDTH } from "~/core/schema";

// The saved width of a workbench's sidebar, for the products that don't
// load the scheduler's stores (Chat's list and Todo's sidebar): resized with
// the same handle (~/components/workbench/sidebar-resize) to the one width
// every workbench shares (`UiPrefs.sidebarWidth`, ~/state/sidebar-width-pref;
// the owner, 2026-09-29: "the sidebar on the chat and todo pages should be
// adjustable just like those on the schedule and plan pages"). IndexedDB
// loads on demand so neither page's first load carries it; the head script
// has drawn the saved width already.

const widthPref = () =>
  Promise.all([
    import("~/features/prefs/save"),
    import("~/state/sidebar-width-pref"),
  ]).then(([{ prefsDb }, pref]) => ({ db: prefsDb(), ...pref }));

/** The saved width (null until read, so the handle waits for it) and a way to save one. */
export function useSidebarWidth(): [number | null, (px: number) => void] {
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    widthPref()
      .then(({ db, readSidebarWidth }) => readSidebarWidth(db))
      .catch(() => SIDEBAR_WIDTH.default)
      .then((px) => {
        if (live) setWidth(px);
      });
    return () => {
      live = false;
    };
  }, []);
  const save = useCallback((px: number) => {
    const next = clampSidebarWidth(px);
    setWidth(next);
    widthPref()
      .then(({ db, writeSidebarWidth }) => writeSidebarWidth(db, next))
      .catch(console.error);
  }, []);
  return [width, save];
}
