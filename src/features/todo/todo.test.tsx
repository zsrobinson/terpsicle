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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "~/app/analytics";
import type {
  Flags,
  TodoFeedState,
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
import { anOwnTask, aTodoFeedState, aTodoItem } from "~/fixtures";
import { ApiCallError } from "~/server/fns/api";
import { Toaster } from "~/ui/sonner";
import { TooltipProvider } from "~/ui/tooltip";
import { ConnectPage } from "./connect-page";
import { importWords } from "./file-drop";
import { TodoPage, type TodoView } from "./todo-page";
import { resetTodo, setTodoClient, type TodoClient } from "./todo-store";

// 2026-09-25 is a Friday in New York; the fixture item is due Tuesday the 29th.

vi.mock("~/app/analytics", async (original) => ({
  ...(await original<typeof import("~/app/analytics")>()),
  track: vi.fn(),
}));

const NOW = "2026-09-25T16:00:00.000Z";

function fakeClient(list: Partial<TodoListResult> = {}) {
  let answer: TodoListResult = {
    feed: aTodoFeedState({ lastSuccessAt: "2026-09-25T15:46:00.000Z" }),
    items: [],
    done: [],
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
      avatarUrl: null,
      isAdmin: false,
      createdAt: "2026-09-01T00:00:00.000Z",
    },
  });
}

function renderTodo(view: TodoView = "day") {
  return wrap(<TodoPage view={view} />);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  resetTodo();
});

afterEach(() => {
  vi.useRealTimers();
  useAccount.setState({ status: "loading", flags: FLAGS_OFF, user: null });
});

describe("who's looking", () => {
  it("shows the front door when signed out, with sign-in and a sample", async () => {
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
        name: "Your deadlines and exams, in one list",
      }),
    ).toBeVisible();
    expect(document.querySelector('[data-mark="todo"]')).not.toBeNull();
    // Says up front what you'll need after signing in.
    expect(
      screen.getByText(/Sign in, then paste your ELMS calendar link/),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Sign in with Google" }),
    ).toHaveAttribute("href", expect.stringContaining("return=%2Ftodo"));
    const sample = screen.getByRole("list", { name: "A sample list" });
    // A sample, named as one: nothing says "Mark done" on it.
    expect(
      within(sample).getByRole("checkbox", { name: "Sample: Project 2" }),
    ).toBeDisabled();
    expect(client.list).not.toHaveBeenCalled();
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

  it("is the first-visit template until ELMS is connected, with the paste right there", async () => {
    fakeClient({ feed: null });
    signedIn();
    renderTodo();
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Connect ELMS to see your deadlines",
      }),
    ).toBeVisible();
    expect(document.querySelector('[data-mark="todo"]')).not.toBeNull();
    // Step one opens ELMS in a new tab, so the paste is still here after.
    const step = screen.getByRole("link", { name: "Open your ELMS calendar" });
    expect(step).toHaveAttribute(
      "href",
      "https://umd.instructure.com/calendar",
    );
    expect(step).toHaveAttribute("target", "_blank");
    expect(step).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByLabelText("ELMS calendar link")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "or add a calendar file" }),
    ).toHaveAttribute("href", "/todo/connect");
  });
});

