import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ChatLatestMessage,
  type ChatUnreadRoom,
  COURSE_INDEX_MANIFEST_KEY,
  courseRoomId,
  courseSearchKey,
  deptChunkKey,
  type MeUser,
  manifestKey,
  professorRoomId,
  sectionRoomId,
  TERMS_KEY,
} from "~/core/schema";
import {
  aChatAuthor,
  aCourse,
  aCourseIndexManifest,
  aCourseSearchFile,
  aDeptChunk,
  aManifest,
  aManifestDepartment,
  aPlan,
  aPlanCourse,
  aSection,
  aSettingsDoc,
  aTerm,
  aTermsFile,
  FIXTURE_HASH,
  FIXTURE_NOW,
  fixtureTermId,
} from "~/fixtures";
import { MOBILE_QUERY } from "~/hooks/use-media-query";
import { resetPageSource } from "~/lib/published-source";
import { chatApi } from "~/server/fns/chat-api";
import { createMemoryDataSource } from "~/state/data-source";
import {
  createMemoryQueryStorage,
  setQueryStorage,
} from "~/state/query/persister";
import { connectPublished } from "~/state/query/published";
import { Toaster } from "~/ui/sonner";
import { TooltipProvider } from "~/ui/tooltip";
import { FLAGS_OFF, useAccount } from "../auth/account-store";
import type { ChatApi } from "./chat-data";
import { setChatHomeDeps, useChatHome } from "./chat-home";
import { ChatPage } from "./chat-page";
import type { ChatView } from "./nav";

const USER: MeUser = {
  id: "tstudent",
  name: "Test Student",
  email: "tstudent@terpmail.umd.edu",
  isAdmin: false,
  createdAt: FIXTURE_NOW,
};

const cmsc351 = aCourse({
  code: "CMSC351",
  title: "Algorithms",
  sections: [
    aSection({ code: "0101", instructors: ["Ada Brandt"] }),
    aSection({ code: "0201", instructors: ["Lee Moss"] }),
  ],
});

/** Published data: the terms, CMSC's manifest entry and its chunk. */
const files: Record<string, unknown> = {
  [TERMS_KEY]: aTermsFile({ terms: [aTerm()] }),
  [manifestKey(fixtureTermId)]: aManifest({
    departments: [aManifestDepartment({ code: "CMSC", hash: FIXTURE_HASH })],
  }),
  [deptChunkKey(fixtureTermId, "CMSC", FIXTURE_HASH)]: aDeptChunk({
    courses: [cmsc351],
  }),
  // The course index lists every term's courses: CMSC352 isn't in this one.
  [COURSE_INDEX_MANIFEST_KEY]: aCourseIndexManifest(),
  [courseSearchKey(FIXTURE_HASH)]: aCourseSearchFile({
    courses: [
      ["CMSC351", "Algorithms", 3, 3, []],
      ["CMSC352", "Algorithms II", 3, 3, []],
    ],
  }),
};

const section0101 = sectionRoomId(fixtureTermId, "CMSC351", "0101");

function fakeClient(
  unread: ChatUnreadRoom[] = [],
  latest: ChatLatestMessage[] = [],
) {
  const client = {
    sync: {
      pull: vi.fn(async () => ({
        status: "ok" as const,
        cursor: 1,
        more: false,
        docs: [
          {
            kind: "plan" as const,
            id: "plan_fixture_a",
            rev: 1,
            updatedAt: FIXTURE_NOW,
            body: aPlan({
              courses: [
                aPlanCourse({ courseCode: "CMSC351", sectionCode: "0101" }),
              ],
            }),
          },
        ],
      })),
      push: vi.fn(),
    },
    chat: {
      unread: vi.fn(async () => ({ rooms: unread })),
      follow: vi.fn(async () => ({ status: "ok" as const })),
      unfollow: vi.fn(async () => ({ status: "ok" as const })),
      mute: vi.fn(async () => ({ status: "ok" as const })),
      members: vi.fn(),
      latest: vi.fn(async () => ({ latest })),
      joins: vi.fn(async () => ({ status: "ok" as const, joins: [] })),
    },
    reports: { create: vi.fn() },
  };
  setChatHomeDeps({ client: client as unknown as ChatApi });
  return client;
}

