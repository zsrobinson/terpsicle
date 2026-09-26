// Profile pictures (docs/AUTH.md, "Pictures"; V2.md §4.5). At sign-in the
// Worker copies the Google picture into R2 (USER_CONTENT), and the app shows
// only that copy, from /avatars/<userId>/<hash16>.<ext>, to signed-in
// people. Why not hot-link lh3.googleusercontent.com:
// - Google would see every viewer's IP each time a picture is shown (Chat
//   shows many);
// - Google's picture URLs change, and an old one stops working;
// - pictures stay same-origin, so the CSP keeps `img-src 'self'`.
// Previews use their own bucket (terpsicle-user-content-preview).
import {
  AVATAR_EXTENSIONS,
  AvatarContentTypeSchema,
  AvatarKeySchema,
  PictureUrlSchema,
} from "~/core/schema";
import { apiError } from "../api/http";
import type { AuthEnv } from "./config";
import { getSession } from "./session";
import { setPictureKey } from "./store";

export const AVATARS_PREFIX = "/avatars/";
/** Larger than any real 96 px picture; anything bigger isn't one. */
export const MAX_PICTURE_BYTES = 200 * 1024;
const FETCH_TIMEOUT_MS = 3_000;

/** Every object of one person's pictures lives under this prefix. */
export const avatarPrefix = (userId: string) => `avatars/${userId}/`;

/**
 * Google's picture URL at 96 px: its size suffix (`=s96-c`, `=s192-c`, …)
 * replaced, or added.
 */
export function pictureAt96(url: string): string {
  return `${url.replace(/=s\d+(-c)?$/, "")}=s96-c`;
}

/** Deletes every picture object of `userId` except `keep`. */
export async function deletePictures(
  bucket: R2Bucket,
  userId: string,
  keep: string | null = null,
): Promise<void> {
  const listed = await bucket.list({ prefix: avatarPrefix(userId) });
  const stale = listed.objects.map((o) => o.key).filter((k) => k !== keep);
  if (stale.length > 0) await bucket.delete(stale);
}

/**
 * Keeps our copy of the Google picture current. Fetched when Google's URL
 * changed since `previousUrl` or there's no copy yet; null (no picture)
 * removes the copy. A failed fetch keeps the last good copy: a sign-in never
 * fails because of a picture. Without a USER_CONTENT bucket (the seat-alert
 * harness), people get initials.
 */
export async function refreshPicture(
  env: AuthEnv,
  user: {
    id: string;
    pictureUrl: string | null;
    previousUrl: string | null;
    previousKey: string | null;
  },
  options: { now: Date; fetch: typeof fetch },
): Promise<void> {
  const bucket = env.USER_CONTENT;
  if (!bucket) return;
  if (user.pictureUrl === null) {
    if (user.previousKey) {
      await deletePictures(bucket, user.id);
      await setPictureKey(env.DB, user.id, null);
    }
    return;
  }
  if (user.previousKey && user.pictureUrl === user.previousUrl) return;
  const url = PictureUrlSchema.safeParse(user.pictureUrl);
  if (!url.success) return;
  try {
    const response = await options.fetch(pictureAt96(url.data), {
      headers: { Accept: Object.keys(AVATAR_EXTENSIONS).join(", ") },
      redirect: "error",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const type = AvatarContentTypeSchema.safeParse(
      response.headers.get("Content-Type")?.split(";")[0]?.trim(),
    );
    const length = Number(response.headers.get("Content-Length") ?? "0");
    if (!response.ok || !type.success || length > MAX_PICTURE_BYTES) {
      await response.body?.cancel();
      console.warn({ auth: "picture", status: response.status });
      return;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_PICTURE_BYTES) return;
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const hash = Array.from(digest.slice(0, 8), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    const key = `${avatarPrefix(user.id)}${hash}.${AVATAR_EXTENSIONS[type.data]}`;
    await bucket.put(key, bytes, {
      httpMetadata: { contentType: type.data },
    });
    await setPictureKey(env.DB, user.id, key);
    // The old copy goes once nothing points at it.
    await deletePictures(bucket, user.id, key);
  } catch (error) {
    // The error's name only: messages can carry the URL.
    console.warn({
      auth: "picture",
      error: error instanceof Error ? error.name : "unknown",
    });
  }
}

/**
 * GET /avatars/<userId>/<hash16>.<ext>: a cached picture, to signed-in
 * people only. An <img> is same-origin, so it carries the session cookie,
 * but sends no Origin header: this checks the session alone (a GET changes
 * nothing). The key names the content, so browsers keep it for a day
 * without asking.
 */
export async function serveAvatar(
  request: Request,
  env: AuthEnv,
  now: Date,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    const response = apiError("method-not-allowed");
    response.headers.set("Allow", "GET, HEAD");
    return response;
  }
  const key = AvatarKeySchema.safeParse(new URL(request.url).pathname.slice(1));
  if (!key.success || !env.USER_CONTENT) return apiError("not-found");
  if (!(await getSession(request, env, now))) return apiError("unauthorized");
  const object = await env.USER_CONTENT.get(key.data);
  const type = AvatarContentTypeSchema.safeParse(
    object?.httpMetadata?.contentType,
  );
  if (!object || !type.success) return apiError("not-found");
  return new Response(request.method === "HEAD" ? null : object.body, {
    headers: {
      "Content-Type": type.data,
      "Content-Length": String(object.size),
      "Cache-Control": "private, max-age=86400, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
