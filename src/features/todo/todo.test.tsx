import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
  stringifySearchWith,
} from "@tanstack/react-router";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Flags,
  TodoItem,
  TodoListResult,
  TodoSaveTaskInput,
} from "~/core/schema";
import {
  ownTaskDue,
  ownTaskItem,
  TEST_FEED_TOKENS,
  testFeedLink,
} from "~/core/todo";
import { FLAGS_OFF, useAccount } from "~/features/auth/account-store";
import { showSyncedPrefs } from "~/features/prefs/synced-prefs";
import { anOwnTask, aTodoFeedState, aTodoItem } from "~/fixtures";
import { track } from "~/lib/analytics";
import { ApiCallError } from "~/server/fns/api";
import { Toaster } from "~/ui/sonner";
import { TooltipProvider } from "~/ui/tooltip";
import { Composer } from "./composer";
import { ConnectPage } from "./connect-page";
import { importWords } from "./file-drop";
import { TodoPage } from "./todo-page";
import { resetTodo, setTodoClient, type TodoClient } from "./todo-store";

// 2026-09-28 is a Monday, and it's noon in New York; the fixture item is
// due Tuesday the 29th at 11:59pm.

vi.mock("~/lib/analytics", async (original) => ({
  ...(await original<typeof import("~/lib/analytics")>()),
  track: vi.fn(),
}));

const NOW = "2026-09-28T16:00:00.000Z";

function fakeClient(list: Partial<TodoListResult> = {}) {
  let answer: TodoListResult = {
    feed: aTodoFeedState({ lastSuccessAt: "2026-09-28T15:46:00.000Z" }),
    items: [],
    done: [],
    hidden: [],
    ...list,
  };
  const client = {
    list: vi.fn(async () => answer),
    connect: vi.fn(
      async (): Promise<Awaited<ReturnType<TodoClient["connect"]>>> => ({
        status: "connected",
        feed: aTodoFeedState(),
        items: [],
      }),
    ),
    disconnect: vi.fn(async () => ({ status: "disconnected" as const })),
    done: vi.fn(async () => ({ status: "ok" as const })),
    refresh: vi.fn(
      async (): Promise<Awaited<ReturnType<TodoClient["refresh"]>>> => ({
        status: "too-soon",
        feed: answer.feed,
      }),
    ),
    importFile: vi.fn(async () => ({
      status: "imported" as const,
      added: 2,
      skipped: 1,
    })),
    hideCourse: vi.fn(async () => ({ status: "ok" as const })),
    saveTask: vi.fn(
      async (
        input: TodoSaveTaskInput,
      ): Promise<Awaited<ReturnType<TodoClient["saveTask"]>>> => ({
        status: "saved",
        item: ownTaskItem({
          uid: input.uid,
          title: input.title.trim(),
          courseCode: input.courseCode,
          ...ownTaskDue(input.dueDate, input.dueTime),
        }),
      }),
    ),
    deleteTask: vi.fn(async () => ({ status: "ok" as const })),
    /** What the next `todo/list` answers. */
    answer: (next: Partial<TodoListResult>) => {
      answer = { ...answer, ...next };
    },
  };
  setTodoClient(client as unknown as TodoClient);
  return client;
}

/** The page in a one-route router (its frame links to the other products). */
function wrap(node: ReactNode) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => node }),
    history: createMemoryHistory({ initialEntries: ["/todo"] }),
    // As src/router.tsx writes search params (`term=202608`, not quoted).
    stringifySearch: stringifySearchWith(JSON.stringify),
  });
  render(
    <TooltipProvider delayDuration={0}>
      <RouterProvider router={router} />
      <Toaster />
    </TooltipProvider>,
  );
  return router;
}

function signedIn(on = true, chat: Flags["chat"] = "off") {
  useAccount.setState({
    status: "signed-in",
    flags: { ...FLAGS_OFF, signIn: true, todo: on, chat },
    user: {
      id: "tstudent",
      name: "Test Student",
      email: "tstudent@terpmail.umd.edu",
      isAdmin: false,
      createdAt: "2026-09-01T00:00:00.000Z",
    },
  });
}

function renderTodo(anchor?: string) {
  return wrap(<TodoPage anchor={anchor} />);
}

/** The workbench's sidebar, at a desktop's width. */
function sidebar() {
  return screen.getByRole("complementary", { name: "Sidebar" });
}

/**
 * Opens ELMS's settings from the sidebar's first line: its settings icon,
 * or Connect while there's no link. A popover, at a desktop's width.
 */
async function openElms(
  user: ReturnType<typeof userEvent.setup>,
): Promise<HTMLElement> {
  const header = await screen.findByRole("region", { name: "ELMS" });
  const button =
    within(header).queryByRole("button", { name: "ELMS settings" }) ??
    (await within(header).findByRole("button", { name: "Connect" }));
  await user.click(button);
  return screen.findByRole("dialog", {
    name: /^(ELMS settings|Connect ELMS)$/,
  });
}

/** The fill's width, as the bar draws it. */
function fillOf(bar: HTMLElement): string {
  return (within(bar).getByTestId("progress-fill") as HTMLElement).style.width;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  vi.mocked(track).mockClear();
  window.localStorage.clear();
  showSyncedPrefs({});
  resetTodo();
});

afterEach(() => {
  toast.dismiss();
  vi.useRealTimers();
  useAccount.setState({ status: "loading", flags: FLAGS_OFF, user: null });
});