describe("connecting", () => {
  it("checks the link's shape here, and never sends a bad one", async () => {
    const client = fakeClient({ feed: null });
    signedIn();
    renderTodo();
    const user = userEvent.setup();
    const input = await screen.findByLabelText("ELMS calendar link");
    expect(input).toHaveAttribute("type", "url");
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input).toHaveAttribute("spellcheck", "false");
    expect(input).toHaveAttribute("data-private");
    expect(input).toHaveClass("ph-no-capture");
    await user.type(input, "https://example.com/feed.ics");
    await user.click(screen.getByRole("button", { name: "Connect ELMS" }));
    expect(screen.getByText(/That isn't an ELMS calendar link/)).toBeVisible();
    expect(client.connect).not.toHaveBeenCalled();
    expect(input).toHaveValue("");
  });

  it("sends a feed link once, clears it, and shows the list", async () => {
    const client = fakeClient({ feed: null });
    signedIn();
    renderTodo();
    const user = userEvent.setup();
    const link = testFeedLink(TEST_FEED_TOKENS.calendar);
    const input = await screen.findByLabelText("ELMS calendar link");
    await user.type(input, link);
    client.answer({ feed: aTodoFeedState(), items: [aTodoItem()] });
    await user.click(screen.getByRole("button", { name: "Connect ELMS" }));
    expect(client.connect).toHaveBeenCalledWith({ url: link });
    expect(await screen.findByText("Project 2")).toBeVisible();
    expect(document.body.innerHTML).not.toContain(TEST_FEED_TOKENS.calendar);
  });

  it("says why ELMS didn't take it, and tracks only the codes", async () => {
    const client = fakeClient({ feed: null });
    signedIn();
    renderTodo();
    const user = userEvent.setup();
    const input = await screen.findByLabelText("ELMS calendar link");
    client.connect.mockResolvedValueOnce({
      status: "unreachable",
      reason: "timeout",
    });
    await user.type(input, testFeedLink(TEST_FEED_TOKENS.calendar));
    await user.click(screen.getByRole("button", { name: "Connect ELMS" }));
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
    await user.click(screen.getByRole("button", { name: "Connect ELMS" }));
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
    const input = await screen.findByLabelText("ELMS calendar link");
    await user.type(input, testFeedLink(TEST_FEED_TOKENS.calendar));
    await user.click(screen.getByRole("button", { name: "Connect ELMS" }));
    expect(
      screen.getByRole("button", { name: "Checking ELMS…" }),
    ).toBeDisabled();
    expect(input).toBeDisabled();
    expect(input).toHaveAccessibleDescription(
      /this can take up to half a minute/,
    );
    answer({ status: "unreachable", reason: "timeout" });
    expect(
      await screen.findByRole("button", { name: "Connect ELMS" }),
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
    const input = await screen.findByLabelText("ELMS calendar link");
    await user.type(input, testFeedLink(TEST_FEED_TOKENS.calendar));
    await user.click(screen.getByRole("button", { name: "Connect ELMS" }));
    expect(
      await screen.findByText(
        "You've been signed out. Sign in again to connect ELMS.",
      ),
    ).toBeVisible();
    client.connect.mockRejectedValueOnce(new ApiCallError("network"));
    await user.type(input, testFeedLink(TEST_FEED_TOKENS.calendar));
    await user.click(screen.getByRole("button", { name: "Connect ELMS" }));
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

describe("the list", () => {
  const items: TodoItem[] = [
    aTodoItem(),
    aTodoItem({
      uid: "event-assignment-2",
      title: "WebAssign 5",
      courseLabel: "MATH240-0201: Introduction to Linear Algebra",
      courseCode: "MATH240",
      sectionCode: "0201",
      gradescope: true,
      dueDate: "2026-09-26",
      dueAt: "2026-09-27T03:59:00.000Z",
    }),
    aTodoItem({
      uid: "event-calendar-event-3",
      title: "Midterm 1",
      kind: "event",
      exam: true,
      dueDate: "2026-09-25",
      dueAt: "2026-09-25T17:00:00.000Z",
      link: "https://evil.example.com/phish",
    }),
    aTodoItem({
      uid: "file-1",
      source: "file",
      title: "<b>Quiz</b> & notes",
      courseLabel: "Study group",
      courseCode: null,
      sectionCode: null,
      dueDate: "2026-10-09",
      dueAt: null,
      link: null,
    }),
  ];

  it("keeps the family bar, and focus in it, as the account and the list load", async () => {
    fakeClient({ items });
    useAccount.setState({ status: "loading", flags: FLAGS_OFF, user: null });
    renderTodo();
    const feedback = await screen.findByRole("button", { name: "Feedback" });
    feedback.focus();
    act(() => signedIn());
    expect(
      await screen.findByText("4 open · ELMS feed checked 14 min ago"),
    ).toBeVisible();
    // The same bar, not a new one: focus stayed where it was.
    expect(feedback.isConnected).toBe(true);
    expect(feedback).toHaveFocus();
  });

  it("reads like the plan: open count, when ELMS was checked, and the days", async () => {
    fakeClient({ items });
    signedIn();
    renderTodo();
    expect(
      await screen.findByText("4 open · ELMS feed checked 14 min ago"),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Today" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Tomorrow" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Next week" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Later" })).toBeVisible();
    expect(screen.getByText("Nothing due this week.")).toBeVisible();

    const midterm = screen.getByText("Midterm 1").closest("li");
    if (!midterm) throw new Error("no row");
    expect(within(midterm).getByText("1pm")).toBeVisible();
    expect(within(midterm).getByText("Exam")).toBeVisible();
    expect(within(midterm).getByText("From ELMS")).toBeVisible();
    // Only ELMS links are links.
    expect(within(midterm).queryByRole("link")).toBeNull();

    const project = screen.getByText("Project 2").closest("li");
    if (!project) throw new Error("no row");
    expect(
      within(project).getByRole("link", { name: "Open Project 2 in ELMS" }),
    ).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(project).getByText("CMSC216")).toBeVisible();
    expect(within(project).getByText("11:59pm")).toBeVisible();

    const webassign = screen.getByText("WebAssign 5").closest("li");
    if (!webassign) throw new Error("no row");
    expect(within(webassign).getByText("Gradescope")).toBeVisible();
    expect(
      within(webassign).getByText(/Extensions you get in Gradescope/),
    ).toBeVisible();
  });

  describe("the Gradescope extensions note", () => {
    const gradescope: TodoItem[] = [
      aTodoItem({ uid: "gs-project", gradescope: true }),
      aTodoItem({
        uid: "gs-homework",
        title: "Homework 4",
        courseLabel: "MATH240-0201: Introduction to Linear Algebra",
        courseCode: "MATH240",
        sectionCode: "0201",
        gradescope: true,
        dueDate: "2026-09-28",
        dueAt: "2026-09-29T03:59:00.000Z",
      }),
      aTodoItem({
        uid: "gs-lab",
        title: "Lab 7",
        gradescope: true,
        dueDate: "2026-10-02",
        dueAt: "2026-10-03T03:59:00.000Z",
      }),
      aTodoItem({ uid: "plain", title: "Reading response 3" }),
    ];
    const notes = () =>
      screen.queryAllByText(/Extensions you get in Gradescope/);
    const rowOf = (title: string) => {
      const row = screen.getByText(title).closest("li");
      if (!row) throw new Error(`no row for ${title}`);
      return row;
    };

    it("says it once, under the first Gradescope item still to do", async () => {
      fakeClient({ items: gradescope });
      signedIn();
      renderTodo();
      await screen.findByText("Homework 4");
      expect(screen.getAllByText("Gradescope")).toHaveLength(3);
      expect(notes()).toHaveLength(1);
      expect(
        within(rowOf("Homework 4")).getByText(/Extensions you get/),
      ).toBeVisible();

      // Checked off, it hands the note to the next one.
      const user = userEvent.setup();
      await user.click(
        screen.getByRole("checkbox", { name: "Done: Homework 4" }),
      );
      expect(notes()).toHaveLength(1);
      expect(
        within(rowOf("Project 2")).getByText(/Extensions you get/),
      ).toBeVisible();
    });

    it("says it once by course too", async () => {
      fakeClient({ items: gradescope });
      signedIn();
      renderTodo("course");
      await screen.findByText("Homework 4");
      expect(notes()).toHaveLength(1);
    });
  });

  it("renders what professors write as plain text", async () => {
    fakeClient({ items });
    signedIn();
    renderTodo();
    expect(await screen.findByText("<b>Quiz</b> & notes")).toBeVisible();
    expect(document.querySelector("b")).toBeNull();
    const row = screen.getByText("<b>Quiz</b> & notes").closest("li");
    if (!row) throw new Error("no row");
    expect(within(row).getByText("From a file")).toBeVisible();
    expect(within(row).getByText("All day")).toBeVisible();
    expect(within(row).getByText("Study group")).toBeVisible();
  });

  it("checks items off, folding them into the day's done count", async () => {
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
    expect(screen.queryByText("Midterm 1")).toBeNull();
    expect(
      screen.getByText("3 open · ELMS feed checked 14 min ago"),
    ).toBeVisible();
    const fold = screen.getByRole("button", { name: "1 done" });
    await user.click(fold);
    expect(fold).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("checkbox", { name: "Done: Midterm 1" }),
    ).toBeChecked();
  });

  it("says what a check did, and Undo puts the item back", async () => {
    const client = fakeClient({ items });
    signedIn();
    renderTodo();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("checkbox", { name: "Done: Midterm 1" }),
    );
    expect(await screen.findByText("Marked Midterm 1 done")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(client.done).toHaveBeenLastCalledWith({
      uid: "event-calendar-event-3",
      done: false,
    });
    expect(
      screen.getByRole("checkbox", { name: "Done: Midterm 1" }),
    ).not.toBeChecked();
    expect(screen.queryByRole("button", { name: "1 done" })).toBeNull();
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

  it("says when everything's done", async () => {
    fakeClient({ items: [aTodoItem()], done: [aTodoItem().uid] });
    signedIn();
    renderTodo();
    expect(await screen.findByText("You're all caught up.")).toBeVisible();
    expect(
      screen.getByText("0 open · ELMS feed checked 14 min ago"),
    ).toBeVisible();
  });

  it("groups by course", async () => {
    fakeClient({ items });
    signedIn();
    renderTodo("course");
    const cmsc = await screen.findByRole("region", { name: "CMSC216" });
    expect(within(cmsc).getByText("2 open")).toBeVisible();
    expect(within(cmsc).getByText("Tuesday, Sep 29 · 11:59pm")).toBeVisible();
    expect(within(cmsc).getByText("Today · 1pm")).toBeVisible();
    expect(screen.getByRole("region", { name: "Study group" })).toBeVisible();
  });

  it("links each course to its chat room while Chat is on (View chat)", async () => {
    fakeClient({ items });
    signedIn(true, "on");
    renderTodo("course");
    const cmsc = await screen.findByRole("region", { name: "CMSC216" });
    // Due in Fall 2026, so Fall 2026's room.
    expect(
      within(cmsc).getByRole("link", { name: "View chat" }),
    ).toHaveAttribute("href", "/chat?term=202608&course=CMSC216");
    const user = userEvent.setup();
    await user.click(within(cmsc).getByRole("link", { name: "View chat" }));
    expect(track).toHaveBeenCalledWith("cross_link_clicked", {
      from: "todo",
      to: "chat",
    });
    // Not from a course: no room to go to.
    expect(
      within(screen.getByRole("region", { name: "Study group" })).queryByRole(
        "link",
      ),
    ).toBeNull();
  });

  it("has no View chat while Chat is off", async () => {
    fakeClient({ items });
    signedIn();
    renderTodo("course");
    await screen.findByRole("region", { name: "CMSC216" });
    expect(screen.queryByRole("link", { name: "View chat" })).toBeNull();
  });

  it("changes view with the switch: each view is a URL", async () => {
    fakeClient({ items });
    signedIn();
    const router = renderTodo();
    const views = await screen.findByRole("navigation", {
      name: "Todo views",
    });
    const byCourse = within(views).getByRole("link", { name: "By course" });
    expect(byCourse).toHaveAttribute("href", "/todo?view=course");
    expect(within(views).getByRole("link", { name: "Week" })).toHaveAttribute(
      "href",
      "/todo?view=week",
    );
    expect(within(views).getByRole("link", { name: "By day" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await userEvent.setup().click(byCourse);
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ view: "course" }),
    );
  });

  it("says it's checking ELMS in words, not with a spinner", async () => {
    const client = fakeClient({ items });
    let answer = () => {};
    client.refresh.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = () =>
            resolve({ status: "too-soon", feed: aTodoFeedState() });
        }),
    );
    signedIn();
    renderTodo();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Check ELMS now" }),
    );
    expect(screen.getByText("4 open · Checking ELMS…")).toBeVisible();
    expect(document.querySelector(".animate-spin")).toBeNull();
    answer();
    expect(
      await screen.findByText("ELMS was checked in the last 5 minutes."),
    ).toBeVisible();
  });

  it("shows the week with the Due lane", async () => {
    fakeClient({ items });
    signedIn();
    renderTodo("week");
    expect(
      await screen.findByRole("heading", { name: "Sep 21 – Sep 27" }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("todo-chip")).toHaveLength(2);
    // The week's classes, in the term it falls in.
    expect(screen.getByRole("link", { name: "View schedule" })).toHaveAttribute(
      "href",
      "/schedule?term=202608",
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Ahead a week" }));
    expect(
      screen.getByRole("heading", { name: "Sep 28 – Oct 4" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "View schedule" }));
    expect(track).toHaveBeenCalledWith("cross_link_clicked", {
      from: "todo",
      to: "schedule",
    });
  });

  it("opens on the coming week at the weekend, and steps back to the one ending", async () => {
    vi.setSystemTime(new Date("2026-09-27T16:00:00.000Z")); // a Sunday
    fakeClient({ items });
    signedIn();
    renderTodo("week");
    expect(
      await screen.findByRole("heading", { name: "Sep 28 – Oct 4" }),
    ).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Back a week" }));
    expect(
      screen.getByRole("heading", { name: "Sep 21 – Sep 27" }),
    ).toBeInTheDocument();
  });

  it("asks ELMS again on open when the last read is old, and says when it's too soon", async () => {
    const client = fakeClient({
      items,
      feed: aTodoFeedState({ lastSuccessAt: "2026-09-25T13:00:00.000Z" }),
    });
    signedIn();
    renderTodo();
    await waitFor(() => expect(client.refresh).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText("ELMS was checked in the last 5 minutes."),
    ).toBeVisible();
  });

  it("says, in place, when ELMS stopped sharing the link", async () => {
    const feed: TodoFeedState = aTodoFeedState({ status: "broken" });
    fakeClient({ items, feed });
    signedIn();
    renderTodo();
    expect(
      await screen.findByText(/ELMS stopped sharing your calendar/),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Paste a new link" }),
    ).toHaveAttribute("href", "/todo/connect");
    expect(screen.queryByRole("button", { name: "Check ELMS now" })).toBeNull();
  });

  it("keeps file items after a disconnect and offers ELMS", async () => {
    fakeClient({ items: [items[3] as TodoItem], feed: null });
    signedIn();
    renderTodo();
    expect(await screen.findByText(/These came from a file/)).toBeVisible();
    expect(screen.getByText("1 open")).toBeVisible();
  });
});

describe("your own tasks", () => {
  // Friday, Sep 25 2026 in New York.
  const office = anOwnTask({
    uid: "own-office-hours-0001",
    title: "Office hours",
    courseCode: "CMSC216",
    dueDate: "2026-09-26",
    dueAt: "2026-09-26T18:00:00.000Z",
  });

  it("adds a task from the top of the list, with a date and time, and counts it without its words", async () => {
    const client = fakeClient({ items: [aTodoItem()] });
    signedIn();
    renderTodo();
    const user = userEvent.setup();
    const title = await screen.findByRole("textbox", { name: "New task" });
    // The date, time and course wait until there's a task to date.
    expect(screen.queryByLabelText("Due date")).toBeNull();
    await user.type(title, "Return library books");
    await user.type(screen.getByLabelText("Due date"), "2026-09-26");
    await user.type(screen.getByLabelText("Time"), "15:30");
    await user.type(title, "{Enter}");

    expect(client.saveTask).toHaveBeenCalledWith({
      uid: expect.stringMatching(/^own-/),
      title: "Return library books",
      courseCode: null,
      dueDate: "2026-09-26",
      dueTime: 15 * 60 + 30,
    });
    expect(track).toHaveBeenCalledWith("todo_task_added", {
      date: true,
      time: true,
      course: false,
    });
    const row = (await screen.findByText("Return library books")).closest("li");
    if (!row) throw new Error("no row");
    expect(within(row).getByText("Yours")).toBeVisible();
    expect(within(row).getByText("3:30pm")).toBeVisible();
    // Ready for the next one.
    expect(title).toHaveValue("");
    expect(title).toHaveFocus();
  });

  it("lists a task with no date under No date, at the bottom", async () => {
    fakeClient({ items: [aTodoItem(), anOwnTask()] });
    signedIn();
    renderTodo();
    const heading = await screen.findByRole("heading", { name: "No date" });
    const section = heading.closest("section");
    if (!section) throw new Error("no section");
    expect(
      within(section).getByText("Email Dr. Kim about the lab"),
    ).toBeVisible();
    expect(
      [...document.querySelectorAll("h2")].map((h) => h.textContent).at(-1),
    ).toBe("No date");
  });

  it("shows tasks with no date under the week, and dated ones in their day", async () => {
    fakeClient({ items: [office, anOwnTask()] });
    signedIn();
    renderTodo("week");
    const lane = await screen.findByRole("list", { name: "Due 2026-09-26" });
    expect(within(lane).getByText("Office hours")).toBeVisible();
    // The week's own (a phone's day list is in the page too, hidden by CSS).
    const undated = document
      .getElementById("todo-week-no-date")
      ?.closest("section");
    if (!undated) throw new Error("no section");
    expect(
      within(undated).getByText("Email Dr. Kim about the lab"),
    ).toBeVisible();
  });

  it("changes a task's title and date in place", async () => {
    const client = fakeClient({ items: [office] });
    signedIn();
    renderTodo();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Office hours options" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    const title = screen.getByRole("textbox", { name: "Title" });
    expect(title).toHaveFocus();
    await user.clear(title);
    await user.type(title, "Office hours, bring Project 2");
    await user.clear(screen.getByLabelText("Due date"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(client.saveTask).toHaveBeenCalledWith({
      uid: office.uid,
      title: "Office hours, bring Project 2",
      courseCode: "CMSC216",
      dueDate: null,
      dueTime: null,
    });
    expect(
      await screen.findByText("Office hours, bring Project 2"),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "No date" })).toBeVisible();
  });

  it("leaves an edit with Esc, as it was", async () => {
    const client = fakeClient({ items: [office] });
    signedIn();
    renderTodo();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: "Office hours options" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Edit" }));
    await user.type(screen.getByRole("textbox", { name: "Title" }), "!!");
    await user.keyboard("{Escape}");
    expect(screen.getByText("Office hours")).toBeVisible();
    expect(client.saveTask).not.toHaveBeenCalled();
  });

  it("deletes a task at once, and Undo puts it back as it was, done and all", async () => {
    const client = fakeClient({ items: [office], done: [office.uid] });
    signedIn();
    renderTodo();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "1 done" }));
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
      dueDate: "2026-09-26",
      dueTime: 14 * 60,
    });
    expect(await screen.findByText("Office hours")).toBeVisible();
  });

  it("takes a task off again when it didn't save, and says so", async () => {
    const client = fakeClient({ items: [aTodoItem()] });
    client.saveTask.mockRejectedValueOnce(new Error("offline"));
    signedIn();
    renderTodo();
    const user = userEvent.setup();
    await user.type(
      await screen.findByRole("textbox", { name: "New task" }),
      "Buy a lab coat{Enter}",
    );
    expect(await screen.findByText("That task didn't save")).toBeVisible();
    expect(screen.queryByText("Buy a lab coat")).toBeNull();
  });

  it("starts a list without ELMS from the first visit", async () => {
    fakeClient({ feed: null, items: [] });
    signedIn();
    renderTodo();
    const user = userEvent.setup();
    await screen.findByRole("heading", {
      name: "Connect ELMS to see your deadlines",
    });
    await user.type(
      screen.getByRole("textbox", { name: "New task" }),
      "Email my advisor{Enter}",
    );
    expect(
      await screen.findByRole("heading", { name: "Deadlines and exams" }),
    ).toBeVisible();
    expect(screen.getByText("Email my advisor")).toBeVisible();
    expect(
      screen.getByText(/to see your deadlines beside your tasks/),
    ).toBeVisible();
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
      screen.getByRole("link", { name: "See your deadlines" }),
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

  it("says what Gradescope does and doesn't send", async () => {
    fakeClient();
    signedIn();
    wrap(<ConnectPage />);
    expect(
      await screen.findByText(
        "Extensions you get in Gradescope don't show up in ELMS. Check Gradescope for your own due date.",
      ),
    ).toBeVisible();
    expect(
      screen.getByText(/We never ask for your Gradescope or ELMS password/),
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
      "UID:gs-1",
      "DTSTART:20261002T035900Z",
      "SUMMARY:Homework 4 [MATH240-0201: Linear Algebra]",
      "DESCRIPTION:Submit on https://www.gradescope.com/courses/1 (secret notes)",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const file = new File([ics], "gradescope.ics", { type: "text/calendar" });
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
