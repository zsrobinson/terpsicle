import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INSTALL_COOLDOWN_DAYS } from "~/core/pwa";
import { INSTALL_PROMPT_STORAGE_KEY } from "~/core/schema";
import { TooltipProvider } from "~/ui/tooltip";
import { INSTALL_PROMPT_STASH } from "./install-capture";
import { InstallAppButton, InstallAppSetting } from "./install-entry";
import { InstallHost } from "./install-host";
import {
  captureInstallPrompt,
  requestInstallPrompt,
  useInstall,
} from "./install-store";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const NOW = new Date("2026-09-26T12:00:00.000Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

/** Chromium's `beforeinstallprompt`, answering the prompt with `outcome`. */
function promptEvent(outcome: "accepted" | "dismissed" = "dismissed") {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  const prompt = vi.fn(async () => {});
  Object.assign(event, {
    prompt,
    userChoice: Promise.resolve({ outcome }),
  });
  return { event, prompt };
}

/** A new tab: the once-a-session limit starts over; localStorage stays. */
function newSession() {
  window.sessionStorage.clear();
  act(() => useInstall.setState({ open: null }));
}

const savedState = () =>
  JSON.parse(window.localStorage.getItem(INSTALL_PROMPT_STORAGE_KEY) ?? "null");

let stopCapture = () => {};
beforeEach(() => {
  // Only the clock: dismissals are stamped with the time they happen.
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  useInstall.setState({ deferred: null, installed: false, open: null });
  window.localStorage.clear();
  window.sessionStorage.clear();
  stopCapture = captureInstallPrompt();
});
afterEach(() => {
  stopCapture();
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (window as unknown as Record<string, unknown>)[INSTALL_PROMPT_STASH];
});

function browserOffersPrompt(outcome?: "accepted" | "dismissed") {
  const prompt = promptEvent(outcome);
  act(() => {
    window.dispatchEvent(prompt.event);
  });
  return prompt;
}

function onIphone() {
  vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(IPHONE_SAFARI);
  vi.spyOn(window.navigator, "maxTouchPoints", "get").mockReturnValue(5);
}

const renderHost = () =>
  render(
    <TooltipProvider delayDuration={0}>
      <InstallHost />
      <InstallAppButton side="right" />
    </TooltipProvider>,
  );

/** Asks at a key moment, as another feature would. */
const ask = (now = NOW) => {
  let opened = false;
  act(() => {
    opened = requestInstallPrompt("alert-on", now);
  });
  return opened;
};

describe("requestInstallPrompt", () => {
  it("does nothing where the app can't be installed", () => {
    expect(ask()).toBe(false);
    expect(useInstall.getState().open).toBeNull();
  });

  it("keeps the browser's prompt, so the browser shows no bar of its own", () => {
    const { event } = browserOffersPrompt();
    expect(event.defaultPrevented).toBe(true);
    expect(ask()).toBe(true);
    expect(useInstall.getState().open).toEqual({
      from: "alert-on",
      method: "prompt",
    });
  });

  it("takes a prompt the head script caught before the app loaded", () => {
    stopCapture();
    const { event } = promptEvent();
    (window as unknown as Record<string, unknown>)[INSTALL_PROMPT_STASH] =
      event;
    stopCapture = captureInstallPrompt();
    expect(ask()).toBe(true);
  });

  it("shows once a session", () => {
    browserOffersPrompt();
    expect(ask()).toBe(true);
    act(() => useInstall.setState({ open: null }));
    expect(requestInstallPrompt("chat-joined", NOW)).toBe(false);
    newSession();
    expect(ask()).toBe(true);
  });

  it("never shows in the installed app", () => {
    browserOffersPrompt();
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: query === "(display-mode: standalone)",
        }) as MediaQueryList,
    );
    expect(ask()).toBe(false);
  });

  it("doesn't show when storage is blocked, since it couldn't remember Not now", () => {
    browserOffersPrompt();
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    expect(ask()).toBe(false);
  });
});

