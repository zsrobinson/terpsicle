import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FLAGS_OFF, useAccount } from "~/features/auth/account-store";
import { aMeUser, anInboxItem } from "~/fixtures";
import { notificationsApi } from "~/server/fns/notifications";
import { renderInRouter } from "~/ui/test-utils";
import { NotificationsBell } from "./bell";
import { forgetInbox } from "./inbox";
import { useUnread } from "./unread-store";

vi.mock("~/app/analytics", () => ({ track: vi.fn() }));
vi.mock("~/server/fns/notifications", () => ({
  notificationsApi: { inbox: vi.fn(), read: vi.fn(), unread: vi.fn() },
}));

const api = vi.mocked(notificationsApi);

const minutesAgo = (m: number) =>
  new Date(Date.now() - m * 60_000).toISOString();

const mention = anInboxItem({ id: "n1", createdAt: minutesAgo(2) });
const seat = anInboxItem({
  id: "n2",
  type: "seat-open",
  product: "schedule",
  title: "A seat opened in CMSC351 0101",
  body: "2 of 40 open. Register on Testudo before it's gone.",
  url: "/schedule/course/CMSC351?term=202608",
  createdAt: minutesAgo(4),
});
const oldDue = anInboxItem({
  id: "n3",
  type: "todo-due",
  product: "todo",
  title: "Lab 6 is due tomorrow",
  body: "Lab 6",
  url: "/todo?day=2026-09-20",
  createdAt: minutesAgo(60 * 24 * 5),
  readAt: minutesAgo(60 * 24 * 4),
});

function signIn() {
  useAccount.setState({
    status: "signed-in",
    user: aMeUser(),
    flags: { ...FLAGS_OFF, signIn: true },
  });
}

async function renderBell() {
  const user = userEvent.setup();
  const view = renderInRouter(<NotificationsBell />, "/reviews");
  return { user, ...view };
}

/** The bell, once the router has rendered and the count has come. */
const bell = () => screen.findByTestId("notifications-bell");

beforeEach(() => {
  vi.clearAllMocks();
  forgetInbox();
  useUnread.setState({ unread: null });
  api.unread.mockResolvedValue({ unread: 2 });
  api.inbox.mockResolvedValue({
    items: [mention, seat, oldDue],
    unread: 2,
    next: null,
  });
  api.read.mockResolvedValue({ unread: 1 });
});

afterEach(() => {
  useAccount.setState({ status: "loading", flags: FLAGS_OFF, user: null });
});

describe("the bell", () => {
  it("isn't there signed out, and asks for nothing", async () => {
    useAccount.setState({
      status: "signed-out",
      user: null,
      flags: { ...FLAGS_OFF, signIn: true },
    });
    renderInRouter(<NotificationsBell />, "/reviews");
    // The router renders asynchronously: wait for its first render.
    await waitFor(() => expect(document.body.childElementCount).toBe(1));
    expect(screen.queryByTestId("notifications-bell")).toBeNull();
    expect(api.unread).not.toHaveBeenCalled();
  });

  it("shows the unread count, and says it", async () => {
    signIn();
    await renderBell();
    const button = await bell();
    await waitFor(() =>
      expect(button).toHaveAccessibleName("Notifications, 2 unread"),
    );
    expect(within(button).getByTestId("notifications-count")).toHaveTextContent(
      "2",
    );
    expect(api.unread).toHaveBeenCalledTimes(1);
  });

  it("has no count when nothing's unread", async () => {
    signIn();
    api.unread.mockResolvedValue({ unread: 0 });
    await renderBell();
    const button = await bell();
    await waitFor(() => expect(api.unread).toHaveBeenCalled());
    expect(button).toHaveAccessibleName("Notifications");
    expect(screen.queryByTestId("notifications-count")).toBeNull();
  });
});

