import type { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type ChatUnreadRoom,
  courseRoomId,
  sectionRoomId,
} from "~/core/schema";
import {
  aChatAuthor,
  aChatMessage,
  FIXTURE_NOW,
  fixtureTermId,
} from "~/fixtures";
import { createTestQueryClient } from "~/state/query/testing";
import { connectChatData, listLive, useChatHome } from "./chat-home";
import { chatLatestQuery, chatUnreadQuery } from "./queries";
import { isFreshMessage } from "./session";

// The list's side of the course sockets: each frame is written into the
// page's query cache, the one copy the list, the title and Home read.

const everyone = courseRoomId(fixtureTermId, "CMSC351");
const section = sectionRoomId(fixtureTermId, "CMSC351", "0101");
const alex = aChatAuthor({ directoryId: "alexk", name: "Alex Kim" });

const row = (room: string, unread: number, muted = false): ChatUnreadRoom => ({
  room,
  courseCode: "CMSC351",
  lastSeq: 3,
  unread,
  lastMessageAt: FIXTURE_NOW,
  muted,
});

let client: QueryClient;
const unreadKey = chatUnreadQuery(fixtureTermId).queryKey;
const latestKey = chatLatestQuery(fixtureTermId, "CMSC351").queryKey;
const unread = () => client.getQueryData(unreadKey) ?? [];
const latest = () => client.getQueryData(latestKey);

beforeEach(() => {
  client = createTestQueryClient();
  connectChatData(client);
  client.setQueryData(unreadKey, [row(everyone, 1)]);
  useChatHome.setState({
    termId: fixtureTermId,
    live: {},
    viewing: null,
    mutes: {},
  });
});

describe("the list, live", () => {
  it("moves a room's newest message and unread count as one lands, even one with no row yet", () => {
    const later = "2027-02-01T15:00:00.000Z";
    listLive.message(
      aChatMessage({
        room: everyone,
        author: alex,
        text: "exam moved",
        createdAt: later,
      }),
      true,
      "tstudent",
    );
    listLive.message(
      aChatMessage({
        id: "msg_fixture_02",
        room: section,
        author: alex,
        text: "hi 0101",
      }),
      true,
      "tstudent",
    );
    expect(unread().map((r) => [r.room, r.unread, r.lastSeq])).toEqual([
      [everyone, 2, 4],
      [section, 1, 1],
    ]);
    expect(latest()?.byRoom[everyone]).toMatchObject({
      text: "exam moved",
      deleted: false,
    });
    expect(latest()?.byRoom[section]?.author.name).toBe("Alex Kim");
    // The seqs move with them: nothing needs asking for again.
    expect(latest()?.seqs).toEqual({ [everyone]: 4, [section]: 1 });
  });

  it("counts nothing for your own, for the room on screen, or for an edit", () => {
    useChatHome.setState({ viewing: everyone });
    listLive.message(
      aChatMessage({ room: everyone, author: alex }),
      true,
      "tstudent",
    );
    expect(unread()[0]?.unread).toBe(0);
    useChatHome.setState({ viewing: null });
    listLive.message(
      aChatMessage({
        room: everyone,
        author: aChatAuthor({ directoryId: "tstudent" }),
      }),
      true,
      "tstudent",
    );
    listLive.message(
      aChatMessage({ room: everyone, author: alex }),
      false,
      "tstudent",
    );
    expect(unread()[0]?.unread).toBe(0);
    // A newer message isn't replaced by an edit of an older one.
    listLive.message(
      aChatMessage({
        room: everyone,
        text: "newer",
        createdAt: "2027-02-02T00:00:00.000Z",
      }),
      false,
      null,
    );
    listLive.message(
      aChatMessage({ room: everyone, text: "old, edited" }),
      false,
      null,
    );
    expect(latest()?.byRoom[everyone]?.text).toBe("newer");
  });

  it("takes each room's count from a welcome, the one on screen read", () => {
    client.setQueryData(unreadKey, [row(everyone, 1), row(section, 4, true)]);
    useChatHome.setState({ viewing: section });
    listLive.welcome("CMSC351", [
      { room: everyone, unread: 6 },
      { room: section, unread: 2 },
    ]);
    expect(unread().map((r) => r.unread)).toEqual([6, 0]);
  });

  it("leaves the counts alone until they've loaded: the first ask brings them", () => {
    client.removeQueries({ queryKey: unreadKey });
    listLive.message(
      aChatMessage({ room: everyone, author: alex }),
      true,
      "tstudent",
    );
    expect(client.getQueryData(unreadKey)).toBeUndefined();
    // The line still moves, so the list has it when it shows.
    expect(latest()?.byRoom[everyone]).toBeDefined();
  });

  it("knows which courses' sockets are open, so the list asks only for the others", () => {
    listLive.status("CMSC351", true);
    expect(useChatHome.getState().live).toEqual({ CMSC351: true });
    listLive.status("CMSC351", false);
    expect(useChatHome.getState().live).toEqual({ CMSC351: false });
  });
});

describe("isFreshMessage", () => {
  it("is a message just sent, not one coming again", () => {
    expect(isFreshMessage(aChatMessage(), false)).toBe(true);
    expect(
      isFreshMessage(aChatMessage({ replyTo: "msg_root_001" }), false),
    ).toBe(true);
    expect(isFreshMessage(aChatMessage(), true)).toBe(false);
    // A thread's first message comes again whenever its count moves.
    expect(
      isFreshMessage(
        aChatMessage({ thread: { count: 2, lastAt: FIXTURE_NOW } }),
        false,
      ),
    ).toBe(false);
    expect(isFreshMessage(aChatMessage({ editedAt: FIXTURE_NOW }), false)).toBe(
      false,
    );
    expect(
      isFreshMessage(aChatMessage({ text: "", deleted: true }), false),
    ).toBe(false);
  });
});