describe("who's looking", () => {
  it("shows the front door when signed out: what Todo does, sign-in and a sample week", async () => {
    const client = fakeClient();
    useAccount.setState({
      status: "signed-out",
      flags: { ...FLAGS_OFF, signIn: true, todo: true },
      user: null,
    });
    renderTodo();
    // The first visit's template: the page's one heading, the product's mark.
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Your deadlines, on a calendar",
      }),
    ).toBeVisible();
    expect(document.querySelector('[data-mark="todo"]')).not.toBeNull();
    expect(screen.getByText(/Connect ELMS and your assignments/)).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Sign in with Google" }),
    ).toHaveAttribute("href", expect.stringContaining("return=%2Ftodo"));
    expect(screen.getByText(/^A week in Todo/)).toBeVisible();
    // A picture: nothing in it can be pressed, and no sidebar yet.
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Sidebar" })).toBeNull();
    expect(client.list).not.toHaveBeenCalled();
    // A page you read, like Chat's and Plan's front doors: the footer.
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("link", { name: "Privacy" })).toBeVisible();
    expect(
      within(footer).getByRole("link", { name: "About Terpsicle" }),
    ).toBeVisible();
  });

  it("says it's coming when Todo is off", async () => {
    fakeClient();
    signedIn(false);
    renderTodo();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Todo" }),
    ).toBeVisible();
    expect(screen.getByText(/Coming soon/)).toBeVisible();
  });

  it("says what Todo does on the first visit, over the empty week, with its two ways in", async () => {
    fakeClient({ feed: null });
    signedIn();
    renderTodo();
    expect(
      await screen.findByText(/^Your deadlines, on a calendar/),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { level: 1, name: "Sep 28 – Oct 4" }),
    ).toBeVisible();
    // The sidebar's first line asks for the link.
    expect(
      within(sidebar()).getByText("Connect ELMS to fill in your week"),
    ).toBeVisible();
    const user = userEvent.setup();
    const main = screen.getByRole("main");
    await user.click(within(main).getByRole("button", { name: "Add a task" }));
    const field = screen.getByRole("textbox", { name: "New task" });
    await waitFor(() => expect(field).toHaveFocus());
    // Connect ELMS opens the sidebar's paste.
    await user.click(
      within(main).getByRole("button", { name: "Connect ELMS" }),
    );
    const connect = await screen.findByRole("dialog", { name: "Connect ELMS" });
    expect(within(connect).getByLabelText("ELMS calendar link")).toBeVisible();
    expect(within(connect).getByText(/Click Calendar Feed/)).toBeVisible();
  });

  it("starts a week without ELMS from the sidebar's composer", async () => {
    fakeClient({ feed: null, items: [] });
    signedIn();
    renderTodo();
    const user = userEvent.setup();
    await user.type(
      await within(
        await screen.findByRole("region", { name: "Add a task" }),
      ).findByRole("textbox", { name: "New task" }),
      "Email my advisor{Enter}",
    );
    // No date: under No date, right under the composer.
    const noDate = await screen.findByRole("region", { name: "No date" });
    expect(within(noDate).getByText("Email my advisor")).toBeVisible();
    expect(screen.queryByText(/^Your deadlines, on a calendar/)).toBeNull();
  });
});

