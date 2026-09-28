import type { z } from "zod";
import {
  ChatFollowInputSchema,
  ChatFollowResultSchema,
  ChatMembersInputSchema,
  ChatMembersResultSchema,
  ChatMuteInputSchema,
  ChatMuteResultSchema,
  ChatUnfollowResultSchema,
  ChatUnreadInputSchema,
  ChatUnreadResultSchema,
} from "~/core/schema/chat-api";
import { type ApiOptions, call } from "./api";

// Chat's client (docs/V2.md §8.5; signed in only), apart from ./api so pages
// without Chat never load its schemas. Messages go over the socket
// (src/features/chat/socket.ts).

export const chatApi = {
  /** Your rooms that have messages, with unread counts. Wakes no objects. */
  unread: (
    input: z.input<typeof ChatUnreadInputSchema>,
    options?: ApiOptions,
  ) =>
    call(
      "chat/unread",
      ChatUnreadInputSchema,
      ChatUnreadResultSchema,
      input,
      options,
    ),
  /** Keeps a course room you opened from outside your plan in your list. */
  follow: (
    input: z.input<typeof ChatFollowInputSchema>,
    options?: ApiOptions,
  ) =>
    call(
      "chat/follow",
      ChatFollowInputSchema,
      ChatFollowResultSchema,
      input,
      options,
    ),
  unfollow: (
    input: z.input<typeof ChatFollowInputSchema>,
    options?: ApiOptions,
  ) =>
    call(
      "chat/unfollow",
      ChatFollowInputSchema,
      ChatUnfollowResultSchema,
      input,
      options,
    ),
  mute: (input: z.input<typeof ChatMuteInputSchema>, options?: ApiOptions) =>
    call(
      "chat/mute",
      ChatMuteInputSchema,
      ChatMuteResultSchema,
      input,
      options,
    ),
  /** Names of a room's people (at most 200), and how many there are. */
  members: (
    input: z.input<typeof ChatMembersInputSchema>,
    options?: ApiOptions,
  ) =>
    call(
      "chat/members",
      ChatMembersInputSchema,
      ChatMembersResultSchema,
      input,
      options,
    ),
} as const;