/** The page under a router (its header links to the products). */
async function page(view: ChatView = {}) {
  const go = vi.fn();
  const root = createRootRoute({
    component: () => (
      <TooltipProvider delayDuration={0}>
        <Outlet />
        <Toaster />
      </TooltipProvider>
    ),
  });
  const chat = createRoute({
    getParentRoute: () => root,
    path: "$",
    component: () => <ChatPage view={view} go={go} />,
  });
  const router = createRouter({
    routeTree: root.addChildren([chat]),
    history: createMemoryHistory({ initialEntries: ["/chat"] }),
  });
  await router.load();
  render(<RouterProvider router={router} />);
  return { go, user: userEvent.setup() };
}

beforeEach(() => {
  // The page's queries read these files, saved to memory, not IndexedDB.
  setQueryStorage(createMemoryQueryStorage());
  connectPublished(createMemoryDataSource(files));
  useChatHome.setState({
    status: "idle",
    terms: [],
    termId: null,
    synced: { plans: [], settings: null },
    courses: new Map(),
    unread: [],
    latest: {},
    latestSeq: {},
    follows: {},
    mutes: {},
  });
});

afterEach(() => {
  connectPublished(null);
  resetPageSource();
  setQueryStorage(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Sockets that never open: a room stays "connecting", in its loading shape. */
function quietSockets() {
  class QuietSocket {
    readyState = 0;
    send() {}
    close() {}
    addEventListener() {}
  }
  vi.stubGlobal("WebSocket", QuietSocket);
  // Room info asks who's here.
  vi.spyOn(chatApi, "members").mockResolvedValue({
    status: "ok",
    members: [],
    total: 0,
  });
}

const signedIn = () =>
  useAccount.setState({
    status: "signed-in",
    flags: { ...FLAGS_OFF, signIn: true, chat: "on" },
    user: USER,
  });

describe("ChatPage", () => {
  it("is the front door while you're signed out: what's kept, and what classmates see", async () => {
    useAccount.setState({
      status: "signed-out",
      flags: { ...FLAGS_OFF, signIn: true, chat: "on" },
      user: null,
    });
    await page();
    expect(
      screen.getByRole("heading", {
        name: "A chat room for every class",
        level: 1,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Classmates see your name from Google/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/There are no profile pictures/),
    ).toBeInTheDocument();
    expect(screen.getByText(/delete them/)).toBeInTheDocument();
    // Where rooms come from, in words someone new knows: Schedule, not "sync".
    expect(
      screen.getByText(/Your rooms come from the classes you add in Schedule/),
    ).toBeInTheDocument();
    expect(screen.getByRole("main")).not.toHaveTextContent(/sync/i);
  });

  it("names the course you came to join while you're signed out", async () => {
    useAccount.setState({
      status: "signed-out",
      flags: { ...FLAGS_OFF, signIn: true, chat: "on" },
      user: null,
    });
    await page({ term: "202701", course: "CMSC351", join: 1 });
    expect(
      screen.getByText(
        "Talk with the people in CMSC351 and your other classes. Sign in to join its room.",
      ),
    ).toBeInTheDocument();
  });

  it("says so, quietly, while Chat is off", async () => {
    useAccount.setState({ status: "signed-out", flags: FLAGS_OFF, user: null });
    await page();
    expect(screen.getByText(/Chat isn't open yet/)).toBeInTheDocument();
  });

  it("lists your classes with your rooms by name, their newest message, and an unread mark", async () => {
    signedIn();
    const client = fakeClient(
      [
        {
          room: section0101,
          courseCode: "CMSC351",
          lastSeq: 5,
          unread: 3,
          lastMessageAt: FIXTURE_NOW,
          muted: false,
        },
        {
          room: courseRoomId(fixtureTermId, "CMSC351"),
          courseCode: "CMSC351",
          lastSeq: 2,
          unread: 1,
          lastMessageAt: FIXTURE_NOW,
          muted: false,
        },
        {
          room: professorRoomId(fixtureTermId, "CMSC351", ["Ada Brandt"]),
          courseCode: "CMSC351",
          lastSeq: 9,
          unread: 4,
          lastMessageAt: FIXTURE_NOW,
          muted: true,
        },
      ],
      [
        {
          id: "msg_latest_01",
          room: section0101,
          author: aChatAuthor({ directoryId: "alexk", name: "Alex Kim" }),
          text: "anyone get 3b?",
          deleted: false,
          createdAt: FIXTURE_NOW,
        },
        {
          id: "msg_latest_02",
          room: courseRoomId(fixtureTermId, "CMSC351"),
          author: aChatAuthor({ directoryId: "samlee", name: "Sam Lee" }),
          text: "",
          deleted: true,
          createdAt: FIXTURE_NOW,
        },
      ],
    );
    const { go, user } = await page();
    const list = await screen.findByRole("list", { name: "Your classes" });
    const rows = within(list)
      .getAllByRole("button")
      .map((b) => b.textContent);
    // The course is a heading over its rooms, not somewhere else to go.
    expect(
      within(list).getByRole("heading", {
        level: 3,
        name: /^CMSC351\s*Algorithms$/,
      }),
    ).toBeInTheDocument();
    expect(rows).toEqual(["Everyone", "Brandt's Sections", "Section 0101"]);
    // Each room's newest message, not a summary, asked once per course.
    expect(await within(list).findByText("Alex: anyone get 3b?")).toBeVisible();
    expect(within(list).getByText("Message deleted by author")).toBeVisible();
    expect(client.chat.latest).toHaveBeenCalledTimes(1);
    // Unread in Chat's blue: a dot for one, the count for more; muted, a bell.
    const row = (id: string) =>
      document.querySelector(`[data-room-row="${id}"]`) as HTMLElement;
    expect(
      row(courseRoomId(fixtureTermId, "CMSC351")).querySelector(
        '[data-unread-mark="dot"]',
      ),
    ).not.toBeNull();
    expect(
      within(row(section0101)).getByText("3 unread", { exact: false }),
    ).toBeInTheDocument();
    const muted = row(
      professorRoomId(fixtureTermId, "CMSC351", ["Ada Brandt"]),
    );
    expect(within(muted).getByLabelText("Muted")).toBeInTheDocument();
    expect(muted.querySelector("[data-unread-mark]")).toBeNull();
    // Which plan, and which term: Schedule is usually on the next one.
    expect(
      screen.getByText(`Rooms from Plan A, your ${aTerm().name} plan`),
    ).toBeInTheDocument();
    await user.click(
      within(list).getByRole("button", { name: "Section 0101" }),
    );
    expect(go).toHaveBeenCalledWith({ course: "CMSC351", room: section0101 });

    // A right click on a row: mark read (it has unread), and mute.
    fireEvent.contextMenu(row(section0101));
    let menu = await screen.findByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((i) => i.textContent),
    ).toEqual(["Mark read", "Mute"]);
    await user.click(within(menu).getByRole("menuitem", { name: "Mark read" }));
    await waitFor(() =>
      expect(row(section0101).querySelector("[data-unread-mark]")).toBeNull(),
    );
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    fireEvent.contextMenu(row(section0101));
    menu = await screen.findByRole("menu");
    await user.click(within(menu).getByRole("menuitem", { name: "Mute" }));
    expect(client.chat.mute).toHaveBeenCalledWith({
      termId: fixtureTermId,
      courseCode: "CMSC351",
      roomId: section0101,
      muted: true,
    });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("makes another plan main from Rooms from, with Undo", async () => {
    signedIn();
    const client = fakeClient();
    const planA = aPlan({
      courses: [aPlanCourse({ courseCode: "CMSC351", sectionCode: "0101" })],
    });
    const planB = aPlan({
      id: "plan_fixture_b",
      name: "Plan B",
      order: 1,
      courses: [aPlanCourse({ courseCode: "CMSC351", sectionCode: "0201" })],
    });
    const settings = aSettingsDoc();
    // The fake's own type only knows plan docs.
    (client.sync.pull as ReturnType<typeof vi.fn>).mockResolvedValue({
      status: "ok",
      cursor: 3,
      more: false,
      docs: [
        {
          kind: "plan",
          id: planA.id,
          rev: 1,
          updatedAt: FIXTURE_NOW,
          body: planA,
        },
        {
          kind: "plan",
          id: planB.id,
          rev: 2,
          updatedAt: FIXTURE_NOW,
          body: planB,
        },
        {
          kind: "settings",
          id: "settings",
          rev: 3,
          updatedAt: FIXTURE_NOW,
          body: settings,
        },
      ],
    });
    client.sync.push.mockResolvedValue({
      results: [{ kind: "settings", id: "settings", status: "ok", rev: 4 }],
    });
    const { user } = await page();
    const term = aTerm().name;
    await user.click(
      await screen.findByRole("button", {
        name: "Rooms from Plan A, your main plan",
      }),
    );
    // The plans are a group headed by the term (the menu's title too).
    expect(
      screen.getByRole("group", { name: `${term} · your main plan` }),
    ).toBeVisible();
    await user.click(screen.getByRole("menuitemradio", { name: "Plan B" }));
    const pushed = client.sync.push.mock.calls[0]?.[0] as {
      docs: { body: { mainPlans: unknown; chatPlans: unknown } }[];
    };
    const mainPlans = { [fixtureTermId]: planB.id };
    // Both names, so a build from before main plans still reads it.
    expect(pushed.docs[0]?.body).toMatchObject({
      mainPlans,
      chatPlans: mainPlans,
    });
    expect(
      await screen.findByText(`Plan B is your main plan for ${term}`),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Rooms from Plan B, your main plan",
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(client.sync.push).toHaveBeenCalledTimes(2));
    const undone = client.sync.push.mock.calls[1]?.[0] as {
      docs: { body: { mainPlans: unknown } }[];
    };
    expect(undone.docs[0]?.body.mainPlans).toEqual({
      [fixtureTermId]: planA.id,
    });
  });

  it("names the page once, puts the term in the bar, and offers the room with the most unread", async () => {
    signedIn();
    fakeClient([
      {
        room: section0101,
        courseCode: "CMSC351",
        lastSeq: 5,
        unread: 3,
        lastMessageAt: FIXTURE_NOW,
        muted: false,
      },
    ]);
    const { go, user } = await page();
    const open = await screen.findByRole("button", {
      name: "Open CMSC351 · Section 0101",
    });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 1, name: "Chat" }),
    ).toBeInTheDocument();
    // The family bar, the page's first header.
    expect(screen.getAllByRole("banner")[0]).toHaveTextContent(aTerm().name);
    await user.click(open);
    expect(go).toHaveBeenCalledWith({ room: section0101 });
  });

  it("on a phone, says what Chat is first, and Find a course brings the finder", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query) =>
        ({
          matches: query === MOBILE_QUERY,
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    );
    signedIn();
    const client = fakeClient();
    client.sync.pull.mockResolvedValue({
      status: "ok",
      cursor: 0,
      more: false,
      docs: [],
    });
    const { user } = await page();
    expect(
      await screen.findByRole("heading", { name: "No classes here yet" }),
    ).toBeInTheDocument();
    // The first-visit template's two equal paths, as in Schedule and Plan.
    expect(
      screen.getByRole("link", { name: "View schedule" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Find a course" }));
    expect(
      screen.getByRole("searchbox", { name: "Find a course's chat" }),
    ).toHaveFocus();
  });

  it("opens a room beside the list, which stays the one sidebar and lists only your rooms", async () => {
    quietSockets();
    signedIn();
    fakeClient();
    await page({ course: "CMSC351", room: "0101" });
    const nav = screen.getByRole("navigation", { name: "Rooms" });
    const list = await within(nav).findByRole("list", { name: "Your classes" });
    // Your section's room is the open one; another section's isn't listed.
    expect(
      await within(list).findByRole("button", { name: "Section 0101" }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("button", { name: "Section 0201" })).toBeNull();
    expect(screen.queryByText(/Add it to one of yours/)).toBeNull();
    // The room in its own shape while it connects: the header, messages
    // on their way, and a composer you can already type in.
    const room = await screen.findByRole("region", {
      name: "CMSC351 · Section 0101",
    });
    expect(
      within(room).getByRole("heading", { name: "Section 0101" }),
    ).toBeInTheDocument();
    expect(
      within(room).getByRole("status", { name: "Loading messages" }),
    ).toBeInTheDocument();
    const field = within(room).getByRole("textbox", { name: /^Message/ });
    expect(field).toBeEnabled();
    expect(within(room).getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("on a phone, the room covers the list, which stays underneath for Back", async () => {
    quietSockets();
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query) =>
        ({
          matches: query === MOBILE_QUERY,
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    );
    signedIn();
    fakeClient();
    await page({ course: "CMSC351", room: "0101" });
    const room = await screen.findByRole("region", {
      name: "CMSC351 · Section 0101",
    });
    expect(
      within(room).getByRole("link", { name: "Your classes" }),
    ).toBeInTheDocument();
    const nav = document.querySelector('nav[aria-label="Rooms"]');
    expect(nav).toBeInTheDocument();
    expect(nav).not.toBeVisible();
  });

  it("opens a course's room for everyone from its path, and nothing for a path that names no room", async () => {
    quietSockets();
    signedIn();
    fakeClient();
    await page({ course: "CMSC351", room: "everyone" });
    expect(
      await screen.findByRole("region", { name: "CMSC351 · Everyone" }),
    ).toBeInTheDocument();
  });

  it("opens the list, joining nothing, from a link to another term's chat", async () => {
    signedIn();
    const client = fakeClient();
    // Chat's term is Spring 2027, the only one listed; Fall 2027 is to come.
    const { go } = await page({ term: "202708", course: "CMSC351", join: 1 });
    await vi.waitFor(() =>
      expect(go).toHaveBeenCalledWith({}, { replace: true }),
    );
    expect(client.chat.follow).not.toHaveBeenCalled();
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("with no classes yet, finds any course and opens its room, with ↵", async () => {
    signedIn();
    const client = fakeClient();
    client.sync.pull.mockResolvedValue({
      status: "ok",
      cursor: 0,
      more: false,
      docs: [],
    });
    const { go, user } = await page();
    expect(
      await screen.findByRole("heading", { name: "No classes here yet" }),
    ).toBeInTheDocument();
    // The scheduler stays, second.
    expect(screen.getByRole("link", { name: "View schedule" })).toHaveAttribute(
      "href",
      "/schedule",
    );

    // On a desktop the finder is already in the list: Find a course goes there.
    await user.click(screen.getByRole("button", { name: "Find a course" }));
    const box = screen.getByRole("searchbox", { name: "Find a course's chat" });
    expect(box).toHaveFocus();
    await user.type(box, "algorithms");
    const results = await screen.findByRole("list", { name: "Courses" });
    expect(
      within(results)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["CMSC351Algorithms", "CMSC352Algorithms II"]);
    await user.hover(within(results).getAllByRole("button")[0] as HTMLElement);
    expect(
      await screen.findByRole("tooltip", {
        name: "Open CMSC351 · Everyone ↵",
      }),
    ).toBeInTheDocument();

    await user.type(box, "{Enter}");
    await vi.waitFor(() =>
      expect(go).toHaveBeenCalledWith({
        course: "CMSC351",
        room: courseRoomId(fixtureTermId, "CMSC351"),
      }),
    );
  });

  it("says so when a course found has no rooms this term", async () => {
    signedIn();
    const client = fakeClient();
    client.sync.pull.mockResolvedValue({
      status: "ok",
      cursor: 0,
      more: false,
      docs: [],
    });
    const { go, user } = await page();
    await user.type(
      await screen.findByRole("searchbox", { name: "Find a course's chat" }),
      "cmsc352",
    );
    await user.click(await screen.findByRole("button", { name: /^CMSC352/ }));
    expect(
      await screen.findByText(
        `CMSC352 isn't offered in ${aTerm().name}, so it has no chat this term.`,
      ),
    ).toBeInTheDocument();
    expect(go).not.toHaveBeenCalled();
  });
  it("joins a course you opened from its room's header, and leaves it from Options with undo", async () => {
    quietSockets();
    signedIn();
    const client = fakeClient();
    client.sync.pull.mockResolvedValue({
      status: "ok",
      cursor: 0,
      more: false,
      docs: [],
    });
    const { user } = await page({ course: "CMSC351", room: "everyone" });
    // Not yours yet, but it's in the list while it's open.
    const list = await screen.findByRole("list", { name: "Your classes" });
    expect(
      await within(list).findByRole("button", { name: "Everyone" }),
    ).toHaveAttribute("aria-current", "page");
    await user.click(await screen.findByRole("button", { name: "Join" }));
    expect(client.chat.follow).toHaveBeenCalledWith({
      termId: fixtureTermId,
      courseCode: "CMSC351",
    });
    await vi.waitFor(() =>
      expect(screen.queryByRole("button", { name: "Join" })).toBeNull(),
    );
    // The room's one button: Options, as a menu.
    await user.click(screen.getByRole("button", { name: "Options" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Leave CMSC351 chat" }),
    );
    expect(client.chat.unfollow).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    // Focus back on Options: the menu has finished closing.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Options" })).toHaveFocus(),
    );
    await user.click(await screen.findByRole("button", { name: "Undo" }));
    expect(client.chat.follow).toHaveBeenCalledTimes(2);
  });
});
