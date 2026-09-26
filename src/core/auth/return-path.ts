import {
  RETURN_PARAM,
  SIGNED_IN_PARAM,
  SIGNIN_ERROR_PARAM,
  SIGNIN_PATH,
  type SignInError,
} from "../schema";

// Where a sign-in sends someone afterwards (`return`, V2.md §4.2). Only our
// own paths: anything else falls back, so it can't make us an open redirect.

/** Where people land when `return` is missing or not allowed. */
export const DEFAULT_RETURN = "/schedule";
export const MAX_RETURN_LENGTH = 512;

const BASE = "https://return.invalid";

/**
 * A same-origin path, or `fallback`. Rejects absolute and protocol-relative
 * URLs (`//evil.com`, `/\evil.com`), control characters, anything over 512
 * characters, and `/api/*` and `/avatars/*` (a sign-in must land on a page).
 */
export function safeReturnPath(
  raw: string | null | undefined,
  fallback = DEFAULT_RETURN,
): string {
  if (!raw || raw.length > MAX_RETURN_LENGTH) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting them is the point
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return fallback;
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;
  if (/^\/(api|avatars)(\/|$)/.test(url.pathname)) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** `/signin?error=<code>&return=<path>`: where a failed sign-in lands. */
export function signInErrorPath(error: SignInError, returnTo: string): string {
  const url = new URL(SIGNIN_PATH, BASE);
  url.searchParams.set(SIGNIN_ERROR_PARAM, error);
  url.searchParams.set(RETURN_PARAM, safeReturnPath(returnTo));
  return `${url.pathname}${url.search}`;
}

/**
 * `path` with `?signed-in=1`: the app strips it, and counts the sign-in
 * (and later runs the first-sign-in merge).
 */
export function withSignedIn(path: string): string {
  const url = new URL(safeReturnPath(path), BASE);
  url.searchParams.set(SIGNED_IN_PARAM, "1");
  return `${url.pathname}${url.search}${url.hash}`;
}

/** `/api/auth/google?return=<path>`: the link a Sign in button follows. */
export function signInStartHref(start: string, returnTo: string): string {
  const url = new URL(start, BASE);
  url.searchParams.set(RETURN_PARAM, safeReturnPath(returnTo));
  return `${url.pathname}${url.search}`;
}
