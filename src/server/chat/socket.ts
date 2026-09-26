// GET /api/chat/socket?term=<termId>&course=<code> (Upgrade: websocket), the
// one WebSocket route (V2.md §8.4): checks CHAT_ENABLED, the origin and
// session, a per-person rate limit and that the term exists, then hands the
// socket to the course's CourseChat object with who's asking.
import {
  ChatSocketQuerySchema,
  courseRoomId,
  FeatureVarsSchema,
} from "~/core/schema";
import { apiError } from "../api/http";
import type { AuthEnv } from "../auth/config";
import { requireUser } from "../auth/guard";
import { hit, secondsLeft } from "../counters";
import { findTerm } from "./catalog";
import { CHAT_HEADERS, type CourseChatNamespace } from "./course-chat";

export const CHAT_SOCKET_PATH = "/api/chat/socket";

/** Sockets a person may open per hour: reconnects after sleep, many tabs. */
export const CHAT_SOCKETS_PER_HOUR = 600;

export interface ChatSocketEnv extends AuthEnv {
  COURSE_CHAT: CourseChatNamespace;
  CHAT_ENABLED?: string;
}

export async function openChatSocket(
  request: Request,
  env: ChatSocketEnv,
  now: Date,
): Promise<Response> {
  const level = FeatureVarsSchema.parse(env).CHAT_ENABLED;
  if (level === "off") return apiError("unavailable");
  if (request.method !== "GET")
    return new Response(null, { status: 405, headers: { Allow: "GET" } });
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
    return new Response("Expected a WebSocket", {
      status: 426,
      headers: { Upgrade: "websocket" },
    });
  const auth = await requireUser(request, env, now);
  if (!auth.ok) return auth.response;
  const { user } = auth.session;

  const url = new URL(request.url);
  const query = ChatSocketQuerySchema.safeParse(
    Object.fromEntries(url.searchParams),
  );
  if (!query.success) return apiError("invalid-input");
  const window = { seconds: 3_600 };
  if (
    (await hit(env.DB, `user:${user.id}:chat/socket`, window, now)) >
    CHAT_SOCKETS_PER_HOUR
  )
    return apiError("rate-limited", secondsLeft(window, now));
  const { term, course } = query.data;
  if (!(await findTerm(env.DATA, term))) return apiError("not-found");

  const stub = env.COURSE_CHAT.get(
    env.COURSE_CHAT.idFromName(courseRoomId(term, course)),
  );
  // A fresh request: nothing the browser sent reaches the object but these.
  return stub.fetch("https://course-chat.internal/socket", {
    headers: {
      Upgrade: "websocket",
      [CHAT_HEADERS.user]: user.id,
      [CHAT_HEADERS.term]: term,
      [CHAT_HEADERS.course]: course,
      [CHAT_HEADERS.level]: level,
    },
  });
}
