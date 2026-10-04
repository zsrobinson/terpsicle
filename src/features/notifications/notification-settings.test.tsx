import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettings,
  type NotificationSettingsResult,
  NotificationSettingsSchema,
  type PushDevice,
} from "~/core/schema/notifications";
import { FLAGS_OFF, useAccount } from "~/features/auth/account-store";
import { ApiCallError } from "~/server/fns/api";
import { notificationsApi } from "~/server/fns/notifications";
import { Toaster } from "~/ui/sonner";
import { TooltipProvider } from "~/ui/tooltip";
import {
  addedOn,
  NotificationSettingsSection,
  TYPE_ROWS,
} from "./notification-settings";
import { turnOnHere } from "./this-device";

vi.mock("~/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("~/server/fns/notifications", () => ({
  notificationsApi: {
    settings: vi.fn(),
    setSettings: vi.fn(),
    devices: vi.fn(),
    remove: vi.fn(),
    test: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  },
}));
vi.mock("./this-device", () => ({
  currentEndpoint: vi.fn(async () => undefined),
  notificationPermission: vi.fn(() => "default"),
  pushSupport: vi.fn(() => "ok"),
  turnOnHere: vi.fn(),
  turnOffHere: vi.fn(),
}));

const api = vi.mocked(notificationsApi);

const aDevice = (over: Partial<PushDevice> = {}): PushDevice => ({
  id: "d1",
  label: "iPhone · Safari",
  createdAt: new Date(2026, 8, 26, 12).toISOString(),
  lastSuccessAt: null,
  current: false,
  ...over,
});

/** A promise and the hands that settle it. */
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function renderSection() {
  const user = userEvent.setup();
  render(
    <TooltipProvider delayDuration={0}>
      <NotificationSettingsSection />
      <Toaster />
    </TooltipProvider>,
  );
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  useAccount.setState({
    status: "signed-in",
    flags: { ...FLAGS_OFF, signIn: true, push: true },
    pushPublicKey: "BKey",
  });
  serve({ settings: DEFAULT_NOTIFICATION_SETTINGS });
  api.devices.mockResolvedValue({ devices: [] });
});

/**
 * The server's side of the settings: it answers with `answer` until a save,
 * then with what was saved (the page asks again after each run of saves).
 */
function serve(answer: NotificationSettingsResult) {
  let saved = answer;
  api.settings.mockImplementation(async () => saved);
  api.setSettings.mockImplementation(async ({ settings }) => {
    saved = { ...saved, settings: NotificationSettingsSchema.parse(settings) };
    return { settings: saved.settings };
  });
}

// Sonner removes a dismissed toast on a timer; waiting for it here keeps that
// timer from firing after the DOM is torn down.
afterEach(async () => {
  toast.dismiss();
  await waitFor(() =>
    expect(document.querySelector("[data-sonner-toast]")).toBeNull(),
  );
});

