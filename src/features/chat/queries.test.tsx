import {
  type QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Room } from "~/core/chat";
import {
  type ChatMembersResult,
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
import { chatApi } from "~/server/fns/chat-api";
import { createTestQueryClient } from "~/state/query/testing";
import { TooltipProvider } from "~/ui/tooltip";
import { type ChatApi, setChatClient } from "./chat-client";
import {
  connectChatData,
  listLive,
  useChatHome,
  useChatSynced,
  useChatUnread,
} from "./chat-home";
import { Composer } from "./composer";
import {
  chatSyncedQuery,
  MEMBERS_STALE_MS,
  mentionable,
  roomMembersQuery,
} from "./queries";
import { chatUnreadQuery, UNREAD_EVERY_MS } from "./unread-query";

// Who's in a room, read through the page's query client: one copy per
// room, kept for a few minutes, shared by "@" and course details' count.

const YOU = aChatAuthor({ directoryId: "tstudent", name: "Test Student" });
const HANNAH = aChatAuthor({ directoryId: "hlee", name: "Hannah Lee" });
const OMAR = aChatAuthor({ directoryId: "oali", name: "Omar Ali" });

type RoomRef = Pick<Room, "id" | "termId" | "courseCode">;
const everyone: RoomRef = {
  id: courseRoomId(fixtureTermId, "CMSC351"),
  termId: fixtureTermId,
  courseCode: "CMSC351",
};
const section: RoomRef = {
  id: sectionRoomId(fixtureTermId, "CMSC351", "0101"),
  termId: fixtureTermId,
  courseCode: "CMSC351",
};

/** chat/members, answering each room with its own people. */
function membersApi() {
  return vi.spyOn(chatApi, "members").mockImplementation(
    async ({ roomId }): Promise<ChatMembersResult> => ({
      status: "ok",
      members: roomId === everyone.id ? [YOU, HANNAH, OMAR] : [YOU, OMAR],
      total: roomId === everyone.id ? 42 : 2,
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  setChatClient(null);
});

describe("roomMembersQuery", () => {
  it("keeps each room's members: asking again reads nothing, another room asks for its own", async () => {
    const members = membersApi();
    const client = createTestQueryClient();
    expect(await mentionable(client, everyone, YOU.directoryId)).toEqual([
      HANNAH,
      OMAR,
    ]);
    expect(await mentionable(client, everyone, YOU.directoryId)).toEqual([
      HANNAH,
      OMAR,
    ]);
    // Course details' head count is the same copy.
    expect((await client.fetchQuery(roomMembersQuery(everyone))).total).toBe(
      42,
    );
    expect(members).toHaveBeenCalledOnce();
    expect(await mentionable(client, section, YOU.directoryId)).toEqual([OMAR]);
    expect(members).toHaveBeenCalledTimes(2);
    expect(members).toHaveBeenLastCalledWith({
      termId: fixtureTermId,
      courseCode: "CMSC351",
      roomId: section.id,
    });
  });

  it("keeps nothing from a room you can't read: the next ask tries again", async () => {
    const members = membersApi();
    members.mockResolvedValueOnce({ status: "not-a-member" });
    const client = createTestQueryClient();
    await expect(mentionable(client, section, YOU.directoryId)).rejects.toThrow(
      "not-a-member",
    );
    expect(await mentionable(client, section, YOU.directoryId)).toEqual([OMAR]);
    expect(members).toHaveBeenCalledTimes(2);
  });
});

describe("@ in a room's composer", () => {
  /** The room's composer, as opening the room shows it. */
  function openRoom(client: ReturnType<typeof createTestQueryClient>) {
    return render(
      <TooltipProvider delayDuration={0}>
        <Composer
          label="Message CMSC351 · everyone"
          placeholder="Message CMSC351 · everyone"
          disabledReason={null}
          onSend={() => {}}
          onTyping={() => {}}
          loadMembers={() => mentionable(client, everyone, YOU.directoryId)}
        />
      </TooltipProvider>,
    );
  }

  async function typeAt(name: string) {
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "@han");
    expect(await screen.findByRole("option", { name })).toBeInTheDocument();
  }

  it("doesn't ask for the members again within a few minutes, and does after", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const members = membersApi();
    const client = createTestQueryClient();
    openRoom(client).unmount();
    // Nothing until an "@".
    expect(members).not.toHaveBeenCalled();
    let room = openRoom(client);
    await typeAt("Hannah Lee");
    expect(members).toHaveBeenCalledOnce();
    room.unmount();
    // Back in the room a minute later: the list is still current.
    vi.setSystemTime(Date.now() + 60_000);
    room = openRoom(client);
    await typeAt("Hannah Lee");
    expect(members).toHaveBeenCalledOnce();
    room.unmount();
    // Once it's stale, the next "@" asks again.
    vi.setSystemTime(Date.now() + MEMBERS_STALE_MS);
    openRoom(client);
    await typeAt("Hannah Lee");
    expect(members).toHaveBeenCalledTimes(2);
  });
});

describe("chatUnreadQuery", () => {
  const unreadRow: ChatUnreadRoom = {
    room: everyone.id,
    courseCode: "CMSC351",
    lastSeq: 3,
    unread: 1,
    lastMessageAt: FIXTURE_NOW,
    muted: false,
  };

  function withClient(client: QueryClient) {
    return ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }

  it("is one copy for Home and Chat, asked once a minute however many read it, which a socket's message changes for both", async () => {
    vi.useFakeTimers();
    const unread = vi.fn(async () => ({ rooms: [unreadRow] }));
    setChatClient({ chat: { unread } } as unknown as ChatApi);
    const client = createTestQueryClient();
    connectChatData(client);
    useChatHome.setState({ termId: fixtureTermId, viewing: null, live: {} });
    const wrapper = withClient(client);
    // Home's page asks; Chat's list and title read the same copy.
    const home = renderHook(() => useQuery(chatUnreadQuery(fixtureTermId)), {
      wrapper,
    });
    const chat = renderHook(() => useChatUnread(), { wrapper });
    const title = renderHook(() => useChatUnread(), { wrapper });
    await vi.waitFor(() => expect(home.result.current.data).toHaveLength(1));
    expect(chat.result.current).toBe(home.result.current.data);
    expect(title.result.current).toBe(home.result.current.data);
    expect(unread).toHaveBeenCalledOnce();

    await act(() => vi.advanceTimersByTimeAsync(UNREAD_EVERY_MS));
    expect(unread).toHaveBeenCalledTimes(2);

    act(() =>
      listLive.message(
        aChatMessage({ room: everyone.id, author: HANNAH }),
        true,
        YOU.directoryId,
      ),
    );
    await vi.waitFor(() =>
      expect(home.result.current.data?.[0]?.unread).toBe(2),
    );
    expect(chat.result.current[0]?.unread).toBe(2);
    expect(unread).toHaveBeenCalledTimes(2);
  });
});

describe("chatSyncedQuery", () => {
  it("asks each time Chat's page opens, and never for the places that read it", async () => {
    const pull = vi.fn(async () => ({
      status: "ok" as const,
      cursor: 1,
      more: false,
      docs: [],
    }));
    setChatClient({ sync: { pull } } as unknown as ChatApi);
    const client = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const page = renderHook(() => useQuery(chatSyncedQuery()), { wrapper });
    await vi.waitFor(() => expect(page.result.current.isSuccess).toBe(true));
    renderHook(() => useChatSynced(), { wrapper });
    expect(pull).toHaveBeenCalledOnce();
    page.unmount();
    // Back to Chat a moment later: what it had shows, and it asks again.
    const again = renderHook(() => useQuery(chatSyncedQuery()), { wrapper });
    expect(again.result.current.data).toEqual({ plans: [], settings: null });
    await vi.waitFor(() => expect(pull).toHaveBeenCalledTimes(2));
  });
});
