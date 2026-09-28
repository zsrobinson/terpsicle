import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOBILE_QUERY } from "~/app/use-media-query";
import {
  type ChatUnreadRoom,
  COURSE_INDEX_MANIFEST_KEY,
  courseRoomId,
  courseSearchKey,
  deptChunkKey,
  type MeUser,
  manifestKey,
  sectionRoomId,
  TERMS_KEY,
} from "~/core/schema";
import {
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
import { chatApi } from "~/server/fns/chat-api";
import { Toaster } from "~/ui/sonner";
import { TooltipProvider } from "~/ui/tooltip";
import { FLAGS_OFF, useAccount } from "../auth/account-store";
import { type ChatApi, fetchChatData } from "./chat-data";
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

/** /data as the Worker serves it: the terms, CMSC's manifest entry and its chunk. */
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
const data = fetchChatData("/data", async (url) => {
  const key = String(url).replace("/data/", "");
  return key in files
    ? new Response(JSON.stringify(files[key]))
    : new Response("missing", { status: 404 });
});

const section0101 = sectionRoomId(fixtureTermId, "CMSC351", "0101");

function fakeClient(unread: ChatUnreadRoom[] = []) {
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
    },
    reports: { create: vi.fn() },
  };
  setChatHomeDeps({
    client: client as unknown as ChatApi,
    data,
  });
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
  useChatHome.setState({
    status: "idle",
    terms: [],
    termId: null,
    synced: { plans: [], settings: null },
    courses: new Map(),
    unread: [],
    follows: {},
    mutes: {},
    courseRows: null,
    courseRowsState: "idle",
  });
});

afterEach(() => {
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

  it("says so, quietly, while Chat is off", async () => {
    useAccount.setState({ status: "signed-out", flags: FLAGS_OFF, user: null });
    await page();
    expect(screen.getByText(/Chat isn't open yet/)).toBeInTheDocument();
  });

  it("lists your classes with your rooms and their unread counts", async () => {
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
    expect(rows).toEqual([
      expect.stringContaining("CMSC351 · everyone"),
      expect.stringContaining("Brandt's sections"),
      expect.stringContaining("0101 · "),
    ]);
    expect(within(list).getAllByText("3 unread")).toHaveLength(2);
    // Which plan, and which term: Schedule is usually on the next one.
    expect(
      screen.getByText(`Rooms from Plan A, your ${aTerm().name} plan`),
    ).toBeInTheDocument();
    await user.click(within(list).getByRole("button", { name: /^0101 · / }));
    expect(go).toHaveBeenCalledWith(
      { term: undefined, course: "CMSC351", room: section0101 },
      undefined,
    );
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
    expect(screen.getByText(`${term} · your main plan`)).toBeInTheDocument();
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
      name: "Open CMSC351 0101",
    });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole("heading", { level: 1, name: "Chat" }),
    ).toBeInTheDocument();
    // The family bar, the page's first header.
    expect(screen.getAllByRole("banner")[0]).toHaveTextContent(aTerm().name);
    await user.click(open);
    expect(go).toHaveBeenCalledWith(
      { term: undefined, course: "CMSC351", room: section0101 },
      undefined,
    );
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
    await page({ course: "CMSC351", room: section0101 });
    const nav = screen.getByRole("navigation", { name: "Rooms" });
    const list = await within(nav).findByRole("list", { name: "Your classes" });
    // Your section's room is the open one; another section's isn't listed.
    expect(
      await within(list).findByRole("button", { name: /^0101 · / }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("button", { name: /^0201 · / })).toBeNull();
    expect(screen.queryByText(/Add it to one of yours/)).toBeNull();
    // The room in its own shape while it connects: the header, messages
    // on their way, and a composer you can already type in.
    const room = await screen.findByRole("region", { name: /^0101 · / });
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
    await page({ course: "CMSC351", room: section0101 });
    const room = await screen.findByRole("region", { name: /^0101 · / });
    expect(
      within(room).getByRole("link", { name: "Your classes" }),
    ).toBeInTheDocument();
    const nav = document.querySelector('nav[aria-label="Rooms"]');
    expect(nav).toBeInTheDocument();
    expect(nav).not.toBeVisible();
  });

  it("opens a course's room from a course on its own", async () => {
    signedIn();
    fakeClient();
    const { go } = await page({ course: "CMSC351" });
    await vi.waitFor(() =>
      expect(go).toHaveBeenCalledWith(
        {
          term: undefined,
          course: "CMSC351",
          room: courseRoomId(fixtureTermId, "CMSC351"),
        },
        { replace: true },
      ),
    );
  });

  it("joins a course you opened from its room's header, and leaves it from room info with undo", async () => {
    quietSockets();
    signedIn();
    const client = fakeClient();
    client.sync.pull.mockResolvedValue({
      status: "ok",
      cursor: 0,
      more: false,
      docs: [],
    });
    const { user } = await page({
      course: "CMSC351",
      room: courseRoomId(fixtureTermId, "CMSC351"),
    });
    // Not yours yet, but it's in the list while it's open.
    const list = await screen.findByRole("list", { name: "Your classes" });
    expect(
      await within(list).findByRole("button", { name: /^CMSC351 · everyone/ }),
    ).toHaveAttribute("aria-current", "page");
    await user.click(await screen.findByRole("button", { name: "Join" }));
    expect(client.chat.follow).toHaveBeenCalledWith({
      termId: fixtureTermId,
      courseCode: "CMSC351",
    });
    await vi.waitFor(() =>
      expect(screen.queryByRole("button", { name: "Join" })).toBeNull(),
    );
    await user.click(screen.getByRole("button", { name: "Room info" }));
    await user.click(
      await screen.findByRole("button", { name: "Leave CMSC351 chat" }),
    );
    expect(client.chat.unfollow).toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Undo" }));
    expect(client.chat.follow).toHaveBeenCalledTimes(2);
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
        name: "Open CMSC351's course room ↵",
      }),
    ).toBeInTheDocument();

    await user.type(box, "{Enter}");
    await vi.waitFor(() =>
      expect(go).toHaveBeenCalledWith(
        {
          term: undefined,
          course: "CMSC351",
          room: courseRoomId(fixtureTermId, "CMSC351"),
        },
        undefined,
      ),
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
});
