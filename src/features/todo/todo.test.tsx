import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TodoFeedState, TodoItem, TodoListResult } from "~/core/schema";
import { TEST_FEED_TOKENS, testFeedLink } from "~/core/todo";
import { FLAGS_OFF, useAccount } from "~/features/auth/account-store";
import { aTodoFeedState, aTodoItem } from "~/fixtures";
import { Toaster } from "~/ui/sonner";
import { TooltipProvider } from "~/ui/tooltip";
import { ConnectPage } from "./connect-page";
import { importWords } from "./file-drop";
import { TodoPage, type TodoView } from "./todo-page";
import { resetTodo, setTodoClient, type TodoClient } from "./todo-store";

// 2026-09-25 is a Friday in New York; the fixture item is due Tuesday the 29th.
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
  });
  return render(
    <TooltipProvider delayDuration={0}>
      <RouterProvider router={router} />
      <Toaster />
    </TooltipProvider>,
  );
}

function signedIn(on = true) {
  useAccount.setState({
    status: "signed-in",
    flags: { ...FLAGS_OFF, signIn: true, todo: on },
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

function renderTodo(view: TodoView = "day", onViewChange = vi.fn()) {
  wrap(<TodoPage view={view} onViewChange={onViewChange} />);
  return onViewChange;
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
    expect(
      await screen.findByText(/Sign in to see your ELMS deadlines here/),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Sign in with Google" }),
    ).toHaveAttribute("href", expect.stringContaining("return=%2Ftodo"));
    const sample = screen.getByRole("list", { name: "A sample list" });
    expect(within(sample).getAllByRole("checkbox")[0]).toBeDisabled();
    expect(client.list).not.toHaveBeenCalled();
  });

  it("says it's coming when Todo is off", async () => {
    fakeClient();
    signedIn(false);
    renderTodo();
    expect(
      await screen.findByRole("heading", { name: "Terpsicle Todo" }),
    ).toBeVisible();
    expect(screen.getByText(/Coming soon/)).toBeVisible();
  });

  it("shows the three steps inline until ELMS is connected", async () => {
    fakeClient({ feed: null });
    signedIn();
    renderTodo();
    expect(
      await screen.findByRole("heading", { name: "Connect ELMS" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Click Calendar Feed at the bottom right and copy the link.",
      ),
    ).toBeVisible();
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

  it("says why ELMS didn't take it", async () => {
    const client = fakeClient({ feed: null });
    signedIn();
    renderTodo();
    const user = userEvent.setup();
    const input = await screen.findByLabelText("ELMS calendar link");
    client.connect.mockResolvedValueOnce({ status: "unreachable" });
    await user.type(input, testFeedLink(TEST_FEED_TOKENS.calendar));
    await user.click(screen.getByRole("button", { name: "Connect ELMS" }));
    expect(
      await screen.findByText("ELMS didn't answer. Try again in a minute."),
    ).toBeVisible();
    client.connect.mockResolvedValueOnce({ status: "not-a-calendar" });
    await user.type(input, testFeedLink(TEST_FEED_TOKENS.gone));
    await user.click(screen.getByRole("button", { name: "Connect ELMS" }));
    expect(
      await screen.findByText(/ELMS didn't send a calendar for that link/),
    ).toBeVisible();
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

  it("changes view with the switch", async () => {
    fakeClient({ items });
    signedIn();
    const onViewChange = renderTodo();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "By course" }));
    expect(onViewChange).toHaveBeenCalledWith("course");
    expect(screen.getByRole("button", { name: "By day" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows the week with the Due lane", async () => {
    fakeClient({ items });
    signedIn();
    renderTodo("week");
    expect(
      await screen.findByRole("heading", { name: "Sep 21 – Sep 27" }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("todo-chip")).toHaveLength(2);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Ahead a week" }));
    expect(
      screen.getByRole("heading", { name: "Sep 28 – Oct 4" }),
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
      "Added 12 deadlines from the file. 1 item was already on your ELMS feed or too far from today, so we left it out.",
    );
  });
});