describe("NotificationSettingsSection", () => {
  it("lists every type; the ones that send switch and save, the rest stay quiet", async () => {
    const user = renderSection();
    for (const row of TYPE_ROWS)
      expect(await screen.findByText(row.title)).toBeInTheDocument();
    const seatEmail = screen.getByRole("switch", {
      name: "Seat openings: Email",
    });
    expect(seatEmail).toHaveAttribute("aria-checked", "true");
    await user.click(seatEmail);
    expect(seatEmail).toHaveAttribute("aria-checked", "false");
    expect(api.setSettings).toHaveBeenCalledWith({
      settings: {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        seatOpen: { push: true, email: false },
      },
    });
    const due = screen.getByRole("switch", {
      name: "Due tomorrow: Notification",
    });
    expect(due).toHaveAttribute("aria-disabled", "true");
    expect(due).toHaveAttribute("aria-checked", "false");
    await user.click(due);
    expect(api.setSettings).toHaveBeenCalledOnce();
  });

  it("switches Chat's mentions, replies and digest", async () => {
    const user = renderSection();
    const mention = await screen.findByRole("switch", {
      name: "Mentions: Notification",
    });
    const reply = screen.getByRole("switch", {
      name: "Replies to your threads: Notification",
    });
    const digest = screen.getByRole("switch", { name: "Daily digest: Email" });
    expect(mention).toHaveAttribute("aria-checked", "true");
    expect(reply).toHaveAttribute("aria-checked", "true");
    // The digest starts off (V2.md §6.1).
    expect(digest).toHaveAttribute("aria-checked", "false");
    await user.click(reply);
    expect(api.setSettings).toHaveBeenLastCalledWith({
      settings: {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        chatReply: { push: false },
      },
    });
    await user.click(digest);
    expect(digest).toHaveAttribute("aria-checked", "true");
    expect(api.setSettings).toHaveBeenLastCalledWith({
      settings: {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        chatReply: { push: false },
        chatDigest: { email: true },
      },
    });
    expect(
      screen.queryByRole("switch", { name: "Daily digest: Notification" }),
    ).not.toBeInTheDocument();
  });

  it("groups the switches by product, then When and how", async () => {
    renderSection();
    const headings = (await screen.findAllByRole("heading", { level: 2 })).map(
      (h) => h.textContent,
    );
    expect(headings.slice(0, 4)).toEqual([
      "Schedule",
      "Chat",
      "Todo",
      "When and how",
    ]);
    const chat = screen
      .getByRole("heading", { name: "Chat" })
      .closest("section");
    if (!chat) throw new Error("no Chat section");
    for (const title of ["Mentions", "Replies to your threads", "Daily digest"])
      expect(within(chat).getByText(title)).toBeInTheDocument();
    // Mentions and replies have no email of their own: the digest has them.
    expect(within(chat).getAllByText("In the digest")).toHaveLength(2);
  });

  it("switches quiet hours, seats through them, and message text", async () => {
    const user = renderSection();
    const quiet = await screen.findByRole("switch", { name: "Quiet hours" });
    const seats = screen.getByRole("switch", {
      name: "Seat openings come through quiet hours",
    });
    const text = screen.getByRole("switch", { name: "Show message text" });
    // On by default (V2.md §6.7).
    expect(quiet).toHaveAttribute("aria-checked", "true");
    expect(seats).toHaveAttribute("aria-checked", "true");
    expect(text).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByText(
        /When a section you're watching gets an open seat\. Comes through quiet hours\./,
      ),
    ).toBeInTheDocument();

    await user.click(seats);
    expect(api.setSettings).toHaveBeenLastCalledWith({
      settings: { ...DEFAULT_NOTIFICATION_SETTINGS, seatThroughQuiet: false },
    });
    expect(
      screen.getByText(/Waits for 8am in quiet hours\./),
    ).toBeInTheDocument();

    await user.click(text);
    expect(api.setSettings).toHaveBeenLastCalledWith({
      settings: {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        seatThroughQuiet: false,
        showText: false,
      },
    });

    // Quiet hours off: nothing waits, so seats' own switch can't change.
    await user.click(quiet);
    expect(api.setSettings).toHaveBeenLastCalledWith({
      settings: {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        quietHours: { on: false },
        seatThroughQuiet: false,
        showText: false,
      },
    });
    expect(seats).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByText(/quiet hours\.$/)).not.toBeInTheDocument();
    await user.click(seats);
    expect(api.setSettings).toHaveBeenCalledTimes(3);
  });

  it("reads settings saved before quiet hours with their defaults", async () => {
    serve({
      settings: NotificationSettingsSchema.parse({
        v: 1,
        seatOpen: { push: true, email: true },
        chatMention: { push: true },
        chatReply: { push: true },
        chatDigest: { email: false },
      }),
    });
    renderSection();
    expect(
      await screen.findByRole("switch", { name: "Quiet hours" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("asks for ELMS before Due tomorrow can switch on", async () => {
    const user = renderSection();
    const due = await screen.findByRole("switch", {
      name: "Due tomorrow: Notification",
    });
    expect(due).toHaveAttribute("aria-disabled", "true");
    expect(due).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getByRole("link", { name: "Connect ELMS in Todo" }),
    ).toHaveAttribute("href", "/todo/connect");
    await user.click(due);
    expect(api.setSettings).not.toHaveBeenCalled();
  });

  it("switches Due tomorrow once ELMS is connected", async () => {
    serve({
      settings: { ...DEFAULT_NOTIFICATION_SETTINGS, todoDue: { push: true } },
      todoConnected: true,
    });
    const user = renderSection();
    const due = await screen.findByRole("switch", {
      name: "Due tomorrow: Notification",
    });
    expect(due).toHaveAttribute("aria-checked", "true");
    expect(
      screen.queryByRole("link", { name: "Connect ELMS in Todo" }),
    ).toBeNull();
    await user.click(due);
    expect(due).toHaveAttribute("aria-checked", "false");
    expect(api.setSettings).toHaveBeenCalledWith({
      settings: { ...DEFAULT_NOTIFICATION_SETTINGS, todoDue: { push: false } },
    });
  });

  it("puts a switch back when saving fails", async () => {
    api.setSettings.mockRejectedValue(new Error("offline"));
    const user = renderSection();
    const seatEmail = await screen.findByRole("switch", {
      name: "Seat openings: Email",
    });
    await user.click(seatEmail);
    await waitFor(() =>
      expect(seatEmail).toHaveAttribute("aria-checked", "true"),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "That didn't go through.",
    );
  });

  it("shows a switch at once, and puts it back when the save fails", async () => {
    const save = deferred<never>();
    api.setSettings.mockReturnValue(save.promise);
    const user = renderSection();
    const seatEmail = await screen.findByRole("switch", {
      name: "Seat openings: Email",
    });
    await user.click(seatEmail);
    // Before the server answers.
    expect(seatEmail).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByRole("status")).toBeNull();
    save.reject(new Error("offline"));
    await waitFor(() =>
      expect(seatEmail).toHaveAttribute("aria-checked", "true"),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "That didn't go through. Check your connection and try again.",
    );
  });

  it("saves one change at a time, in order", async () => {
    const first = deferred<{ settings: NotificationSettings }>();
    api.setSettings.mockReturnValueOnce(first.promise);
    const user = renderSection();
    const seatEmail = await screen.findByRole("switch", {
      name: "Seat openings: Email",
    });
    const text = screen.getByRole("switch", { name: "Show message text" });
    await user.click(seatEmail);
    await user.click(text);
    // Both show; the second waits for the first, and sends both.
    expect(seatEmail).toHaveAttribute("aria-checked", "false");
    expect(text).toHaveAttribute("aria-checked", "false");
    expect(api.setSettings).toHaveBeenCalledOnce();
    first.resolve({ settings: DEFAULT_NOTIFICATION_SETTINGS });
    await waitFor(() => expect(api.setSettings).toHaveBeenCalledTimes(2));
    expect(api.setSettings).toHaveBeenLastCalledWith({
      settings: {
        ...DEFAULT_NOTIFICATION_SETTINGS,
        seatOpen: { push: true, email: false },
        showText: false,
      },
    });
  });

  it("asks for the settings again once the last save is done", async () => {
    const user = renderSection();
    const text = await screen.findByRole("switch", {
      name: "Show message text",
    });
    expect(api.settings).toHaveBeenCalledOnce();
    await user.click(text);
    await waitFor(() => expect(api.settings).toHaveBeenCalledTimes(2));
    expect(text).toHaveAttribute("aria-checked", "false");
  });

  it("says when the settings didn't load, and Try again loads them", async () => {
    api.settings.mockRejectedValueOnce(new Error("offline"));
    const user = renderSection();
    expect(
      await screen.findByText(
        "Couldn't load your notification settings. Check your connection and try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("switch")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("switch", { name: "Quiet hours" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByText(/Couldn't load/)).toBeNull();
  });

  it("says when the devices didn't load, and Try again loads them", async () => {
    api.devices.mockRejectedValueOnce(new Error("offline"));
    const user = renderSection();
    expect(
      await screen.findByText(/^Couldn't load your notification settings\./),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByText("Notifications are off here."),
    ).toBeInTheDocument();
  });

  it("turns notifications on here, then lists this device", async () => {
    const user = renderSection();
    vi.mocked(turnOnHere).mockResolvedValue("on");
    const turnOn = await screen.findByRole("button", {
      name: "Turn on notifications on this device",
    });
    api.devices.mockResolvedValue({ devices: [aDevice({ current: true })] });
    await user.click(turnOn);
    expect(turnOnHere).toHaveBeenCalledWith("BKey");
    expect(
      await screen.findByText("Notifications are on here."),
    ).toBeInTheDocument();
    expect(screen.getByText("Added Sep 26 · This device")).toBeInTheDocument();
  });

  it("says why when the browser blocked notifications", async () => {
    const user = renderSection();
    vi.mocked(turnOnHere).mockResolvedValue("denied");
    await user.click(
      await screen.findByRole("button", {
        name: "Turn on notifications on this device",
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Your browser blocked notifications for Terpsicle.",
    );
  });

  it("sends a test and says what happened", async () => {
    api.devices.mockResolvedValue({
      devices: [aDevice({ current: true }), aDevice({ id: "d2" })],
    });
    const user = renderSection();
    api.test.mockResolvedValueOnce({ status: "sent", devices: 2 });
    await user.click(
      await screen.findByRole("button", { name: "Send me a test" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Sent to 2 devices. It should show up in a few seconds.",
    );
    api.test.mockRejectedValueOnce(new ApiCallError("rate-limited", 60));
    await user.click(screen.getByRole("button", { name: "Send me a test" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "That's 10 tests this hour. Try again later.",
      ),
    );
  });

  it("removes a device at once, with Undo before the server hears", async () => {
    api.devices.mockResolvedValue({ devices: [aDevice()] });
    api.remove.mockResolvedValue({ status: "ok" });
    const user = renderSection();
    const row = (await screen.findByText("iPhone · Safari")).closest("li");
    if (!row) throw new Error("no row");
    await user.click(within(row).getByRole("button", { name: "Remove" }));
    expect(screen.queryByText("iPhone · Safari")).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Undo" }));
    expect(await screen.findByText("iPhone · Safari")).toBeInTheDocument();
    expect(api.remove).not.toHaveBeenCalled();
  });

  it("keeps a removed device hidden until the server hears, even after a refresh", async () => {
    api.devices.mockResolvedValue({
      devices: [
        aDevice({ id: "a", label: "iPhone · Safari" }),
        aDevice({ id: "b", label: "Mac · Chrome", current: true }),
      ],
    });
    api.remove.mockReturnValue(new Promise(() => {}));
    api.test.mockResolvedValue({ status: "sent", devices: 2 });
    const user = renderSection();
    const rowOf = async (label: string) => {
      const li = (await screen.findByText(label)).closest("li");
      if (!li) throw new Error(`no row for ${label}`);
      return li;
    };
    await user.click(
      within(await rowOf("iPhone · Safari")).getByRole("button", {
        name: "Remove",
      }),
    );
    await user.click(
      within(await rowOf("Mac · Chrome")).getByRole("button", {
        name: "Remove",
      }),
    );
    // Undo the first: only it comes back, not the second.
    const toastOfFirst = (
      await screen.findByText("Removed iPhone · Safari")
    ).closest("li");
    if (!toastOfFirst) throw new Error("no toast");
    const undoFirst = within(toastOfFirst).getByRole("button", {
      name: "Undo",
    });
    await user.click(undoFirst);
    expect(await screen.findByText("iPhone · Safari")).toBeInTheDocument();
    expect(screen.queryByText("Mac · Chrome")).not.toBeInTheDocument();
    // A refresh (after a test) brings back the server's list; the pending
    // removal stays hidden.
    await user.click(screen.getByRole("button", { name: "Send me a test" }));
    await screen.findByText(/^Sent to 2 devices/);
    expect(screen.queryByText("Mac · Chrome")).not.toBeInTheDocument();
  });

  it("removes a device once Undo's toast goes, and it stays gone", async () => {
    api.devices.mockResolvedValue({ devices: [aDevice()] });
    api.remove.mockResolvedValue({ status: "ok" });
    const user = renderSection();
    const row = (await screen.findByText("iPhone · Safari")).closest("li");
    if (!row) throw new Error("no row");
    await user.click(within(row).getByRole("button", { name: "Remove" }));
    await screen.findByText("Removed iPhone · Safari");
    expect(api.remove).not.toHaveBeenCalled();
    // The toast goes without Undo: now the server hears.
    act(() => {
      toast.dismiss();
    });
    await waitFor(() =>
      expect(api.remove).toHaveBeenCalledWith(
        { id: "d1" },
        expect.objectContaining({ fetcher: expect.any(Function) }),
      ),
    );
    await waitFor(() =>
      expect(
        screen.queryByText("Devices with notifications on"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByText("iPhone · Safari")).not.toBeInTheDocument();
  });

  it("puts a device back and says so when removing fails", async () => {
    api.devices.mockResolvedValue({ devices: [aDevice()] });
    api.remove.mockRejectedValue(new Error("offline"));
    const user = renderSection();
    const row = (await screen.findByText("iPhone · Safari")).closest("li");
    if (!row) throw new Error("no row");
    await user.click(within(row).getByRole("button", { name: "Remove" }));
    await screen.findByText("Removed iPhone · Safari");
    expect(
      screen.queryByText("iPhone · Safari", { selector: "div" }),
    ).not.toBeInTheDocument();
    act(() => {
      toast.dismiss();
    });
    expect(
      await screen.findByText(
        "Couldn't remove iPhone · Safari. Check your connection and try again.",
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("iPhone · Safari", { selector: "div" }),
    ).toBeInTheDocument();
  });

  it("still removes a device as the page closes, with keepalive", async () => {
    api.devices.mockResolvedValue({ devices: [aDevice()] });
    api.remove.mockResolvedValue({ status: "ok" });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}"));
    const user = renderSection();
    const row = (await screen.findByText("iPhone · Safari")).closest("li");
    if (!row) throw new Error("no row");
    await user.click(within(row).getByRole("button", { name: "Remove" }));
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    await waitFor(() => expect(api.remove).toHaveBeenCalledOnce());
    const fetcher = api.remove.mock.calls[0]?.[1]?.fetcher;
    if (!fetcher) throw new Error("no fetcher");
    await fetcher("/api/push/remove", { method: "POST" });
    expect(fetchSpy).toHaveBeenCalledWith("/api/push/remove", {
      method: "POST",
      keepalive: true,
    });
    fetchSpy.mockRestore();
    // The toast going after that doesn't send it again.
    act(() => {
      toast.dismiss();
    });
    await waitFor(() =>
      expect(document.querySelector("[data-sonner-toast]")).toBeNull(),
    );
    expect(api.remove).toHaveBeenCalledOnce();
  });

  it("says push is coming while it's off here", async () => {
    useAccount.setState({
      flags: { ...FLAGS_OFF, signIn: true, push: false },
      pushPublicKey: null,
    });
    renderSection();
    expect(
      await screen.findByText(
        "Notifications on your phone and computer are coming soon.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Turn on notifications/ }),
    ).not.toBeInTheDocument();
  });
});

describe("addedOn", () => {
  it("is a short month and day", () => {
    // Midday here, whatever the machine's time zone.
    expect(addedOn(new Date(2026, 8, 26, 12).toISOString())).toBe("Sep 26");
  });
});
