// Sessions (V2.md §4.3): an opaque `__Host-session` token in the browser,
// only its SHA-256 in D1. Set only at sign-in, refreshed at most daily with
// a new token, removed at sign-out.
import {
  replacedExpiresAt,
  SESSION_TTL_MS,
  sessionExpiresAt,
  sessionState,
} from "~/core/auth";
import { type MeUser, TokenSchema, type UserRow } from "~/core/schema";
import { randomToken, sha256Hex } from "../crypto";
import { isAdmin } from "./admin";
import { type AuthEnv, isTestMode } from "./config";
import { clearCookie, readCookie, SESSION_COOKIE, setCookie } from "./cookies";
import {
  deleteSession,
  findSession,
  insertSession,
  retireSession,
} from "./store";

/** The signed-in person, as server routes see them. */
export interface AuthUser {
  /** The directory ID: `users.id`, which other tables reference. */
  id: string;
  email: string;
  hd: UserRow["hd"];
  name: string;
  /** Our cached copy of their Google picture (/avatars/…), or null. */
  avatarUrl: string | null;
  isAdmin: boolean;
  createdAt: string;
  /** Admin blocks (V2.md §10); null when none. */
  chatBlockedUntil: string | null;
  reviewsBlockedUntil: string | null;
}

export interface Session {
  user: AuthUser;
  /** The session's hashed token (to sign out this device). */
  sessionId: string;
  /** A replacement session cookie to send back, after a daily refresh. */
  setCookie?: string;
}

/** Starts a session for `userId`; returns the Set-Cookie header value. */
export async function startSession(
  db: D1Database,
  userId: string,
  now: Date,
): Promise<string> {
  const token = randomToken(32);
  const at = now.toISOString();
  await insertSession(db, {
    id_hash: await sha256Hex(token),
    user_id: userId,
    created_at: at,
    last_seen_at: at,
    expires_at: sessionExpiresAt(now).toISOString(),
  });
  return setCookie(SESSION_COOKIE, token, SESSION_TTL_MS / 1000);
}

/** The session token's hash from the cookie, if it's well formed. */
export async function sessionIdOf(request: Request): Promise<string | null> {
  const token = TokenSchema.safeParse(readCookie(request, SESSION_COOKIE));
  return token.success ? sha256Hex(token.data) : null;
}

/** The same-origin URL of a cached picture: its USER_CONTENT key (pictures.ts). */
export function avatarUrl(key: string | null): string | null {
  return key ? `/${key}` : null;
}

export function toAuthUser(
  user: UserRow,
  options: { authTestMode: boolean },
): AuthUser {
  return {
    id: user.id,
    email: user.email,
    hd: user.hd,
    name: user.name,
    avatarUrl: avatarUrl(user.picture_key),
    isAdmin: isAdmin(user.id, options),
    createdAt: user.created_at,
    chatBlockedUntil: user.chat_blocked_until,
    reviewsBlockedUntil: user.reviews_blocked_until,
  };
}

/** What POST /api/me shows (V2.md §4.9). */
export function toMeUser(user: AuthUser): MeUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt,
  };
}

/**
 * The request's session, or null (no cookie, unknown, expired, or the
 * account is being deleted). With `refresh`, a session last seen over a day
 * ago gets a new token and 30 more days; the old token keeps working for a
 * minute so a tab racing this one isn't signed out.
 */
export async function getSession(
  request: Request,
  env: AuthEnv,
  now: Date,
  options: { refresh?: boolean } = {},
): Promise<Session | null> {
  const sessionId = await sessionIdOf(request);
  if (!sessionId) return null;
  const found = await findSession(env.DB, sessionId);
  if (!found) return null;
  const { session, user } = found;
  const state = sessionState(
    {
      lastSeenAt: new Date(session.last_seen_at),
      expiresAt: new Date(session.expires_at),
    },
    now,
  );
  if (state === "expired") {
    await deleteSession(env.DB, sessionId);
    return null;
  }
  const authUser = toAuthUser(user, {
    authTestMode: isTestMode(env, new URL(request.url)),
  });
  if (state === "refresh" && options.refresh) {
    const won = await retireSession(
      env.DB,
      sessionId,
      session.last_seen_at,
      now,
      replacedExpiresAt(new Date(session.expires_at), now),
    );
    if (won)
      return {
        user: authUser,
        sessionId,
        setCookie: await startSession(env.DB, user.id, now),
      };
  }
  return { user: authUser, sessionId };
}

/** Ends the request's session (if any); returns the cookie that clears it. */
export async function endSession(
  request: Request,
  env: AuthEnv,
): Promise<string> {
  const sessionId = await sessionIdOf(request);
  if (sessionId) await deleteSession(env.DB, sessionId);
  return clearCookie(SESSION_COOKIE);
}