describe("Notifications", () => {
  async function open() {
    signIn();
    const view = await renderBell();
    await view.user.click(await bell());
    const list = await screen.findByRole("dialog", { name: "Notifications" });
    await within(list).findByText("Maya in CMSC351");
    return { ...view, list };
  }

  it("groups by day, with each row's product, words and when", async () => {
    const { list } = await open();
    expect(
      within(list)
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(["Today", "Earlier"]);
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent("Maya in CMSC351");
    expect(rows[0]).toHaveTextContent(mention.body);
    expect(rows[0]).toHaveTextContent("Chat · 2m");
    expect(rows[0]).toHaveAttribute("data-unread");
    expect(rows[1]).toHaveTextContent("Schedule · 4m");
    // Read rows are their title and when.
    expect(rows[2]).not.toHaveAttribute("data-unread");
    expect(rows[2]).toHaveTextContent(/^Lab 6 is due tomorrowTodo · /);
    // The words people wrote stay out of analytics.
    expect(rows[0]?.closest("[data-private]")).not.toBeNull();
  });

  it("opens a row where it points, reads it, and the count follows", async () => {
    const { user, list, router } = await open();
    await user.click(within(list).getByRole("link", { name: /^Maya in/ }));
    expect(api.read).toHaveBeenCalledWith({ ids: ["n1"] });
    await waitFor(() => expect(router.state.location.href).toBe(mention.url));
    await waitFor(() =>
      expect(screen.getByTestId("notifications-bell")).toHaveAccessibleName(
        "Notifications, 1 unread",
      ),
    );
    expect(screen.queryByRole("dialog", { name: "Notifications" })).toBeNull();
  });

  it("marks everything read", async () => {
    api.read.mockResolvedValue({ unread: 0 });
    const { user, list } = await open();
    await user.click(
      within(list).getByRole("button", { name: "Mark all read" }),
    );
    expect(api.read).toHaveBeenCalledWith({ all: true });
    await waitFor(() => expect(list.querySelector("[data-unread]")).toBeNull());
    expect(
      within(list).queryByRole("button", { name: "Mark all read" }),
    ).toBeNull();
    expect(screen.queryByTestId("notifications-count")).toBeNull();
  });

  it("puts the count back when a read fails", async () => {
    api.read.mockRejectedValue(new Error("offline"));
    const { user, list } = await open();
    await user.click(within(list).getByRole("link", { name: /^Maya in/ }));
    await waitFor(() => expect(api.read).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId("notifications-count")).toHaveTextContent("2"),
    );
  });

  it("says when there's nothing, in one line", async () => {
    api.inbox.mockResolvedValue({ items: [], unread: 0, next: null });
    api.unread.mockResolvedValue({ unread: 0 });
    signIn();
    const { user } = await renderBell();
    await user.click(await bell());
    expect(
      await screen.findByText(
        "Nothing new. Notifications show up here, pushed or not.",
      ),
    ).toBeVisible();
  });

  it("says when it couldn't load, and tries again", async () => {
    api.inbox.mockRejectedValueOnce(new Error("offline"));
    signIn();
    const { user } = await renderBell();
    await user.click(await bell());
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Maya in CMSC351")).toBeVisible();
    expect(api.inbox).toHaveBeenCalledTimes(2);
  });

  it("shows older ones under the list", async () => {
    api.inbox.mockResolvedValueOnce({
      items: [mention],
      unread: 1,
      next: "cursor-1",
    });
    api.inbox.mockResolvedValueOnce({
      items: [oldDue],
      unread: 1,
      next: null,
    });
    const { user, list } = await open();
    await user.click(within(list).getByRole("button", { name: "Show older" }));
    expect(api.inbox).toHaveBeenLastCalledWith({ before: "cursor-1" });
    expect(
      await within(list).findByText("Lab 6 is due tomorrow"),
    ).toBeVisible();
    expect(
      within(list).queryByRole("button", { name: "Show older" }),
    ).toBeNull();
  });

  it("links to the settings", async () => {
    const { list } = await open();
    expect(
      within(list).getByRole("link", { name: "Notification settings" }),
    ).toHaveAttribute("href", "/settings/notifications");
  });

  it("gives every control a tooltip", async () => {
    await open();
    const controls = [
      ...document.querySelectorAll<HTMLElement>("button, a[href]"),
    ];
    expect(controls.length).toBeGreaterThan(4);
    const untipped = controls
      .filter((el) => !el.closest("[data-tooltip]"))
      .map((el) => el.textContent);
    expect(untipped).toEqual([]);
  });
});
