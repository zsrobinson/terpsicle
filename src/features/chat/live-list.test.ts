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
import { listLive, useChatHome } from "./chat-home";
import { isFreshMessage } from "./session";

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

beforeEach(() => {
  useChatHome.setState({
    unread: [row(everyone, 1)],
    latest: {},
    latestSeq: {},
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
    const { unread, latest, latestSeq } = useChatHome.getState();
    expect(unread.map((r) => [r.room, r.unread, r.lastSeq])).toEqual([
      [everyone, 2, 4],
      [section, 1, 1],
    ]);
    expect(latest[everyone]).toMatchObject({
      text: "exam moved",
      deleted: false,
    });
    expect(latest[section]?.author.name).toBe("Alex Kim");
    // The poll needn't ask for what the socket already said.
    expect(latestSeq[everyone]).toBe(4);
  });

  it("counts nothing for your own, for the room on screen, or for an edit", () => {
    useChatHome.setState({ viewing: everyone });
    listLive.message(
      aChatMessage({ room: everyone, author: alex }),
      true,
      "tstudent",
    );
    expect(useChatHome.getState().unread[0]?.unread).toBe(0);
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
    expect(useChatHome.getState().unread[0]?.unread).toBe(0);
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
    expect(useChatHome.getState().latest[everyone]?.text).toBe("newer");
  });

  it("takes each room's count from a welcome, the one on screen read", () => {
    useChatHome.setState({
      unread: [row(everyone, 1), row(section, 4, true)],
      viewing: section,
    });
    listLive.welcome("CMSC351", [
      { room: everyone, unread: 6 },
      { room: section, unread: 2 },
    ]);
    expect(useChatHome.getState().unread.map((r) => r.unread)).toEqual([6, 0]);
  });

  it("knows which courses' sockets are open, so the poll skips them", () => {
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
