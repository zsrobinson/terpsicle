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
} from "~/core/schema";
import { type ApiOptions, callApi } from "~/server/fns/api";

// Chat's JSON routes (docs/V2.md §8.5), signed in only; messages go over the
// socket (./socket). Its own client, so pages without Chat don't carry it.

export const chatApi = {
  /** Your rooms that have messages, with unread counts. Wakes no objects. */
  unread: (
    input: z.input<typeof ChatUnreadInputSchema>,
    options?: ApiOptions,
  ) =>
    callApi(
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
    callApi(
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
    callApi(
      "chat/unfollow",
      ChatFollowInputSchema,
      ChatUnfollowResultSchema,
      input,
      options,
    ),
  mute: (input: z.input<typeof ChatMuteInputSchema>, options?: ApiOptions) =>
    callApi(
      "chat/mute",
      ChatMuteInputSchema,
      ChatMuteResultSchema,
      input,
      options,
    ),
  /** Names and pictures of a room's people (at most 200), and how many there are. */
  members: (
    input: z.input<typeof ChatMembersInputSchema>,
    options?: ApiOptions,
  ) =>
    callApi(
      "chat/members",
      ChatMembersInputSchema,
      ChatMembersResultSchema,
      input,
      options,
    ),
} as const;
