// How other routes learn who's asking (docs/AUTH.md, "Using identity in
// other routes"). Two ways:
//
// 1. JSON routes in src/server/api/router.ts declare `auth: "user"` or
//    `auth: "admin"`; the router checks the origin and session and hands the
//    handler `ctx.session.user`. Prefer this.
// 2. Anything else (a WebSocket upgrade, a Worker route outside the table):
//
//      const auth = await requireUser(request, env, now);
//      if (!auth.ok) return auth.response; // 403 wrong origin, 401 signed out
//      auth.session.user.id;               // the directory ID: users.id
//
// Both are read-only: they never refresh sessions or set cookies. Only the
// router (for table routes) and POST /api/me refresh.
import { apiError } from "../api/http";
import type { AuthEnv } from "./config";
import { getSession, type Session } from "./session";

export type Guarded =
  | { ok: true; session: Session }
  | { ok: false; response: Response };

/**
 * The signed-in person, or a response to return as is: 403 `forbidden` for
 * a cross-origin request, 401 `unauthorized` without a session.
 */
export async function requireUser(
  request: Request,
  env: AuthEnv,
  now: Date,
): Promise<Guarded> {
  if (!isSameOrigin(request))
    return { ok: false, response: apiError("forbidden") };
  const session = await getSession(request, env, now);
  if (!session) return { ok: false, response: apiError("unauthorized") };
  return { ok: true, session };
}

/**
 * An admin (config/admins.txt), or a response to return as is: 401 signed
 * out, 403 signed in but not an admin (or cross-origin).
 */
export async function requireAdmin(
  request: Request,
  env: AuthEnv,
  now: Date,
): Promise<Guarded> {
  const auth = await requireUser(request, env, now);
  if (auth.ok && !auth.session.user.isAdmin)
    return { ok: false, response: apiError("forbidden") };
  return auth;
}

/**
 * Whether a request with the session cookie came from our own pages
 * (V2.md §12): `Origin` equals the request's own origin, and
 * `Sec-Fetch-Site`, when sent, is `same-origin`. SameSite=Lax already keeps
 * the cookie off cross-site POSTs; this also refuses same-site ones from
 * other hosts. Browsers always send Origin on POST.
 */
export function isSameOrigin(request: Request): boolean {
  const site = request.headers.get("Sec-Fetch-Site");
  if (site !== null && site !== "same-origin") return false;
  return request.headers.get("Origin") === new URL(request.url).origin;
}
