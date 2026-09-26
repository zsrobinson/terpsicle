import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
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

vi.mock("~/app/analytics", () => ({ track: vi.fn() }));
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
  createdAt: "2026-09-26T16:00:00.000Z",
  lastSuccessAt: null,
  current: false,
  ...over,
});

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
  api.settings.mockResolvedValue({ settings: DEFAULT_NOTIFICATION_SETTINGS });
  api.devices.mockResolvedValue({ devices: [] });
});

describe("NotificationSettingsSection", () => {
  it("lists every type, quiet until its feature sends", async () => {
    renderSection();
    for (const row of TYPE_ROWS)
      expect(await screen.findByText(row.title)).toBeInTheDocument();
    const seat = screen.getByRole("switch", {
      name: "Seat openings: Notification",
    });
    expect(seat).toHaveAttribute("aria-disabled", "true");
    expect(seat).toHaveAttribute("aria-checked", "false");
    await userEvent.setup().click(seat);
    expect(api.setSettings).not.toHaveBeenCalled();
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
    expect(addedOn("2026-09-26T16:00:00.000Z")).toBe("Sep 26");
  });
});
