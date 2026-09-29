// Chat's JSON routes (V2.md §8.5), registered in ./api-routes.ts
// with `auth: "user"`. None of them wakes a CourseChat object: the chat list
// reads D1's room index, and members come from main plans.
import { canReadRoom, roomSectionCodes } from "~/core/chat";
import {
  CHAT_MAX_FOLLOWS,
  CHAT_MEMBERS_MAX,
  type ChatFollowInput,
  type ChatFollowResult,
  type ChatMembersInput,
  type ChatMembersResult,
  type ChatMuteInput,
  type ChatMuteResult,
  type ChatUnfollowResult,
  type ChatUnreadInput,
  type ChatUnreadResult,
  FeatureVarsSchema,
  type IsoDate,
  parseRoomId,
} from "~/core/schema";
import { apiError } from "../api/http";
import type { IdentityRouteContext } from "../auth/api";
import { loadChatCourse, loadChatTerm } from "./catalog";
import { planSections, roomMembers, unreadRooms } from "./store";

export interface ChatApiEnv {
  DB: D1Database;
  DATA: R2Bucket;
  CHAT_ENABLED?: string;
}

/** The date in College Park at `now`. */
function collegeParkDate(now: Date): IsoDate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(now);
}

/** The signed-in person, or the answer to send: Chat off, or no session. */
function chatUser(
  env: ChatApiEnv,
  ctx: IdentityRouteContext,
): { id: string } | Response {
  if (FeatureVarsSchema.parse(env).CHAT_ENABLED === "off")
    return apiError("unavailable");
  // The router guarantees a session for `auth: "user"` routes.
  return ctx.session?.user ?? apiError("unauthorized");
}

export async function unread(
  env: ChatApiEnv,
  input: ChatUnreadInput,
  ctx: IdentityRouteContext,
): Promise<ChatUnreadResult | Response> {
  const user = chatUser(env, ctx);
  if (user instanceof Response) return user;
  return { rooms: await unreadRooms(env.DB, user.id, input.termId) };
}

export async function follow(
  env: ChatApiEnv,
  input: ChatFollowInput,
  ctx: IdentityRouteContext,
): Promise<ChatFollowResult | Response> {
  const user = chatUser(env, ctx);
  if (user instanceof Response) return user;
  // Only Chat's term: a room for a term that's over or still to come isn't
  // one to join. Rows from before the rule stay; the list shows them once
  // their term is Chat's.
  const today = collegeParkDate(ctx.now);
  if ((await loadChatTerm(env.DATA, today)) !== input.termId)
    return { status: "other-term" };
  // Under the cap, or already following (a repeat is fine).
  const saved = await env.DB.prepare(
    `INSERT INTO chat_follows (user_id, term_id, course_code, created_at)
     SELECT ?1, ?2, ?3, ?4
     WHERE (SELECT COUNT(*) FROM chat_follows WHERE user_id = ?1 AND term_id = ?2) < ?5
     ON CONFLICT DO NOTHING`,
  )
    .bind(
      user.id,
      input.termId,
      input.courseCode,
      ctx.now.toISOString(),
      CHAT_MAX_FOLLOWS,
    )
    .run();
  if (saved.meta.changes > 0) return { status: "ok" };
  const already = await env.DB.prepare(
    "SELECT 1 FROM chat_follows WHERE user_id = ?1 AND term_id = ?2 AND course_code = ?3",
  )
    .bind(user.id, input.termId, input.courseCode)
    .first();
  return already ? { status: "ok" } : { status: "too-many" };
}

export async function unfollow(
  env: ChatApiEnv,
  input: ChatFollowInput,
  ctx: IdentityRouteContext,
): Promise<ChatUnfollowResult | Response> {
  const user = chatUser(env, ctx);
  if (user instanceof Response) return user;
  await env.DB.prepare(
    "DELETE FROM chat_follows WHERE user_id = ?1 AND term_id = ?2 AND course_code = ?3",
  )
    .bind(user.id, input.termId, input.courseCode)
    .run();
  return { status: "ok" };
}

export async function mute(
  env: ChatApiEnv,
  input: ChatMuteInput,
  ctx: IdentityRouteContext,
): Promise<ChatMuteResult | Response> {
  const user = chatUser(env, ctx);
  if (user instanceof Response) return user;
  await env.DB.prepare(
    `INSERT INTO chat_room_prefs (user_id, term_id, course_code, room_id, muted)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (user_id, term_id, course_code, room_id) DO UPDATE SET muted = excluded.muted`,
  )
    .bind(
      user.id,
      input.termId,
      input.courseCode,
      input.roomId,
      input.muted ? 1 : 0,
    )
    .run();
  return { status: "ok" };
}

export async function members(
  env: ChatApiEnv,
  input: ChatMembersInput,
  ctx: IdentityRouteContext,
): Promise<ChatMembersResult | Response> {
  const user = chatUser(env, ctx);
  if (user instanceof Response) return user;
  const [course, sections] = await Promise.all([
    loadChatCourse(env.DATA, input.termId, input.courseCode),
    planSections(env.DB, user.id, input.termId, input.courseCode),
  ]);
  if (!course) return { status: "not-found" };
  if (!canReadRoom(course.tree, input.roomId, sections))
    return { status: "not-a-member" };
  const whole = parseRoomId(input.roomId)?.kind === "course";
  return {
    status: "ok",
    ...(await roomMembers(
      env.DB,
      input.termId,
      input.courseCode,
      whole ? null : roomSectionCodes(course.tree, input.roomId),
      CHAT_MEMBERS_MAX,
    )),
  };
}