describe("connecting", () => {
  it("checks the link's shape here, and never sends a bad one", async () => {
    const client = fakeClient({ feed: null });
    signedIn();
    renderTodo();
    const user = userEvent.setup();
    const dialog = await openElms(user);
    const input = await screen.findByLabelText("ELMS calendar link");
    expect(input).toHaveAttribute("type", "url");
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input).toHaveAttribute("spellcheck", "false");
    expect(input).toHaveAttribute("data-private");
    expect(input).toHaveClass("ph-no-capture");
    await user.type(input, "https://example.com/feed.ics");
    await user.click(
      within(dialog).getByRole("button", { name: "Connect ELMS" }),
    );
    expect(screen.getByText(/That isn't an ELMS calendar link/)).toBeVisible();
    expect(client.connect).not.toHaveBeenCalled();
    expect(input).toHaveValue("");
  });

  it("sends a feed link once, clears it, and fills in the week", async () => {
    const client = fakeClient({ feed: null });
    signedIn();
    renderTodo();
    const user = userEvent.setup();
    const link = testFeedLink(TEST_FEED_TOKENS.calendar);
    const dialog = await openElms(user);
    const input = await screen.findByLabelText("ELMS calendar link");
    await user.type(input, link);
    client.answer({ feed: aTodoFeedState(), items: [aTodoItem()] });
    await user.click(
      within(dialog).getByRole("button", { name: "Connect ELMS" }),
    );
    expect(client.connect).toHaveBeenCalledWith({ url: link });
    expect(await screen.findByText("Project 2")).toBeVisible();
    // The popover closes once it's connected.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.body.innerHTML).not.toContain(TEST_FEED_TOKENS.calendar);
  });

  it("says why ELMS didn't take it, and tracks only the codes", async () => {
    const client = fakeClient({ feed: null });
    signedIn();
    renderTodo();
    const user = userEvent.setup();
    const dialog = await openElms(user);
    const input = await screen.findByLabelText("ELMS calendar link");
    client.connect.mockResolvedValueOnce({
      status: "unreachable",
      reason: "timeout",
    });
    await user.type(input, testFeedLink(TEST_FEED_TOKENS.calendar));
    await user.click(
      within(dialog).getByRole("button", { name: "Connect ELMS" }),
    );
    expect(
      await screen.findByText(
        "ELMS took too long to send your calendar. Try again in a minute.",
      ),
    ).toBeVisible();
    expect(track).toHaveBeenCalledWith("todo_connect_result", {
      outcome: "unreachable",
      reason: "timeout",
    });
    client.connect.mockResolvedValueOnce({
      status: "not-a-calendar",
      reason: "http-404",
    });
    await user.type(input, testFeedLink(TEST_FEED_TOKENS.gone));
    await user.click(
      within(dialog).getByRole("button", { name: "Connect ELMS" }),
    );
    expect(
      await screen.findByText(/^ELMS doesn't know that link anymore/),
    ).toBeVisible();
    expect(track).toHaveBeenCalledWith("todo_connect_result", {
      outcome: "not-a-calendar",
      reason: "http-404",
    });
    expect(document.body.innerHTML).not.toContain(TEST_FEED_TOKENS.gone);
  });

  it("says what it's doing while ELMS is asked", async () => {
    const client = fakeClient({ feed: null });
    signedIn();
    renderTodo();
    const user = userEvent.setup();
    let answer: (value: { status: "unreachable"; reason: "timeout" }) => void =
      () => {};
    client.connect.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const dialog = await openElms(user);
    const input = await screen.findByLabelText("ELMS calendar link");
    await user.type(input, testFeedLink(TEST_FEED_TOKENS.calendar));
    await user.click(
      within(dialog).getByRole("button", { name: "Connect ELMS" }),
    );
    expect(
      screen.getByRole("button", { name: "Checking ELMS…" }),
    ).toBeDisabled();
    expect(input).toBeDisabled();
    expect(input).toHaveAccessibleDescription(
      /this can take up to half a minute/,
    );
    answer({ status: "unreachable", reason: "timeout" });
    expect(
      await within(dialog).findByRole("button", { name: "Connect ELMS" }),
    ).toBeVisible();
    expect(input).toHaveAccessibleDescription(/^ELMS took too long/);
  });

  it("says to sign in again when the session's gone", async () => {
    vi.mocked(track).mockClear();
    const client = fakeClient({ feed: null });
    signedIn();
    renderTodo();
    const user = userEvent.setup();
    client.connect.mockRejectedValueOnce(new ApiCallError("unauthorized"));
    const dialog = await openElms(user);
    const input = await screen.findByLabelText("ELMS calendar link");
    await user.type(input, testFeedLink(TEST_FEED_TOKENS.calendar));
    await user.click(
      within(dialog).getByRole("button", { name: "Connect ELMS" }),
    );
    expect(
      await screen.findByText(
        "You've been signed out. Sign in again to connect ELMS.",
      ),
    ).toBeVisible();
    client.connect.mockRejectedValueOnce(new ApiCallError("network"));
    await user.type(input, testFeedLink(TEST_FEED_TOKENS.calendar));
    await user.click(
      within(dialog).getByRole("button", { name: "Connect ELMS" }),
    );
    expect(
      await screen.findByText(
        "That didn't go through. Check your connection and try again.",
      ),
    ).toBeVisible();
    // Our own server's failures aren't ELMS outcomes.
    expect(track).not.toHaveBeenCalledWith(
      "todo_connect_result",
      expect.anything(),
    );
  });
});

describe("ELMS in the sidebar", () => {
  it("says when it last synced, and its settings sync now or take a new link", async () => {
    const client = fakeClient({ items: [aTodoItem()] });
    signedIn();
    renderTodo();
    const header = await screen.findByRole("region", { name: "ELMS" });
    // Chat's pattern: a title, then the line.
    expect(
      within(header).getByRole("heading", { level: 2, name: "Your deadlines" }),
    ).toBeVisible();
    expect(
      await within(header).findByText("ELMS synced 14 minutes ago"),
    ).toBeVisible();
    const user = userEvent.setup();
    const settings = await openElms(user);
    expect(within(settings).getByText("Synced 14 minutes ago.")).toBeVisible();
    await user.click(
      within(settings).getByRole("button", { name: "Sync now" }),
    );
    expect(client.refresh).toHaveBeenCalled();
    // The fake answers "too soon".
    expect(
      await within(settings).findByText(
        "ELMS was synced in the last 5 minutes.",
      ),
    ).toBeVisible();
    // A new link, the same form as connecting.
    const link = testFeedLink(TEST_FEED_TOKENS.calendar);
    await user.type(
      within(settings).getByLabelText("ELMS calendar link"),
      link,
    );
    await user.click(
      within(settings).getByRole("button", { name: "Save the new link" }),
    );
    expect(client.connect).toHaveBeenCalledWith({ url: link });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Disconnecting and files are on /todo/connect.
    await openElms(user);
    expect(
      screen.getByRole("link", { name: "Disconnect or add a file" }),
    ).toHaveAttribute("href", "/todo/connect");
  });

  it("says it's syncing ELMS in words, not with a spinner", async () => {
    const client = fakeClient({
      feed: aTodoFeedState({ lastSuccessAt: "2026-09-28T15:00:00.000Z" }),
      items: [aTodoItem()],
    });
    let answer: (v: Awaited<ReturnType<TodoClient["refresh"]>>) => void =
      () => {};
    client.refresh.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    signedIn();
    renderTodo();
    expect(await screen.findByText("Syncing ELMS…")).toBeVisible();
    act(() => answer({ status: "fetched", feed: aTodoFeedState() }));
    expect(await screen.findByText(/^ELMS synced/)).toBeVisible();
  });

  it("says, in place, when ELMS stopped sharing the link, and takes a new one", async () => {
    fakeClient({ feed: aTodoFeedState({ status: "broken" }), items: [] });
    signedIn();
    renderTodo();
    expect(
      await screen.findByText("ELMS stopped sharing your calendar"),
    ).toBeVisible();
    const settings = await openElms(userEvent.setup());
    expect(
      within(settings).getByText(
        "ELMS stopped sharing your calendar. Paste a new link.",
      ),
    ).toBeVisible();
    expect(within(settings).getByLabelText("ELMS calendar link")).toBeVisible();
  });

  it("keeps file items without ELMS, and offers to connect it", async () => {
    fakeClient({
      feed: null,
      items: [aTodoItem({ uid: "file-1", source: "file", link: null })],
    });
    signedIn();
    renderTodo();
    const connect = await openElms(userEvent.setup());
    expect(
      within(connect).getByText(/Some deadlines came from a file/),
    ).toBeVisible();
    expect(within(connect).getByLabelText("ELMS calendar link")).toBeVisible();
  });
});

describe("the week", () => {
  // Monday, Sep 28: the week runs to Sunday, Oct 4.
  const items: TodoItem[] = [
    aTodoItem(),
    aTodoItem({
      uid: "event-assignment-2",
      title: "WebAssign 5",
      courseLabel: "MATH240-0201: Introduction to Linear Algebra",
      courseCode: "MATH240",
      sectionCode: "0201",
      dueDate: "2026-10-04",
      dueAt: "2026-10-05T03:59:00.000Z",
    }),
    aTodoItem({
      uid: "event-calendar-event-3",
      title: "Midterm 1",
      kind: "event",
      dueDate: "2026-10-02",
      dueAt: "2026-10-02T17:00:00.000Z",
      link: "https://evil.example.com/phish",
    }),
    aTodoItem({
      uid: "file-1",
      source: "file",
      title: "<b>Quiz</b> & notes",
      courseLabel: "Study group",
      courseCode: null,
      sectionCode: null,
      dueDate: "2026-10-01",
      dueAt: null,
      link: null,
    }),
  ];

  it("keeps the family bar, and focus in it, as the account and the week load", async () => {
    fakeClient({ items });
    useAccount.setState({ status: "loading", flags: FLAGS_OFF, user: null });
    renderTodo();
    const feedback = await screen.findByRole("button", { name: "Feedback" });
    feedback.focus();
    act(() => signedIn());
    expect(await screen.findByText("ELMS synced 14 minutes ago")).toBeVisible();
    // The same bar, not a new one: focus stayed where it was.
    expect(feedback.isConnected).toBe(true);
    expect(feedback).toHaveFocus();
  });

  it("is the page's title, Monday to Sunday, with each item on its day", async () => {
    fakeClient({ items });
    signedIn();
    renderTodo();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Sep 28 – Oct 4" }),
    ).toBeVisible();
    // The days are the title's sections: h2s under the h1, as the phone's.
    const days = within(screen.getByRole("region", { name: "The week" }))
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(days[0]).toMatch(/^Mon28/);
    expect(days[6]).toMatch(/^Sun4/);
    const sunday = document.getElementById("day-2026-10-04");
    if (!sunday) throw new Error("no Sunday");
    expect(within(sunday).getByText("WebAssign 5")).toBeVisible();
    expect(
      within(sunday).getByRole("heading", { name: /Sunday, Oct 4: 1 due/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("todo-chip")).toHaveLength(4);
  });

  it("heads every day a step darker than its body, and hovers under the heading", async () => {
    fakeClient({ items });
    signedIn();
    renderTodo();
    await screen.findByRole("heading", { level: 1, name: "Sep 28 – Oct 4" });
    const day = (date: string) => {
      const el = document.getElementById(`day-${date}`);
      if (!el) throw new Error(`no ${date}`);
      return el;
    };
    const head = (date: string) =>
      within(day(date)).getByRole("heading", { level: 2 });
    const add = (date: string) =>
      within(day(date)).getByRole("button", { name: /^Add a task on / });
    // A weekday: one step on its heading, none on its body.
    expect(head("2026-09-29")).toHaveClass("bg-panel");
    expect(day("2026-09-29")).not.toHaveClass("bg-panel", "bg-hover");
    expect(add("2026-09-29")).toHaveClass("hover:bg-panel/50");
    // The weekend: two steps over one.
    for (const date of ["2026-10-03", "2026-10-04"]) {
      expect(head(date)).toHaveClass("bg-hover");
      expect(day(date)).toHaveClass("bg-panel");
      expect(add(date)).toHaveClass("hover:bg-hover/40");
    }
    // Today (Monday, Sep 28): two steps on its heading, none on its body.
    expect(head("2026-09-28")).toHaveClass("bg-hover");
    expect(day("2026-09-28")).not.toHaveClass("bg-panel", "bg-hover");
    expect(day("2026-09-28")).toHaveAttribute("data-day", "today");
  });

  it("moves a week at a time with outline links in the bar, so each week is a URL", async () => {
    fakeClient({ items });
    signedIn();
    renderTodo("2026-10-07");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Oct 5 – Oct 11" }),
    ).toBeVisible();
    const bar = screen.getByRole("banner");
    const back = within(bar).getByRole("link", { name: "Back a week" });
    expect(back).toHaveAttribute("href", "/todo?date=2026-09-28");
    expect(
      within(bar).getByRole("link", { name: "Ahead a week" }),
    ).toHaveAttribute("href", "/todo?date=2026-10-12");
    const today = within(bar).getByRole("link", { name: "Today" });
    expect(today).toHaveAttribute("href", "/todo");
    // Outline buttons, not ghost ones.
    for (const link of [back, today]) expect(link).toHaveClass("border-fg");
    // Nothing else of Todo's is in the bar, and there's one view.
    expect(
      within(bar).queryByRole("button", { name: "Add a task" }),
    ).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Todo views" })).toBeNull();
  });

  it("loads a week the list doesn't hold yet", async () => {
    const client = fakeClient({ items });
    signedIn();
    renderTodo("2027-01-06");
    await screen.findByRole("heading", { level: 1, name: /Jan 4 – Jan 10/ });
    await waitFor(() =>
      expect(client.list).toHaveBeenCalledWith({
        from: "2026-12-07",
        to: "2027-04-05",
      }),
    );
  });

  it("starts on Monday, even for an account that picked Sunday before", async () => {
    showSyncedPrefs({ todo: { weekStart: "sunday" } });
    fakeClient({ items });
    signedIn();
    renderTodo();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Sep 28 – Oct 4" }),
    ).toBeVisible();
    expect(screen.queryByRole("radio", { name: "Sunday" })).toBeNull();
  });

  it("renders what professors write as plain text", async () => {
    fakeClient({ items });
    signedIn();
    renderTodo();
    expect(await screen.findByText("<b>Quiz</b> & notes")).toBeVisible();
    expect(document.querySelector("b")).toBeNull();
  });

  it("checks items off on the week, with Undo", async () => {
    const client = fakeClient({ items });
    signedIn();
    renderTodo();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("checkbox", { name: "Done: Midterm 1" }),
    );
    expect(client.done).toHaveBeenCalledWith({
      uid: "event-calendar-event-3",
      done: true,
    });
    expect(track).toHaveBeenCalledWith("todo_item_checked", {
      done: true,
      via: "week",
    });
    expect(await screen.findByText("Marked Midterm 1 done")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(client.done).toHaveBeenLastCalledWith({
      uid: "event-calendar-event-3",
      done: false,
    });
    expect(
      screen.getByRole("checkbox", { name: "Done: Midterm 1" }),
    ).not.toBeChecked();
  });

  it("puts a check back when the server didn't take it", async () => {
    const client = fakeClient({ items });
    client.done.mockRejectedValueOnce(new Error("offline"));
    signedIn();
    renderTodo();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("checkbox", { name: "Done: Project 2" }),
    );
    expect(await screen.findByText("That didn't save")).toBeVisible();
    expect(
      screen.getByRole("checkbox", { name: "Done: Project 2" }),
    ).not.toBeChecked();
  });

  it("opens an item's details: when, the course, and a link only to ELMS", async () => {
    fakeClient({ items });
    signedIn();
    renderTodo();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Project 2, details" }),
    );
    const details = await screen.findByRole("dialog");
    expect(within(details).getByText("Tomorrow · 11:59pm")).toBeVisible();
    expect(within(details).getByText("From ELMS")).toBeVisible();
    expect(
      within(details).getByRole("link", { name: "Open in ELMS" }),
    ).toHaveAttribute(
      "href",
      "https://elms.umd.edu/courses/1300001/assignments/4410001",
    );
    await user.keyboard("{Escape}");
    await user.click(
      screen.getByRole("button", { name: "Midterm 1, details" }),
    );
    // Not an ELMS link: never offered.
    expect(
      within(await screen.findByRole("dialog")).queryByRole("link"),
    ).toBeNull();
  });
});

