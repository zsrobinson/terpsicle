// Identity's JSON routes (V2.md §4.7, §4.9), registered in
// src/server/api/router.ts like every other `POST /api/<name>`:
//
//   me                  who's signed in, and what's on (refreshes the session)
//   auth/sign-out       ends this device's session
//   account/delete      schedules the account's deletion; signs out everywhere
//   auth/test-sign-in   test mode only: sign in as one of TEST_USERS
import {
  deleteAfter,
  findTestUser,
  safeReturnPath,
  withSignedIn,
} from "~/core/auth";
import type {
  AccountDeleteResult,
  MeResult,
  TestSignInResult,
} from "~/core/schema";
import { apiError, json } from "../api/http";
import { type AuthEnv, appFlags, isTestMode } from "./config";
import {
  clearCookie,
  HINT_COOKIE,
  readCookie,
  SESSION_COOKIE,
} from "./cookies";
import { type FlowContext, signIn } from "./flow";
import { isSameOrigin } from "./guard";
import { endSession, getSession, type Session, toMeUser } from "./session";
import { deleteUserSessions, markDeleting } from "./store";

export interface IdentityRouteContext extends FlowContext {
  request: Request;
  /** Set by the router for `auth: "user" | "admin"` routes. */
  session: Session | null;
}

function withCookies(response: Response, cookies: string[]): Response {
  for (const cookie of cookies) response.headers.append("Set-Cookie", cookie);
  return response;
}

/**
 * Called on every app load. Signed out, it never sets a cookie, except to
 * drop a session cookie that no longer works.
 */
export async function me(
  env: AuthEnv,
  ctx: IdentityRouteContext,
  options: { seatAlerts: boolean; todo: boolean },
): Promise<Response> {
  const flags = appFlags(env, new URL(ctx.request.url), options);
  const session = await getSession(ctx.request, env, ctx.now, {
    refresh: true,
  });
  if (!session) {
    const signedOut = json({ status: "signed-out", flags } satisfies MeResult);
    return readCookie(ctx.request, SESSION_COOKIE)
      ? withCookies(signedOut, [clearCookie(SESSION_COOKIE)])
      : signedOut;
  }
  const response = json({
    status: "signed-in",
    flags,
    user: toMeUser(session.user),
    pushPublicKey: null,
  } satisfies MeResult);
  return session.setCookie
    ? withCookies(response, [session.setCookie])
    : response;
}

/**
 * Ends this device's session. Works signed out too (a stale cookie is still
 * cleared), so it only needs the origin check. The hint cookie goes too: on
 * a shared computer, the next person shouldn't see this address at Google.
 */
export async function signOut(
  env: AuthEnv,
  ctx: IdentityRouteContext,
): Promise<Response> {
  if (!isSameOrigin(ctx.request)) return apiError("forbidden");
  const cookie = await endSession(ctx.request, env);
  return withCookies(json({ status: "signed-out" }), [
    cookie,
    clearCookie(HINT_COOKIE),
  ]);
}

/**
 * No confirmation dialog (DESIGN §5): the account is marked `deleting` and
 * purged by the daily job after a week, and every session ends now. Signing
 * in again before then keeps it (the app's Undo does exactly that).
 */
export async function deleteAccount(
  env: AuthEnv,
  ctx: IdentityRouteContext,
): Promise<Response> {
  // The router guarantees a session for `auth: "user"` routes.
  const user = ctx.session?.user;
  if (!user) return apiError("unauthorized");
  const due = deleteAfter(ctx.now);
  await markDeleting(env.DB, user.id, due);
  await deleteUserSessions(env.DB, user.id);
  return withCookies(
    json({
      status: "deleting",
      deleteAfter: due.toISOString(),
    } satisfies AccountDeleteResult),
    [clearCookie(SESSION_COOKIE), clearCookie(HINT_COOKIE)],
  );
}

/**
 * Test mode only (previews, `pnpm dev:mock`, e2e): signs in as a fixture
 * user through the same `signIn` as Google, so sessions and everything
 * after them are the real code. Anywhere else it doesn't exist.
 */
export async function testSignIn(
  env: AuthEnv,
  input: { userId: string; return?: string | undefined },
  ctx: IdentityRouteContext,
): Promise<Response> {
  if (!isTestMode(env, new URL(ctx.request.url))) return apiError("not-found");
  // It sets a session: refuse other origins (login CSRF).
  if (!isSameOrigin(ctx.request)) return apiError("forbidden");
  const user = findTestUser(input.userId);
  if (!user) return json({ status: "unknown-user" } satisfies TestSignInResult);
  const signedIn = await signIn(ctx.request, env, ctx, user.identity);
  if (!signedIn.ok) return apiError("unavailable");
  return withCookies(
    json({
      status: "signed-in",
      return: withSignedIn(safeReturnPath(input.return)),
    } satisfies TestSignInResult),
    signedIn.cookies,
  );
}
