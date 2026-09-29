import { useSyncExternalStore } from "react";

/**
 * SPEC §2: below 768px the sidebar becomes a bottom drawer. Tailwind's `md`
 * edge exactly, where the phone's tab bar and the kit's sheets start, so an
 * iPad at 768px gets the desktop layout whole, never the phone's bar without
 * its tab bar.
 */
export const MOBILE_QUERY = "(max-width: 767.98px)";

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}
