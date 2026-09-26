// The sign-in navigations (V2.md §4.2, docs/AUTH.md "The flow"). These are
// browser GETs that redirect and set cookies, so they're routed before the
// JSON API:
//
//   GET /api/auth/google?return=<path>   start: → Google (or → /signin in test mode)
//   GET /api/auth/google/callback        Google → here: check, sign in, → return
import {
  checkGoogleClaims,
  OAUTH_FLOW_TTL_MS,
  safeReturnPath,
  signInErrorPath,
  timingSafeEqualText,
  withSignedIn,
} from "~/core/auth";
import {
  type Identity,
  RETURN_PARAM,
  SIGN_IN_CALLBACK_PATH,
  type SignInError,
  TEST_SIGN_IN_PATH,
  UmdEmailSchema,
} from "~/core/schema";
import { captureServerEvent } from "../analytics";
import { apiError, clientIp } from "../api/http";
import { hit } from "../counters";
import { keyedHash } from "../crypto";
import { type AuthEnv, signInMode } from "./config";
import {
  clearCookie,
  HINT_COOKIE,
  HINT_MAX_AGE_SECONDS,
  OAUTH_COOKIE,
  readCookie,
  readFlow,
  setCookie,
  signFlow,
} from "./cookies";
import { exchangeCode, googleAuthorizeUrl } from "./google";
import { refreshPicture } from "./pictures";
import { randomSecret, s256 } from "./pkce";
import { sessionIdOf, startSession } from "./session";
import { deleteSession, getUser, upsertUser } from "./store";

export interface FlowContext {
  now: Date;
  waitUntil: (promise: Promise<unknown>) => void;
  /** Outbound fetch (Google's token endpoint, the picture); tests mock it. */
  fetch?: typeof fetch;
}

/** `/api/<name>` of the two navigations. */
export const FLOW_ROUTES = ["auth/google", "auth/google/callback"] as const;

export function isFlowRoute(name: string): boolean {
  return (FLOW_ROUTES as readonly string[]).includes(name);
}

export function handleFlow(
  request: Request,
  env: AuthEnv,
  ctx: FlowContext,
): Promise<Response> | Response {
  if (request.method !== "GET") {
    const response = apiError("method-not-allowed");
    response.headers.set("Allow", "GET");
    return response;
  }
  const name = new URL(request.url).pathname.slice("/api/".length);
  return name === "auth/google"
    ? start(request, env, ctx)
    : callback(request, env, ctx);
}

// ---------- Helpers ----------

export function redirect(
  to: string,
  base: URL,
  cookies: string[] = [],
  status: 302 | 303 = 302,
): Response {
  const headers = new Headers({
    Location: new URL(to, base.origin).toString(),
    "Cache-Control": "no-store",
    // Codes and states ride in these URLs: never pass them on as a Referer.
    "Referrer-Policy": "no-referrer",
  });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status, headers });
}

/** Per-IP hourly limit (the IP is only ever a keyed hash). */
async function overLimit(
  request: Request,
  env: AuthEnv,
  name: string,
  perHour: number,
  now: Date,
): Promise<boolean> {
  const ipHash = await keyedHash(env.DATA, clientIp(request));
  const count = await hit(env.DB, `${name}:${ipHash}`, { seconds: 3_600 }, now);
  return count > perHour;
}

function trackResult(
  env: AuthEnv,
  ctx: FlowContext,
  outcome: SignInError | "signed-in" | "sub-conflict",
  hd?: string,
): void {
  ctx.waitUntil(
    captureServerEvent(
      env,
      "signin_result",
      { outcome, ...(hd ? { hd } : {}) },
      { now: ctx.now, ...(ctx.fetch ? { fetcher: ctx.fetch } : {}) },
    ),
  );
}

/** The address this browser last signed in with, if it's still a UMD one. */
function loginHint(request: Request): string | undefined {
  const parsed = UmdEmailSchema.safeParse(readCookie(request, HINT_COOKIE));
  return parsed.success ? parsed.data.email : undefined;
}

export type SignInResult =
  | { ok: true; cookies: string[]; firstTime: boolean }
  | { ok: false; error: SignInError };

/**
 * Signs `identity` in on this host: refreshes the user row (and picture)
 * from what Google said, and mints a fresh session. Test mode signs in
 * through here too, so everything after sign-in runs the real code.
 */
