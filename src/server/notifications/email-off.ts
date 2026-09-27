// The one-click "turn off these emails" link (RFC 8058) in notification
// emails (V2.md §6.5, §6.6): `POST /api/notifications/email-off?u&t&k`
// turns off that type's email channel for that person. Seat alert emails
// keep their own link that stops the watch (alerts/one-click); the chat
// digest uses this one.
import { withChannel } from "~/core/notifications";
import {
  type NotificationType,
  NotificationTypeSchema,
} from "~/core/schema/notifications";
import { hit } from "../counters";
import { keyedHash } from "../crypto";
import { readSettings, writeSettings } from "./store";

/** The path mail providers POST to, outside the JSON route table. */
export const EMAIL_OFF_ROUTE = "notifications/email-off";

/** One-click posts per IP per hour (mail providers call these). */
const EMAIL_OFF_PER_IP_PER_HOUR = 60;

const subject = (userId: string, type: NotificationType) =>
  `email-off:${userId}:${type}`;

/**
 * A link that turns off one type's email for one person, signed with the
 * Worker's own HMAC key (`keyedHash`, kept in R2), so it can't be forged
 * for someone else.
 */
export async function emailOffUrl(
  bucket: R2Bucket,
  origin: string,
  userId: string,
  type: NotificationType,
): Promise<string> {
  const params = new URLSearchParams({
    u: userId,
    t: type,
    k: await keyedHash(bucket, subject(userId, type)),
  });
  return `${origin}/api/${EMAIL_OFF_ROUTE}?${params}`;
}

/** Constant-time compare of two hex strings. */
function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * A mail provider's one-click unsubscribe (body `List-Unsubscribe=One-Click`)
 * turns that email off. A GET (a person, or a link scanner) changes nothing
 * and goes to the notification settings, where the switch is.
 */
export async function handleEmailOff(
  request: Request,
  env: { DB: D1Database; DATA: R2Bucket },
  ctx: { now: Date; origin: string; ipHash: () => Promise<string> },
): Promise<Response> {
  if (request.method === "GET")
    return Response.redirect(`${ctx.origin}/settings/notifications`, 303);
  if (request.method !== "POST")
    return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
  const count = await hit(
    env.DB,
    `${EMAIL_OFF_ROUTE}:${await ctx.ipHash()}`,
    { seconds: 3_600 },
    ctx.now,
  );
  if (count > EMAIL_OFF_PER_IP_PER_HOUR)
    return new Response("Too many requests", { status: 429 });
  const url = new URL(request.url);
  const userId = url.searchParams.get("u") ?? "";
  const type = NotificationTypeSchema.safeParse(url.searchParams.get("t"));
  const key = url.searchParams.get("k") ?? "";
  if (
    !userId ||
    !type.success ||
    !sameHex(key, await keyedHash(env.DATA, subject(userId, type.data)))
  )
    return new Response("This link isn't valid.", { status: 400 });
  const settings = await readSettings(env.DB, userId);
  const exists = await env.DB.prepare("SELECT 1 FROM users WHERE id = ?1")
    .bind(userId)
    .first();
  if (exists)
    await writeSettings(
      env.DB,
      userId,
      withChannel(settings, type.data, "email", false),
      ctx.now,
    );
  return new Response("Turned off. No more of these emails.", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
