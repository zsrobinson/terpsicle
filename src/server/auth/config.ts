// How this request signs in (docs/AUTH.md, "Configuration"). Decided per
// request because one Worker serves production, PR previews and local dev:
// production and localhost use Google; previews, `pnpm dev:mock` and e2e use
// test mode (V2.md §4.6).
import {
  type AuthVars,
  AuthVarsSchema,
  FeatureVarsSchema,
  type Flags,
} from "~/core/schema";
import { APEX_HOST } from "../apex";

/** What identity needs from the Worker's env: D1, R2 (IP hashing) and vars. */
export interface AuthEnv {
  DB: D1Database;
  DATA: R2Bucket;
  /** Cached profile pictures (pictures.ts); absent in the seat-alert harness. */
  USER_CONTENT?: R2Bucket;
  SIGN_IN_ENABLED?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_ORIGINS?: string;
  AUTH_SECRET?: string;
  AUTH_TEST_MODE?: string;
  POSTHOG_TOKEN?: string;
}

export type SignInMode =
  /** Off or not set up: the app hides sign-in; the start says "unavailable". */
  | { kind: "off" }
  | {
      kind: "google";
      clientId: string;
      clientSecret: string;
      /** Signs the `__Host-oauth` cookie. */
      authSecret: string;
    }
  /** Test mode: TEST_USERS instead of Google. */
  | { kind: "test" };

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
/** This project's PR previews: `pr-<n>-terpsicle.zsrobinson.workers.dev`. */
const PREVIEW_HOST = /^pr-[1-9][0-9]{0,5}-terpsicle\.zsrobinson\.workers\.dev$/;

export function authVars(env: AuthEnv): AuthVars {
  // Only the named vars are read; a malformed one reads as unset.
  return AuthVarsSchema.parse(env);
}

/**
 * Whether test mode is on for a request to `url`. It needs the flag **and**
 * a preview or loopback host, so it fails closed: terpsicle.com (and any
 * host we don't know) never gets it, whatever the vars say.
 */
export function isTestMode(env: AuthEnv, url: URL): boolean {
  const host = url.hostname;
  if (host === APEX_HOST || host === `www.${APEX_HOST}`) return false;
  return (
    authVars(env).AUTH_TEST_MODE === "true" &&
    (LOOPBACK.has(host) || PREVIEW_HOST.test(host))
  );
}

/** The origins Google may send people back to (GOOGLE_REDIRECT_ORIGINS). */
export function redirectOrigins(env: AuthEnv): string[] {
  return (authVars(env).GOOGLE_REDIRECT_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * The sign-in for a request to `url`. Google needs every piece: the flag,
 * the client id and secret, AUTH_SECRET, and this origin in
 * GOOGLE_REDIRECT_ORIGINS (one of the redirect URIs registered with Google).
 */
export function signInMode(env: AuthEnv, url: URL): SignInMode {
  if (isTestMode(env, url)) return { kind: "test" };
  const vars = authVars(env);
  if (
    vars.SIGN_IN_ENABLED === "true" &&
    vars.GOOGLE_CLIENT_ID &&
    vars.GOOGLE_CLIENT_SECRET &&
    vars.AUTH_SECRET &&
    redirectOrigins(env).includes(url.origin)
  )
    return {
      kind: "google",
      clientId: vars.GOOGLE_CLIENT_ID,
      clientSecret: vars.GOOGLE_CLIENT_SECRET,
      authSecret: vars.AUTH_SECRET,
    };
  return { kind: "off" };
}

/**
 * What POST /api/me tells the app is on (V2.md §4.9). Seat alerts' switch
 * belongs to src/server/alerts, so the router passes it in.
 */
export function appFlags(
  env: AuthEnv,
  url: URL,
  others: { seatAlerts: boolean },
): Flags {
  const mode = signInMode(env, url);
  const features = FeatureVarsSchema.parse(env);
  return {
    signIn: mode.kind !== "off",
    chat: features.CHAT_ENABLED,
    reviews: features.REVIEWS_ENABLED,
    seatAlerts: others.seatAlerts,
    push: features.PUSH_ENABLED,
    authTestMode: mode.kind === "test",
  };
}
