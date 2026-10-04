import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { SIGNED_IN_KEPT, SIGNED_IN_PARAM } from "~/core/schema";
import { track } from "~/lib/analytics";
import { setAccountQueryClient, useAccount } from "./account-store";

/** Set once this browser has signed in, for `firstOnDevice`. */
const SIGNED_IN_BEFORE_KEY = "terpsicle:signed-in-before";

/** The quiet note when signing in cancelled a pending deletion (V2.md §4.7). */
export const KEPT_ACCOUNT_NOTE = "Your account is staying";
export const KEPT_ACCOUNT_DETAIL = "Signing in cancelled its deletion.";

/**
 * Asks /api/me who's signed in, once per page load, on every route, in the
 * page's query client (./me-query). After a sign-in, strips `?signed-in=1`
 * (V2.md §4.2) and counts it; after this device's first, it's the install
 * prompt's `first-sign-in` moment (§3.4).
 */
export function AccountBoot() {
  const queryClient = useQueryClient();
  useEffect(() => {
    setAccountQueryClient(queryClient);
    void useAccount.getState().load();
    const url = new URL(window.location.href);
    const signedIn = url.searchParams.get(SIGNED_IN_PARAM);
    if (signedIn !== "1" && signedIn !== SIGNED_IN_KEPT) return;
    url.searchParams.delete(SIGNED_IN_PARAM);
    window.history.replaceState(window.history.state, "", url);
    let firstOnDevice = true;
    try {
      firstOnDevice = localStorage.getItem(SIGNED_IN_BEFORE_KEY) === null;
      localStorage.setItem(SIGNED_IN_BEFORE_KEY, "1");
    } catch {
      // Storage blocked: count it as a first sign-in.
    }
    track("signin_completed", { firstOnDevice });
    // Its code loads with the prompt's host, after the page (src/features/pwa/pwa.tsx).
    if (firstOnDevice)
      void import("~/features/pwa/install-store").then(
        (m) => m.requestInstallPromptSoon("first-sign-in"),
        () => {},
      );
    // Toasts' code loads after the page (src/routes/__root.tsx), and this
    // is on every page's first load, so it asks for it only when needed.
    if (signedIn === SIGNED_IN_KEPT)
      void import("~/ui/toast").then(
        (m) =>
          m.noteToast(KEPT_ACCOUNT_NOTE, {
            id: "account-kept",
            description: KEPT_ACCOUNT_DETAIL,
          }),
        () => {},
      );
  }, [queryClient]);
  return null;
}
