// The identity cookies. All `__Host-`: Secure, Path=/, no Domain, so only
// this exact host can set or read them (never a subdomain or a preview).
import {
  base64UrlDecodeText,
  base64UrlEncodeBytes,
  base64UrlEncodeText,
  timingSafeEqualText,
} from "~/core/auth";
import { type OAuthFlow, OAuthFlowSchema } from "~/core/schema";

export const SESSION_COOKIE = "__Host-session";
export const OAUTH_COOKIE = "__Host-oauth";
/**
 * The UMD address this browser last signed in with, passed to Google as
 * `login_hint`. A cookie rather than a query parameter so the address never
 * lands in a URL (or a request log). Removed at sign-out.
 */
export const HINT_COOKIE = "__Host-hint";
/** Browsers cap cookie lifetimes at 400 days. */
export const HINT_MAX_AGE_SECONDS = 400 * 24 * 3600;

/** One cookie's value from the request's Cookie header, or null. */
export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/**
 * A Set-Cookie value. HttpOnly (scripts never see these) and SameSite=Lax:
 * sent on top-level navigations back from Google, never on cross-site
 * subrequests or form posts.
 */
export function setCookie(
  name: string,
  value: string,
  maxAgeSeconds: number,
): string {
  return `${name}=${value}; Path=/; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearCookie(name: string): string {
  return setCookie(name, "", 0);
}

async function hmac(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

/** `base64url(JSON) + "." + base64url(HMAC-SHA-256(AUTH_SECRET, payload))`. */
export async function signFlow(
  flow: OAuthFlow,
  secret: string,
): Promise<string> {
  const payload = base64UrlEncodeText(JSON.stringify(flow));
  return `${payload}.${await hmac(secret, payload)}`;
}

/**
 * The request's flow cookie, if its signature holds and it hasn't expired;
 * null otherwise (missing, forged, stale or malformed).
 */
export async function readFlow(
  request: Request,
  secret: string,
  now: Date,
): Promise<OAuthFlow | null> {
  const raw = readCookie(request, OAUTH_COOKIE);
  if (!raw || raw.length > 4096) return null;
  const [payload, signature, ...rest] = raw.split(".");
  if (!payload || !signature || rest.length > 0) return null;
  if (!timingSafeEqualText(signature, await hmac(secret, payload))) return null;
  try {
    const flow = OAuthFlowSchema.safeParse(
      JSON.parse(base64UrlDecodeText(payload)),
    );
    if (!flow.success || flow.data.exp * 1000 <= now.getTime()) return null;
    return flow.data;
  } catch {
    return null;
  }
}