export async function signIn(
  request: Request,
  env: AuthEnv,
  ctx: FlowContext,
  identity: Identity,
): Promise<SignInResult> {
  // A session this browser already had is ended, never reused (fixation).
  const previous = await sessionIdOf(request);
  if (previous) await deleteSession(env.DB, previous);
  const before = await getUser(env.DB, identity.directoryId);
  const upserted = await upsertUser(env.DB, identity, ctx.now);
  if (!upserted.ok) {
    trackResult(env, ctx, "sub-conflict");
    return { ok: false, error: "google-error" };
  }
  await refreshPicture(
    env,
    {
      id: identity.directoryId,
      pictureUrl: identity.pictureUrl,
      previousUrl: before?.picture_url ?? null,
      previousKey: before?.picture_key ?? null,
    },
    { now: ctx.now, fetch: ctx.fetch ?? fetch },
  );
  const session = await startSession(env.DB, identity.directoryId, ctx.now);
  trackResult(env, ctx, "signed-in", identity.hd);
  return {
    ok: true,
    cookies: [
      session,
      setCookie(HINT_COOKIE, identity.email, HINT_MAX_AGE_SECONDS),
    ],
    firstTime: before === null,
  };
}

// ---------- Start ----------

async function start(
  request: Request,
  env: AuthEnv,
  ctx: FlowContext,
): Promise<Response> {
  const url = new URL(request.url);
  const returnTo = safeReturnPath(url.searchParams.get(RETURN_PARAM));
  const mode = signInMode(env, url);
  if (mode.kind === "off")
    return redirect(signInErrorPath("unavailable", returnTo), url);
  if (mode.kind === "test") {
    // Test mode has no Google: /auth/test lists TEST_USERS.
    const target = new URL(TEST_SIGN_IN_PATH, url.origin);
    target.searchParams.set(RETURN_PARAM, returnTo);
    return redirect(target.toString(), url);
  }
  if (await overLimit(request, env, "auth/start", 30, ctx.now))
    return redirect(signInErrorPath("rate-limited", returnTo), url);

  const flow = {
    state: randomSecret(),
    nonce: randomSecret(),
    verifier: randomSecret(),
    return: returnTo,
    exp: Math.floor((ctx.now.getTime() + OAUTH_FLOW_TTL_MS) / 1000),
  };
  const authorize = googleAuthorizeUrl({
    clientId: mode.clientId,
    redirectUri: `${url.origin}${SIGN_IN_CALLBACK_PATH}`,
    state: flow.state,
    nonce: flow.nonce,
    codeChallenge: await s256(flow.verifier),
    loginHint: loginHint(request),
  });
  return redirect(authorize, url, [
    setCookie(
      OAUTH_COOKIE,
      await signFlow(flow, mode.authSecret),
      OAUTH_FLOW_TTL_MS / 1000,
    ),
  ]);
}

// ---------- Callback ----------

async function callback(
  request: Request,
  env: AuthEnv,
  ctx: FlowContext,
): Promise<Response> {
  const url = new URL(request.url);
  const mode = signInMode(env, url);
  if (mode.kind !== "google") return apiError("not-found");

  const cookies = [clearCookie(OAUTH_COOKIE)];
  const flow = await readFlow(request, mode.authSecret, ctx.now);
  const returnTo = safeReturnPath(flow?.return);
  const fail = (error: SignInError) => {
    trackResult(env, ctx, error);
    return redirect(signInErrorPath(error, returnTo), url, cookies);
  };

  // No valid flow cookie: it expired (10 min), was forged, or Google came
  // back to another browser than the one that started.
  if (!flow) return fail("expired");
  const state = url.searchParams.get("state") ?? "";
  if (!timingSafeEqualText(state, flow.state)) return fail("expired");

  const googleError = url.searchParams.get("error");
  if (googleError === "access_denied") return fail("cancelled");
  if (googleError) return fail("google-error");

  if (await overLimit(request, env, "auth/callback", 30, ctx.now))
    return fail("rate-limited");

  const code = url.searchParams.get("code") ?? "";
  if (!code || code.length > 2048) return fail("google-error");
  const exchanged = await exchangeCode(
    {
      code,
      codeVerifier: flow.verifier,
      clientId: mode.clientId,
      clientSecret: mode.clientSecret,
      redirectUri: `${url.origin}${SIGN_IN_CALLBACK_PATH}`,
    },
    ctx.fetch ?? fetch,
  );
  if (!exchanged.ok) {
    // The status only: Google's error body can echo the code.
    console.warn({ auth: "token-exchange", status: exchanged.status });
    return fail("google-error");
  }

  const checked = checkGoogleClaims(exchanged.claims, {
    clientId: mode.clientId,
    nonce: flow.nonce,
    now: ctx.now,
  });
  if (!checked.ok) {
    console.info({ auth: "claims", check: checked.check });
    return fail(checked.error);
  }

  const signedIn = await signIn(request, env, ctx, checked.identity);
  if (!signedIn.ok) return fail(signedIn.error);
  return redirect(
    withSignedIn(returnTo),
    url,
    [...cookies, ...signedIn.cookies],
    303,
  );
}
