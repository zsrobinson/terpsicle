import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INSTALL_COOLDOWN_DAYS } from "~/core/install";
import { INSTALL_PROMPT_STORAGE_KEY } from "~/core/schema";
import { TooltipProvider } from "~/ui/tooltip";
import { INSTALL_PROMPT_STASH } from "./install-capture";
import { InstallAppButton, InstallAppSetting } from "./install-entry";
import { InstallHost } from "./install-host";
import { resetOfferedInMemory } from "./install-prefs";
import {
  captureInstallPrompt,
  offerInstall,
  useInstall,
} from "./install-store";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const NOW = new Date("2026-09-26T12:00:00.000Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

/** Chrome's `beforeinstallprompt`, answering the prompt with `outcome`. */
function promptEvent(outcome: "accepted" | "dismissed" = "dismissed") {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  const prompt = vi.fn(async () => {});
  Object.assign(event, {
    prompt,
    userChoice: Promise.resolve({ outcome }),
  });
  return { event, prompt };
}

/** A new tab: the per-session limit starts over; localStorage stays. */
function newSession() {
  window.sessionStorage.clear();
  resetOfferedInMemory();
}

let stopCapture = () => {};
beforeEach(() => {
  useInstall.setState({ deferred: null, installed: false, open: null });
  window.localStorage.clear();
  newSession();
  stopCapture = captureInstallPrompt();
});
afterEach(() => {
  stopCapture();
  vi.restoreAllMocks();
  delete (window as unknown as Record<string, unknown>)[INSTALL_PROMPT_STASH];
});

function browserOffersPrompt(outcome?: "accepted" | "dismissed") {
  const prompt = promptEvent(outcome);
  window.dispatchEvent(prompt.event);
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

describe("offerInstall", () => {
  it("does nothing where the app can't be installed", () => {
    expect(offerInstall("enabled-alerts", NOW)).toBe(false);
    expect(useInstall.getState().open).toBeNull();
  });

  it("keeps the browser's prompt, so the browser shows no bar of its own", () => {
    const { event } = browserOffersPrompt();
    expect(event.defaultPrevented).toBe(true);
    expect(offerInstall("enabled-alerts", NOW)).toBe(true);
    expect(useInstall.getState().open).toBe("enabled-alerts");
  });

  it("takes a prompt the head script caught before the app loaded", () => {
    stopCapture();
    const { event } = promptEvent();
    (window as unknown as Record<string, unknown>)[INSTALL_PROMPT_STASH] =
      event;
    stopCapture = captureInstallPrompt();
    expect(offerInstall("first-sign-in", NOW)).toBe(true);
  });

  it("offers once a session, then not for 30 days", () => {
    browserOffersPrompt();
    expect(offerInstall("enabled-alerts", NOW)).toBe(true);
    act(() => useInstall.setState({ open: null }));
    expect(offerInstall("joined-chat", NOW)).toBe(false);

    newSession();
    expect(offerInstall("joined-chat", days(INSTALL_COOLDOWN_DAYS - 1))).toBe(
      false,
    );
    expect(offerInstall("joined-chat", days(INSTALL_COOLDOWN_DAYS))).toBe(true);
  });

  it("never offers in the installed app", () => {
    browserOffersPrompt();
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) =>
        ({
          matches: query === "(display-mode: standalone)",
        }) as MediaQueryList,
    );
    expect(offerInstall("enabled-alerts", NOW)).toBe(false);
  });

  it("works with storage blocked, once per page load", () => {
    browserOffersPrompt();
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    expect(offerInstall("enabled-alerts", NOW)).toBe(true);
    act(() => useInstall.setState({ open: null }));
    expect(offerInstall("enabled-alerts", NOW)).toBe(false);
  });
});

describe("the install dialog", () => {
  it("says what installing gives you, and hands off to the browser's prompt", async () => {
    const user = userEvent.setup();
    const { prompt } = browserOffersPrompt("accepted");
    renderHost();
    act(() => {
      offerInstall("enabled-alerts", NOW);
    });
    const dialog = await screen.findByRole("dialog", {
      name: "Install Terpsicle",
    });
    expect(dialog).toHaveTextContent(
      "Get notified when your class chat or a seat alert needs you",
    );
    expect(dialog).toHaveTextContent(
      "Open Terpsicle from your dock or taskbar",
    );
    await user.click(screen.getByRole("button", { name: "Install" }));
    expect(prompt).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Installed: nothing offers it again, and the entry is gone.
    expect(screen.queryByRole("button", { name: "Install app" })).toBeNull();
    newSession();
    expect(offerInstall("joined-chat", days(365))).toBe(false);
  });

  it("remembers Not now for 30 days", async () => {
    const user = userEvent.setup();
    browserOffersPrompt();
    renderHost();
    act(() => {
      offerInstall("enabled-alerts", NOW);
    });
    await user.click(await screen.findByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    newSession();
    expect(offerInstall("enabled-alerts", days(1))).toBe(false);
  });

  it("remembers Don't ask again for good", async () => {
    const user = userEvent.setup();
    browserOffersPrompt();
    renderHost();
    act(() => {
      offerInstall("enabled-alerts", NOW);
    });
    await user.click(
      await screen.findByRole("button", { name: "Don't ask again" }),
    );
    expect(
      JSON.parse(window.localStorage.getItem(INSTALL_PROMPT_STORAGE_KEY) ?? ""),
    ).toMatchObject({ never: true });
    newSession();
    expect(offerInstall("enabled-alerts", days(365))).toBe(false);
  });

  it("shows Safari's Share → Add to Home Screen steps on iPhone", async () => {
    onIphone();
    renderHost();
    act(() => {
      offerInstall("enabled-alerts", NOW);
    });
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Open Terpsicle from your home screen");
    expect(dialog).toHaveTextContent("Full screen, no browser bars");
    expect(dialog).toHaveTextContent("Tap Add to Home Screen");
    expect(screen.queryByRole("button", { name: "Install" })).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes with Esc, as Not now", async () => {
    const user = userEvent.setup();
    browserOffersPrompt();
    renderHost();
    act(() => {
      offerInstall("enabled-alerts", NOW);
    });
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(useInstall.getState().open).toBeNull();
  });
});

describe("the Install app entry", () => {
  it("shows only where installing works", async () => {
    renderHost();
    expect(screen.queryByRole("button", { name: "Install app" })).toBeNull();
    act(() => {
      browserOffersPrompt();
    });
    expect(
      screen.getByRole("button", { name: "Install app" }),
    ).toBeInTheDocument();
  });

  it("opens the dialog any time, even after Don't ask again", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      INSTALL_PROMPT_STORAGE_KEY,
      JSON.stringify({ lastOfferedAt: NOW.toISOString(), never: true }),
    );
    browserOffersPrompt();
    renderHost();
    await user.click(screen.getByRole("button", { name: "Install app" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    // They asked for it: no "Don't ask again".
    expect(
      screen.queryByRole("button", { name: "Don't ask again" }),
    ).toBeNull();
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
