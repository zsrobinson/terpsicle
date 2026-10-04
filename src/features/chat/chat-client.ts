import { api } from "~/server/fns/api";
import { chatApi } from "~/server/fns/chat-api";

// The API calls the chat list makes (sync/pull and push for your plans,
// and chat/unread, latest, follow, unfollow and mute), in one place so a
// test can stand in for all of them. Its queries (./queries) and
// mutations (./chat-mutations) ask through it.

export type ChatApi = Pick<typeof api, "sync" | "reports"> & {
  chat: typeof chatApi;
};

let stub: ChatApi | null = null;

/** Test hook: a fake API client; null for the real one. */
export function setChatClient(next: ChatApi | null): void {
  stub = next;
}

/** The API client, or a test's stand-in. */
export function chatClient(): ChatApi {
  return stub ?? { sync: api.sync, reports: api.reports, chat: chatApi };
}
