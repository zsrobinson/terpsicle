import { useEffect } from "react";
import { track } from "~/app/analytics";
import { SIGNED_IN_PARAM } from "~/core/schema";
import { useAccount } from "./account-store";

/** Set once this browser has signed in, for `firstOnDevice`. */
const SIGNED_IN_BEFORE_KEY = "terpsicle:signed-in-before";

/**
 * Asks /api/me who's signed in, once per page load, on every route. After a
 * sign-in, strips `?signed-in=1` (V2.md §4.2) and counts it. Later, the
 * first-sign-in plan merge and the install prompt hook in here.
 */
export function AccountBoot() {
  useEffect(() => {
    void useAccount.getState().load();
    const url = new URL(window.location.href);
    if (url.searchParams.get(SIGNED_IN_PARAM) !== "1") return;
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
  }, []);
  return null;
}
