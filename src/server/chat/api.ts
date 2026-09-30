// Chat's JSON routes (V2.md §8.5), registered in ./api-routes.ts
// with `auth: "user"`. Only chat/latest wakes a CourseChat object (D1 never
// holds chat text), and the list asks it only for rooms with new messages;
// the rest read D1's room index, and members and joins come from main plans.
import { canReadRoom, roomSectionCodes } from "~/core/chat";
import {
  CHAT_JOINS_MAX,
  CHAT_MAX_FOLLOWS,
  CHAT_MEMBERS_MAX,
  type ChatFollowInput,
  type ChatFollowResult,
  type ChatJoinsInput,
  type ChatJoinsResult,
  type ChatLatestInput,
  type ChatLatestResult,
  type ChatMembersInput,
  type ChatMembersResult,
  type ChatMuteInput,
  type ChatMuteResult,
  type ChatUnfollowResult,
  type ChatUnreadInput,
  type ChatUnreadResult,
  courseRoomId,
  FeatureVarsSchema,
  parseRoomId,
} from "~/core/schema";
import { apiError } from "../api/http";
import type { IdentityRouteContext } from "../auth/api";
import { loadChatCourse, loadChatTerm } from "./catalog";
import type { CourseChatNamespace } from "./course-chat";
import { planSections, roomJoins, roomMembers, unreadRooms } from "./store";

export interface ChatApiEnv {
  DB: D1Database;
  DATA: R2Bucket;
  CHAT_ENABLED?: string;
  COURSE_CHAT?: CourseChatNamespace;
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
  if ((await loadChatTerm(env.DATA, ctx.now)) !== input.termId)
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

export async function latest(
  env: ChatApiEnv,
  input: ChatLatestInput,
  ctx: IdentityRouteContext,
): Promise<ChatLatestResult | Response> {
  const user = chatUser(env, ctx);
  if (user instanceof Response) return user;
  if (!env.COURSE_CHAT) return { latest: [] };
  const stub = env.COURSE_CHAT.get(
    env.COURSE_CHAT.idFromName(courseRoomId(input.termId, input.courseCode)),
  );
  return {
    latest: await stub.latestFor({
      termId: input.termId,
      courseCode: input.courseCode,
      userId: user.id,
      rooms: input.rooms,
    }),
  };
}

export async function joins(
  env: ChatApiEnv,
  input: ChatJoinsInput,
  ctx: IdentityRouteContext,
): Promise<ChatJoinsResult | Response> {
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
    joins: await roomJoins(
      env.DB,
      input.termId,
      input.courseCode,
      whole ? null : roomSectionCodes(course.tree, input.roomId),
      CHAT_JOINS_MAX,
    ),
  };
}
