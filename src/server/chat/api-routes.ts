// Chat's JSON routes (V2.md §8.5), composed into src/server/api/router.ts.
// Messages go over the socket, /api/chat/socket.
import {
  ChatFollowInputSchema,
  ChatMembersInputSchema,
  ChatMuteInputSchema,
  ChatUnreadInputSchema,
} from "~/core/schema";
import { route } from "../api/route";
import { follow, members, mute, unfollow, unread } from "./api";

export const CHAT_ROUTES = {
  "chat/unread": route({
    input: ChatUnreadInputSchema,
    perUserPerHour: 1_200,
    auth: "user",
    handle: (env, input, ctx) => unread(env, input, ctx),
  }),
  "chat/follow": route({
    input: ChatFollowInputSchema,
    perUserPerHour: 600,
    auth: "user",
    handle: (env, input, ctx) => follow(env, input, ctx),
  }),
  "chat/unfollow": route({
    input: ChatFollowInputSchema,
    perUserPerHour: 600,
    auth: "user",
    handle: (env, input, ctx) => unfollow(env, input, ctx),
  }),
  "chat/mute": route({
    input: ChatMuteInputSchema,
    perUserPerHour: 600,
    auth: "user",
    handle: (env, input, ctx) => mute(env, input, ctx),
  }),
  "chat/members": route({
    input: ChatMembersInputSchema,
    perUserPerHour: 600,
    auth: "user",
    handle: (env, input, ctx) => members(env, input, ctx),
  }),
} as const;
