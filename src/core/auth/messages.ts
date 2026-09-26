import type { SignInError } from "../schema";

/** The accounts we take, as people read them. */
export const UMD_ACCOUNTS_WORDS = "@terpmail.umd.edu or @umd.edu";

/** The front door (V2.md §4.1): the Sign in button's tooltip and the sheet. */
export const SIGN_IN_PITCH =
  "Sign in to join your class chats. Your plans sync too.";

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