describe("the week's progress in the sidebar", () => {
  const week: TodoItem[] = [
    aTodoItem({ uid: "cmsc-a", dueDate: "2026-09-29" }),
    aTodoItem({ uid: "cmsc-b", title: "Lab 5", dueDate: "2026-10-02" }),
    aTodoItem({ uid: "cmsc-old", title: "Lab 4", dueDate: "2026-09-22" }),
    aTodoItem({
      uid: "math-a",
      title: "WebAssign 5",
      courseLabel: "MATH240-0201: Introduction to Linear Algebra",
      courseCode: "MATH240",
      dueDate: "2026-10-01",
    }),
    aTodoItem({
      uid: "club",
      title: "Robotics build night",
      courseLabel: "Terps Robotics Club",
      courseCode: null,
      sectionCode: null,
      dueDate: "2026-09-30",
      link: null,
    }),
  ];

  it("has a bar for the week and one per course, in words too", async () => {
    fakeClient({ items: week, done: ["cmsc-a", "cmsc-old"] });
    signedIn();
    renderTodo();
    const section = await screen.findByRole("region", { name: "This week" });
    const all = await within(section).findByRole("progressbar", {
      name: "This week, every course",
    });
    expect(all).toHaveAttribute("aria-valuetext", "1 of 4 done");
    expect(fillOf(all)).toBe("25%");
    const courses = within(section).getByRole("list", { name: "Courses" });
    const cmsc = within(courses).getByRole("listitem", { name: "CMSC216" });
    expect(within(cmsc).getByText("1 of 2 done")).toBeVisible();
    expect(
      within(cmsc).getByRole("progressbar", { name: "CMSC216 this week" }),
    ).toHaveAttribute("aria-valuetext", "1 of 2 done");
    // No stacked columns of past weeks.
    expect(within(section).queryByRole("img")).toBeNull();
  });

  it("fills the bars as things are checked off, and says so when all's done", async () => {
    fakeClient({ items: week, done: ["cmsc-a"] });
    signedIn();
    renderTodo();
    const section = await screen.findByRole("region", { name: "This week" });
    const cmsc = await within(section).findByRole("progressbar", {
      name: "CMSC216 this week",
    });
    expect(fillOf(cmsc)).toBe("50%");
    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: "Done: Lab 5" }));
    expect(fillOf(cmsc)).toBe("100%");
    expect(cmsc).toHaveAttribute("aria-valuetext", "All 2 done");
    const row = within(section).getByRole("listitem", { name: "CMSC216" });
    expect(within(row).getByText("All 2 done")).toBeVisible();
    expect(
      within(section).getByRole("progressbar", {
        name: "This week, every course",
      }),
    ).toHaveAttribute("aria-valuetext", "2 of 4 done");
    // It slides, unless Reduce Motion is on.
    expect(within(cmsc).getByTestId("progress-fill")).toHaveClass(
      "transition-[width]",
      "motion-reduce:transition-none",
    );
  });

  it("follows the week on screen", async () => {
    fakeClient({ items: week, done: ["cmsc-old"] });
    signedIn();
    renderTodo("2026-09-22");
    const section = await screen.findByRole("region", {
      name: "Week of Sep 21",
    });
    expect(
      await within(section).findByRole("progressbar", {
        name: "Week of Sep 21, every course",
      }),
    ).toHaveAttribute("aria-valuetext", "Done");
  });

  it("hides a course with Undo, and shows it again from its row", async () => {
    const client = fakeClient({ items: week });
    signedIn();
    renderTodo();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Hide Terps Robotics Club" }),
    );
    expect(client.hideCourse).toHaveBeenCalledWith({
      key: "Terps Robotics Club",
      hidden: true,
    });
    expect(screen.queryByText("Robotics build night")).toBeNull();
    // Hidden items count in nothing.
    expect(
      screen.getByRole("progressbar", { name: "This week, every course" }),
    ).toHaveAttribute("aria-valuetext", "0 of 3 done");
    expect(await screen.findByText("Hid Terps Robotics Club")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(client.hideCourse).toHaveBeenLastCalledWith({
      key: "Terps Robotics Club",
      hidden: false,
    });
    expect(await screen.findByText("Robotics build night")).toBeVisible();
  });

  it("starts with the courses hidden on the account, each one a button away", async () => {
    const client = fakeClient({ items: week, hidden: ["MATH240"] });
    signedIn();
    renderTodo();
    const user = userEvent.setup();
    expect(await screen.findByText("Hidden everywhere in Todo")).toBeVisible();
    expect(screen.queryByText("WebAssign 5")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show MATH240" }));
    expect(client.hideCourse).toHaveBeenCalledWith({
      key: "MATH240",
      hidden: false,
    });
    expect(await screen.findByText("WebAssign 5")).toBeVisible();
  });

  it("links each course to its chat room while Chat is on, with Chat's mark", async () => {
    fakeClient({ items: week });
    signedIn(true, "on");
    renderTodo();
    const link = await screen.findByRole("link", {
      name: "View chat for CMSC216",
    });
    expect(link).toHaveAttribute("href", "/chat?term=202608&course=CMSC216");
    expect(link.querySelector('[data-mark="chat"]')).not.toBeNull();
  });

  it("has no chat links while Chat is off", async () => {
    fakeClient({ items: week });
    signedIn();
    renderTodo();
    await screen.findByRole("list", { name: "Courses" });
    expect(screen.queryByRole("link", { name: /^View chat/ })).toBeNull();
  });

  it("links the week to its classes in Schedule", async () => {
    fakeClient({ items: week });
    signedIn();
    renderTodo();
    const section = await screen.findByRole("region", { name: "This week" });
    expect(
      within(section).getByRole("link", { name: "View schedule" }),
    ).toHaveAttribute("href", "/schedule?term=202608");
  });
});

