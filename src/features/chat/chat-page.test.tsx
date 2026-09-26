import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ChatUnreadRoom,
  deptChunkKey,
  type MeUser,
  manifestKey,
  sectionRoomId,
  TERMS_KEY,
} from "~/core/schema";
import {
  aCourse,
  aDeptChunk,
  aManifest,
  aManifestDepartment,
  aPlan,
  aPlanCourse,
  aSection,
  aTerm,
  aTermsFile,
  FIXTURE_HASH,
  FIXTURE_NOW,
  fixtureTermId,
} from "~/fixtures";
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
  avatarUrl: null,
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
  });
});

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
      screen.getByRole("heading", { name: "Terpsicle Chat", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Classmates see your Google name and picture/),
    ).toBeInTheDocument();
    expect(screen.getByText(/delete them/)).toBeInTheDocument();
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
    expect(rows).toEqual([
      expect.stringContaining("CMSC351Algorithms"),
      expect.stringContaining("CMSC351 · everyone"),
      expect.stringContaining("Brandt's sections"),
      expect.stringContaining("0101 · "),
    ]);
    expect(within(list).getAllByText("3 unread")).toHaveLength(2);
    await user.click(within(list).getByRole("button", { name: /^0101 · / }));
    expect(go).toHaveBeenCalledWith(
      { term: undefined, course: "CMSC351", room: section0101 },
      undefined,
    );
  });

  it("shows a course's whole room tree, with rooms you can't open yet saying why", async () => {
    signedIn();
    fakeClient();
    const { user } = await page({ course: "CMSC351" });
    const locked = await screen.findByRole("button", { name: /^0201 · / });
    expect(locked).toHaveAttribute("aria-disabled", "true");
    await user.hover(locked);
    expect(
      (
        await screen.findAllByText(
          "For people with 0201 in a plan. Add it to one of yours to join.",
        )
      )[0],
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^0101 · / }),
    ).not.toHaveAttribute("aria-disabled");
    expect(
      screen.getByRole("button", { name: /^CMSC351 · everyone/ }),
    ).toBeInTheDocument();
  });

  it("joins a course you follow from its room tree, and leaves it with undo", async () => {
    signedIn();
    const client = fakeClient();
    client.sync.pull.mockResolvedValue({
      status: "ok",
      cursor: 0,
      more: false,
      docs: [],
    });
    const { user } = await page({ course: "CMSC351" });
    await user.click(await screen.findByRole("button", { name: "Join" }));
    expect(client.chat.follow).toHaveBeenCalledWith({
      termId: fixtureTermId,
      courseCode: "CMSC351",
    });
    await user.click(await screen.findByRole("button", { name: "Leave" }));
    expect(client.chat.unfollow).toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "Undo" }));
    expect(client.chat.follow).toHaveBeenCalledTimes(2);
  });
});
