import { isUnderRoute } from "../analytics/routes";
import type { SignInError } from "../schema";

/** The accounts we take, as people read them. */
export const UMD_ACCOUNTS_WORDS = "@terpmail.umd.edu or @umd.edu";

/** The front door (V2.md §4.1): the Sign in button's tooltip and the sheet. */
export const SIGN_IN_PITCH =
  "Sign in to join your class chats. Your plans sync too.";

/**
 * The account menu's pitch on each product's pages: what signing in adds
 * there (Todo needs your ELMS calendar link next). Elsewhere, the general
 * one.
 */
const PRODUCT_PITCHES: readonly [string, string][] = [
  [
    "/schedule",
    "Sign in to keep your plans on every device and watch for a seat when a section's full.",
  ],
  ["/reviews", "Sign in to write reviews. Readers never see who wrote one."],
  ["/chat", "Sign in to join your class chats."],
  ["/plan", "Sign in to keep your four-year plan on every device."],
  [
    "/todo",
    "Sign in, then paste your ELMS calendar link to see every deadline in one list.",
  ],
];

/** The sign-in pitch for the page at `pathname`. */
export function signInPitch(pathname: string): string {
  return (
    PRODUCT_PITCHES.find(([route]) => isUnderRoute(pathname, route))?.[1] ??
    SIGN_IN_PITCH
  );
}

/** What `/signin` says after a sign-in that didn't finish (V2.md §4.2). */
export function signInErrorMessage(error: SignInError): string {
  switch (error) {
    case "personal-account":
      return `That's a personal Google account. Choose your ${UMD_ACCOUNTS_WORDS} account.`;
    case "other-domain":
      return `Terpsicle is for UMD accounts. Choose your ${UMD_ACCOUNTS_WORDS} account.`;
    case "unverified-email":
      return "Google hasn't verified that email address yet. Try again once it's verified.";
    case "cancelled":
      return "You cancelled signing in. Your plans are still here.";
    case "expired":
      return "That sign-in took too long. Try again.";
    case "google-error":
      return "Google didn't finish signing you in. Try again in a minute.";
    case "unavailable":
      return "Signing in is turned off right now.";
    case "rate-limited":
      return "Too many sign-ins from this network. Wait a few minutes, then try again.";
  }
}