describe("the sidebar's width", () => {
  it("is the workbenches' one width, dragged or keyed, and kept", async () => {
    window.localStorage.setItem("terpsicle:sidebar-width", "400");
    fakeClient({ items: [aTodoItem()] });
    signedIn();
    renderTodo();
    const handle = await screen.findByRole("separator", {
      name: "Sidebar width",
    });
    expect(handle).toHaveAttribute("aria-controls", "todo-sidebar");
    expect(handle).toHaveAttribute("aria-valuenow", "400");
    const user = userEvent.setup();
    handle.focus();
    await user.keyboard("{ArrowRight}");
    expect(handle).toHaveAttribute("aria-valuenow", "416");
    expect(window.localStorage.getItem("terpsicle:sidebar-width")).toBe("416");
    expect(
      document.documentElement.style.getPropertyValue("--sidebar-width"),
    ).toBe("416px");
  });
});

describe("the composer", () => {
  it("reads the date, time and course as they're typed, and adds the task", async () => {
    const client = fakeClient({ items: [aTodoItem()] });
    signedIn();
    renderTodo();
    const user = userEvent.setup();
    const field = await screen.findByRole("textbox", { name: "New task" });
    expect(field).toHaveAttribute("data-private");
    await user.type(field, "PS3 due tomorrow 11:59pm cmsc216");
    const chips = screen.getByRole("list", { name: "The task will be" });
    expect(within(chips).getByText("Tue, Sep 29")).toBeVisible();
    expect(within(chips).getByText("11:59pm")).toBeVisible();
    expect(within(chips).getByText("CMSC216")).toBeVisible();
    // The pickers show what the words said.
    expect(screen.getByLabelText("Due date")).toHaveValue("2026-09-29");
    expect(screen.getByLabelText("Time")).toHaveValue("23:59");
    // The recognized words are marked in the layer behind the field.
    expect(
      [...document.querySelectorAll("mark")].map((m) => m.textContent),
    ).toEqual(["due tomorrow", "11:59pm", "cmsc216"]);
    await user.keyboard("{Enter}");
    expect(client.saveTask).toHaveBeenCalledWith({
      uid: expect.stringMatching(/^own-/),
      title: "PS3",
      courseCode: "CMSC216",
      dueDate: "2026-09-29",
      dueTime: 23 * 60 + 59,
    });
    // Counted without the words.
    expect(track).toHaveBeenCalledWith("todo_task_added", {
      date: true,
      time: true,
      course: true,
      typed: true,
    });
    // The field's ready for the next one, and the task is on its day.
    expect(field).toHaveValue("");
    expect(field).toHaveFocus();
    expect(await screen.findByText("PS3")).toBeVisible();
  });

  it("takes a part off with its chip, leaving its words in the title", async () => {
    const client = fakeClient({ items: [aTodoItem()] });
    signedIn();
    renderTodo();
    const user = userEvent.setup();
    await user.type(
      await screen.findByRole("textbox", { name: "New task" }),
      "Read the Sun Also Rises sun",
    );
    await user.click(screen.getByRole("button", { name: "No date" }));
    expect(screen.queryByRole("list", { name: "The task will be" })).toBeNull();
    await user.keyboard("{Enter}");
    expect(client.saveTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Read the Sun Also Rises sun",
        dueDate: null,
      }),
    );
  });

  it("sets the date, time and course with pickers too", async () => {
    const client = fakeClient({ items: [aTodoItem()] });
    signedIn();
    renderTodo();
    const user = userEvent.setup();
    await user.type(
      await screen.findByRole("textbox", { name: "New task" }),
      "Return library books fri",
    );
    const date = screen.getByLabelText("Due date");
    await user.clear(date);
    await user.type(date, "2026-10-06");
    await user.type(screen.getByLabelText("Time"), "15:30");
    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(client.saveTask).toHaveBeenCalledWith({
      uid: expect.stringMatching(/^own-/),
      // The picker won over "fri", which stays in the title.
      title: "Return library books fri",
      courseCode: null,
      dueDate: "2026-10-06",
      dueTime: 15 * 60 + 30,
    });
  });

  it("starts a task on a day clicked on the week, and with Q", async () => {
    fakeClient({ items: [aTodoItem()] });
    signedIn();
    renderTodo();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Add a task on Wed, Sep 30" }),
    );
    // The sidebar's composer takes the day.
    const field = screen.getByRole("textbox", { name: "New task" });
    await waitFor(() => expect(field).toHaveFocus());
    expect(
      within(screen.getByRole("list", { name: "The task will be" })).getByText(
        "Wed, Sep 30",
      ),
    ).toBeVisible();
    await user.keyboard("{Escape}");
    field.blur();
    await user.keyboard("q");
    await waitFor(() => expect(field).toHaveFocus());
  });

  it("takes a task off again when it didn't save, and says so", async () => {
    const client = fakeClient({ items: [aTodoItem()] });
    client.saveTask.mockRejectedValueOnce(new Error("offline"));
    signedIn();
    renderTodo();
    const user = userEvent.setup();
    await user.type(
      await screen.findByRole("textbox", { name: "New task" }),
      "Buy a lab coat tomorrow{Enter}",
    );
    expect(await screen.findByText("That task didn't save")).toBeVisible();
    expect(screen.queryByText("Buy a lab coat")).toBeNull();
  });
});