describe("the install dialog", () => {
  it("says what installing gives you, and hands off to the browser's prompt", async () => {
    const user = userEvent.setup();
    const { prompt } = browserOffersPrompt("accepted");
    renderHost();
    ask();
    const dialog = await screen.findByRole("dialog", {
      name: "Put Terpsicle on your home screen",
    });
    for (const line of [
      "Get notified when a seat opens or a classmate replies",
      "Open it from your home screen, like an app",
      "Use the full screen, without browser bars",
    ])
      expect(dialog).toHaveTextContent(line);
    expect(screen.getByRole("button", { name: "Install" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Install" }));
    expect(prompt).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Installed: nothing asks again, the item is gone, and it's no dismissal.
    expect(screen.queryByRole("button", { name: "Install app" })).toBeNull();
    expect(savedState()).toBeNull();
    newSession();
    expect(ask(days(365))).toBe(false);
  });

  it("counts declining the browser's prompt as a dismissal", async () => {
    const user = userEvent.setup();
    browserOffersPrompt("dismissed");
    renderHost();
    ask();
    await user.click(await screen.findByRole("button", { name: "Install" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(savedState()).toEqual({
      dismissals: 1,
      lastDismissedAt: NOW.toISOString(),
    });
  });

  it(`waits ${INSTALL_COOLDOWN_DAYS} days after Not now, and stops after two`, async () => {
    const user = userEvent.setup();
    browserOffersPrompt();
    renderHost();
    ask();
    await user.click(await screen.findByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(savedState()).toMatchObject({ dismissals: 1 });

    newSession();
    expect(ask(days(INSTALL_COOLDOWN_DAYS - 1))).toBe(false);
    newSession();
    vi.setSystemTime(days(INSTALL_COOLDOWN_DAYS));
    expect(ask(days(INSTALL_COOLDOWN_DAYS))).toBe(true);
    await user.click(await screen.findByRole("button", { name: "Not now" }));
    expect(savedState()).toEqual({
      dismissals: 2,
      lastDismissedAt: days(INSTALL_COOLDOWN_DAYS).toISOString(),
    });
    newSession();
    expect(ask(days(10 * INSTALL_COOLDOWN_DAYS))).toBe(false);
  });

  it("shows Safari's Share → Add to Home Screen steps on iPhone", async () => {
    onIphone();
    renderHost();
    ask();
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Tap Add to Home Screen");
    expect(dialog).toHaveTextContent("Open Terpsicle from your Home Screen");
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(savedState()).toMatchObject({ dismissals: 1 });
  });

  it("closes with Esc, as Not now", async () => {
    const user = userEvent.setup();
    browserOffersPrompt();
    renderHost();
    ask();
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(savedState()).toMatchObject({ dismissals: 1 });
  });
});

describe("the Install app item", () => {
  it("shows only where installing works", () => {
    renderHost();
    expect(screen.queryByRole("button", { name: "Install app" })).toBeNull();
    browserOffersPrompt();
    expect(
      screen.getByRole("button", { name: "Install app" }),
    ).toBeInTheDocument();
  });

  it("opens the dialog any time, and closing it isn't a dismissal", async () => {
    const user = userEvent.setup();
    const stopped = { dismissals: 2, lastDismissedAt: NOW.toISOString() };
    window.localStorage.setItem(
      INSTALL_PROMPT_STORAGE_KEY,
      JSON.stringify(stopped),
    );
    browserOffersPrompt();
    renderHost();
    await user.click(screen.getByRole("button", { name: "Install app" }));
    await user.click(await screen.findByRole("button", { name: "Not now" }));
    expect(savedState()).toEqual(stopped);
  });

  it("says why when this browser can't install", () => {
    render(
      <TooltipProvider>
        <InstallAppSetting />
      </TooltipProvider>,
    );
    expect(
      screen.getByText(/This browser can't install Terpsicle/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
  });
});
