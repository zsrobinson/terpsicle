import type { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ChatUnreadRoom,
  courseRoomId,
  sectionRoomId,
} from "~/core/schema";
import { FIXTURE_NOW, fixtureTermId } from "~/fixtures";
import { createTestQueryClient } from "~/state/query/testing";
import { type ChatApi, setChatClient } from "./chat-client";
import { connectChatData, useChatHome } from "./chat-home";
import { followCourse, muteRoom, unfollowCourse } from "./chat-mutations";
import { chatUnreadQuery } from "./unread-query";

// Joining, leaving and muting show at once and come back down when the
// server says no; the counts are asked for again once they've settled.

const everyone = courseRoomId(fixtureTermId, "CMSC330");
const section = sectionRoomId(fixtureTermId, "CMSC330", "0101");

const row = (room: string, muted = false): ChatUnreadRoom => ({
  room,
  courseCode: "CMSC330",
  lastSeq: 3,
  unread: 2,
  lastMessageAt: FIXTURE_NOW,
  muted,
});

/** A call that answers when the test says. */
function held<T>() {
  let settle: { resolve: (value: T) => void; reject: (e: Error) => void } = {
    resolve: () => {},
    reject: () => {},
  };
  const promise = new Promise<T>((resolve, reject) => {
    settle = { resolve, reject };
  });
  return { promise, ...settle };
}

let client: QueryClient;
const unreadKey = chatUnreadQuery(fixtureTermId).queryKey;
const rows = () => client.getQueryData(unreadKey) ?? [];
const chat = {
  follow: vi.fn(),
  unfollow: vi.fn(),
  mute: vi.fn(),
  unread: vi.fn(),
};

beforeEach(() => {
  client = createTestQueryClient();
  connectChatData(client);
  setChatClient({ chat } as unknown as ChatApi);
  client.setQueryData(unreadKey, [row(everyone), row(section)]);
  useChatHome.setState({
    termId: fixtureTermId,
    follows: {},
    mutes: {},
    viewing: null,
  });
});

afterEach(() => {
  setChatClient(null);
  vi.resetAllMocks();
});

describe("muteRoom", () => {
  it("shows the bell at once, and puts it back when the mute doesn't save", async () => {
    const answer = held<never>();
    chat.mute.mockReturnValue(answer.promise);
    const muting = muteRoom("CMSC330", section, true);
    await vi.waitFor(() => expect(chat.mute).toHaveBeenCalled());
    expect(useChatHome.getState().mutes).toEqual({ [section]: true });
    // Home reads the same row: its count drops the room at once too.
    expect(rows().map((r) => r.muted)).toEqual([false, true]);

    answer.reject(new Error("network"));
    expect(await muting).toBe(false);
    expect(useChatHome.getState().mutes).toEqual({});
    expect(rows().map((r) => r.muted)).toEqual([false, false]);
    // And the counts are the server's again once it settles.
    expect(client.getQueryState(unreadKey)?.isInvalidated).toBe(true);
  });

  it("keeps a mute for a room with no messages yet, which the counts don't list", async () => {
    chat.mute.mockResolvedValue({ status: "ok" });
    const quiet = sectionRoomId(fixtureTermId, "CMSC330", "0201");
    expect(await muteRoom("CMSC330", quiet, true)).toBe(true);
    expect(useChatHome.getState().mutes).toEqual({ [quiet]: true });
    expect(chat.mute).toHaveBeenCalledWith({
      termId: fixtureTermId,
      courseCode: "CMSC330",
      roomId: quiet,
      muted: true,
    });
  });
});

describe("followCourse and unfollowCourse", () => {
  it("joins at once, and leaves the list again when the server says no", async () => {
    const answer = held<{ status: "too-many" }>();
    chat.follow.mockReturnValue(answer.promise);
    const joining = followCourse("CMSC351");
    await vi.waitFor(() => expect(chat.follow).toHaveBeenCalled());
    expect(useChatHome.getState().follows[fixtureTermId]).toEqual(["CMSC351"]);
    answer.resolve({ status: "too-many" });
    expect(await joining).toBe("too-many");
    expect(useChatHome.getState().follows[fixtureTermId]).toEqual([]);
  });

  it("takes a course's rooms out at once, and puts them back when leaving fails", async () => {
    useChatHome.setState({ follows: { [fixtureTermId]: ["CMSC330"] } });
    const answer = held<never>();
    chat.unfollow.mockReturnValue(answer.promise);
    const leaving = unfollowCourse("CMSC330");
    await vi.waitFor(() => expect(chat.unfollow).toHaveBeenCalled());
    expect(useChatHome.getState().follows[fixtureTermId]).toEqual([]);
    expect(rows()).toEqual([]);
    answer.reject(new Error("network"));
    expect(await leaving).toBe(false);
    expect(useChatHome.getState().follows[fixtureTermId]).toEqual(["CMSC330"]);
    expect(rows().map((r) => r.room)).toEqual([everyone, section]);
  });
});