describe("the composer, folded", () => {
  it("is the field alone until it's in use, then opens its pickers", async () => {
    fakeClient();
    render(
      <TooltipProvider delayDuration={0}>
        <Composer courses={["CMSC216"]} colors={{}} compact />
        <button type="button">elsewhere</button>
      </TooltipProvider>,
    );
    const user = userEvent.setup();
    const field = screen.getByRole("textbox", { name: "New task" });
    expect(screen.getByText(/^Try “PS3 due fri/)).toBeVisible();
    expect(screen.queryByLabelText("Due date")).not.toBeVisible();
    await user.click(field);
    expect(screen.getByLabelText("Due date")).toBeVisible();
    // Left empty, it folds up again.
    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(screen.queryByLabelText("Due date")).not.toBeVisible();
    // With words in it, it stays open.
    await user.type(field, "PS3 tomorrow");
    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(screen.getByLabelText("Due date")).toBeVisible();
    expect(
      screen.getByRole("list", { name: "The task will be" }),
    ).toBeVisible();
  });
});

describe("your own tasks", () => {
  // Tuesday, Sep 29, 2pm in New York.
  const office = anOwnTask({
    uid: "own-office-hours-0001",
    title: "Office hours",
    courseCode: "CMSC216",
    dueDate: "2026-09-29",
    dueAt: "2026-09-29T18:00:00.000Z",
  });

  it("lists tasks with no date in the sidebar, under the composer", async () => {
    fakeClient({ items: [aTodoItem(), anOwnTask()] });
    signedIn();
    renderTodo();
    const section = await within(
      await screen.findByRole("complementary", { name: "Sidebar" }),
    ).findByRole("region", { name: "No date" });
    expect(
      within(section).getByText("Email Dr. Kim about the lab"),
    ).toBeVisible();
  });

  it("changes a task's title and date from its details", async () => {
    const client = fakeClient({ items: [office] });
    signedIn();
    renderTodo();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Office hours, details" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Office hours options" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    const title = await screen.findByRole("textbox", { name: "Title" });
    await user.clear(title);
    await user.type(title, "Office hours, bring Project 2");
    const details = screen.getByRole("dialog");
    await user.clear(within(details).getByLabelText("Due date"));
    await user.click(within(details).getByRole("button", { name: "Save" }));
    expect(client.saveTask).toHaveBeenCalledWith({
      uid: office.uid,
      title: "Office hours, bring Project 2",
      courseCode: "CMSC216",
      dueDate: null,
      dueTime: null,
    });
    expect(
      await screen.findByRole("region", { name: "No date" }),
    ).toBeVisible();
  });

  it("deletes a task at once, and Undo puts it back as it was, done and all", async () => {
    const client = fakeClient({ items: [office], done: [office.uid] });
    signedIn();
    renderTodo();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Office hours, details" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Office hours options" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    expect(screen.queryByText("Office hours")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(client.deleteTask).toHaveBeenCalledWith({ uid: office.uid });
    expect(await screen.findByText("Deleted Office hours")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(client.done).toHaveBeenCalledWith({
        uid: office.uid,
        done: true,
      }),
    );
    expect(client.saveTask).toHaveBeenCalledWith({
      uid: office.uid,
      title: "Office hours",
      courseCode: "CMSC216",
      dueDate: "2026-09-29",
      dueTime: 14 * 60,
    });
    expect(await screen.findByText("Office hours")).toBeVisible();
  });
});

describe("the connect page", () => {
  it("disconnects at once with Undo, and no dialog", async () => {
    const client = fakeClient({ items: [aTodoItem()] });
    signedIn();
    wrap(<ConnectPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Disconnect" }));
    expect(screen.getByLabelText("ELMS calendar link")).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(await screen.findByText("ELMS disconnected")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText(/ELMS is connected/)).toBeVisible();
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it("sends a waiting disconnect when the page goes away", async () => {
    const client = fakeClient({ items: [aTodoItem()] });
    signedIn();
    wrap(<ConnectPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Disconnect" }));
    window.dispatchEvent(new Event("pagehide"));
    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });

  it("is named ELMS link once connected, and Connect ELMS before", async () => {
    fakeClient({ items: [aTodoItem()] });
    signedIn();
    wrap(<ConnectPage />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "ELMS link" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "See your calendar" }),
    ).toHaveAttribute("href", "/todo");
  });

  it("is named Connect ELMS while there's no link", async () => {
    fakeClient({ feed: null });
    signedIn();
    wrap(<ConnectPage />);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Connect ELMS" }),
    ).toBeVisible();
  });

  it("reads a dropped file here and sends only its items", async () => {
    const client = fakeClient();
    signedIn();
    wrap(<ConnectPage />);
    const user = userEvent.setup();
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:file-1",
      "DTSTART:20261002T035900Z",
      "SUMMARY:Homework 4 [MATH240-0201: Linear Algebra]",
      "DESCRIPTION:Submit on the course site (secret notes)",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const file = new File([ics], "deadlines.ics", { type: "text/calendar" });
    await user.upload(
      await screen.findByTitle("Choose a calendar file (.ics)"),
      file,
    );
    await waitFor(() => expect(client.importFile).toHaveBeenCalledTimes(1));
    const sent = JSON.stringify(client.importFile.mock.calls[0]);
    expect(sent).toContain("Homework 4");
    expect(sent).not.toContain("secret notes");
    expect(sent).not.toContain("BEGIN:VCALENDAR");
    expect(await screen.findByText(importWords(2, 1))).toBeVisible();
  });

  it("says when a file isn't a calendar", async () => {
    const client = fakeClient();
    signedIn();
    wrap(<ConnectPage />);
    const user = userEvent.setup();
    await user.upload(
      await screen.findByTitle("Choose a calendar file (.ics)"),
      new File(["hello"], "notes.ics"),
    );
    expect(
      await screen.findByText("That file isn't a calendar. Pick an .ics file."),
    ).toBeVisible();
    expect(client.importFile).not.toHaveBeenCalled();
  });
});

describe("importWords", () => {
  it("counts in plain words", () => {
    expect(importWords(1, 0)).toBe("Added 1 deadline from the file.");
    expect(importWords(0, 0)).toBe("Nothing new to add from that file.");
    expect(importWords(12, 1)).toBe(
      "Added 12 deadlines from the file. 1 deadline was already on your ELMS feed or too far from today, so we left it out.",
    );
  });
});
