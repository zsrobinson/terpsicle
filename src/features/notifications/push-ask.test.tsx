import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PushAskDevice } from "~/core/pwa";
import {
  INSTALL_PROMPT_STORAGE_KEY,
  PUSH_ASK_STORAGE_KEY,
} from "~/core/schema";
import { FLAGS_OFF, useAccount } from "~/features/auth/account-store";
import { requestInstallPrompt, useInstall } from "~/features/pwa/install-store";
import { track } from "~/lib/analytics";
import { Toaster } from "~/ui/sonner";
import { TooltipProvider } from "~/ui/tooltip";
import {
  askForPush,
  resetPushAskForTests,
  setPushAskDeviceForTests,
  usePushAsk,
} from "./push-ask";
import { PushAskCard } from "./push-ask-card";
import { PushAskHost } from "./push-ask-host";
import type { TurnOnResult } from "./this-device";

vi.mock("~/lib/analytics", () => ({ track: vi.fn() }));

const NOW = new Date("2026-09-28T12:00:00.000Z");

const chrome: PushAskDevice = {
  support: "ok",
  permission: "default",
  subscribed: false,
  iosSafari: false,
  iosHomeScreen: false,
};
const iphoneTab: PushAskDevice = {
  ...chrome,
  support: "ios-home-screen",
  iosSafari: true,
};
const iphoneApp: PushAskDevice = { ...chrome, iosHomeScreen: true };

let device: PushAskDevice = chrome;
let answer: TurnOnResult = "on";
const turnOn = vi.fn(async (_key: string) => answer);

/** The card on the page (sonner's toast list is a region too). */
const card = () => document.querySelector("[data-push-ask]");

const saved = (key: string) =>
  JSON.parse(window.localStorage.getItem(key) ?? "null");

/** A new tab: sessionStorage starts over; localStorage stays. */
function newSession() {
  window.sessionStorage.clear();
  act(() => resetPushAskForTests());
}

function renderPage(node: React.ReactNode = null) {
  const user = userEvent.setup();
  const view = render(
    <TooltipProvider delayDuration={0}>
      {node}
      <PushAskHost />
      <Toaster />
    </TooltipProvider>,
  );
  return { user, ...view };
}

const ask = async (moment: Parameters<typeof askForPush>[0]) => {
  let kind: Awaited<ReturnType<typeof askForPush>> = null;
  await act(async () => {
    kind = await askForPush(moment, NOW);
  });
  return kind;
};

beforeEach(() => {
  vi.clearAllMocks();
  // Only the clock: answers are stamped with the time they happen.
  vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
  window.localStorage.clear();
  window.sessionStorage.clear();
  device = chrome;
  answer = "on";
  setPushAskDeviceForTests(async () => device, turnOn);
  resetPushAskForTests();
  useInstall.setState({ deferred: null, installed: false, open: null });
  useAccount.setState({
    status: "signed-in",
    flags: { ...FLAGS_OFF, signIn: true, push: true },
    pushPublicKey: "BKey",
  });
});

afterEach(async () => {
  toast.dismiss();
  vi.useRealTimers();
  vi.restoreAllMocks();
  await waitFor(() =>
    expect(document.querySelector("[data-sonner-toast]")).toBeNull(),
  );
});

describe("the ask after your first Chat post", () => {
  it("asks in our words where the page placed it, and Turn on is the browser's prompt", async () => {
    const { user } = renderPage(<PushAskCard moment="chat-post" />);
    expect(card()).toBeNull();
    expect(await ask("chat-post")).toBe("card");
    const region = screen.getByRole("region", {
      name: "Hear back when someone answers?",
    });
    expect(region).toHaveAccessibleDescription(
      "Get a notification when a classmate mentions you or replies to you. Change it anytime in Settings.",
    );
    expect(track).toHaveBeenCalledWith("push_ask_shown", {
      moment: "chat-post",
      kind: "card",
    });

    await user.click(screen.getByRole("button", { name: "Turn on" }));
    expect(turnOn).toHaveBeenCalledWith("BKey");
    expect(await screen.findByText("Notifications are on here")).toBeVisible();
    expect(card()).toBeNull();
    expect(track).toHaveBeenCalledWith("push_ask_result", {
      moment: "chat-post",
      kind: "card",
      outcome: "on",
    });
    // A yes needs no remembering: once they're on, nothing asks.
    expect(saved(PUSH_ASK_STORAGE_KEY)).toBeNull();
  });

  it("remembers Not now for 90 days, for every moment", async () => {
    const { user } = renderPage(
      <>
        <PushAskCard moment="chat-post" />
        <PushAskCard moment="todo-connected" />
      </>,
    );
    await ask("chat-post");
    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(card()).toBeNull();
    expect(turnOn).not.toHaveBeenCalled();
    expect(saved(PUSH_ASK_STORAGE_KEY)).toEqual({
      dismissals: 1,
      lastDismissedAt: NOW.toISOString(),
      homeScreenAskedAt: null,
    });
    newSession();
    expect(await ask("chat-post")).toBeNull();
    expect(await ask("todo-connected")).toBeNull();
  });

  it("asks at most once a session, whatever the answer", async () => {
    renderPage(
      <>
        <PushAskCard moment="chat-post" />
        <PushAskCard moment="todo-connected" />
      </>,
    );
    expect(await ask("chat-post")).toBe("card");
    // Unanswered, a second post doesn't ask again, nor does another moment.
    expect(await ask("chat-post")).toBeNull();
    act(() => resetPushAskForTests());
    expect(await ask("todo-connected")).toBeNull();
  });

  it("doesn't ask signed out, or where push is off", async () => {
    renderPage(<PushAskCard moment="chat-post" />);
    useAccount.setState({ status: "signed-out" });
    expect(await ask("chat-post")).toBeNull();
    useAccount.setState({
      status: "signed-in",
      flags: { ...FLAGS_OFF, push: false },
    });
    expect(await ask("chat-post")).toBeNull();
  });

  it("never asks once notifications are on here, or blocked", async () => {
    renderPage(<PushAskCard moment="chat-post" />);
    device = { ...chrome, permission: "granted", subscribed: true };
    expect(await ask("chat-post")).toBeNull();
    device = { ...chrome, permission: "denied" };
    expect(await ask("chat-post")).toBeNull();
  });

  it("counts closing the browser's prompt as Not now", async () => {
    answer = "dismissed";
    const { user } = renderPage(<PushAskCard moment="chat-post" />);
    await ask("chat-post");
    await user.click(screen.getByRole("button", { name: "Turn on" }));
    await waitFor(() => expect(card()).toBeNull());
    expect(saved(PUSH_ASK_STORAGE_KEY)).toMatchObject({ dismissals: 1 });
    expect(track).toHaveBeenCalledWith("push_ask_result", {
      moment: "chat-post",
      kind: "card",
      outcome: "dismissed",
    });
  });

  it("says what to do when the browser blocks them", async () => {
    answer = "denied";
    const { user } = renderPage(<PushAskCard moment="chat-post" />);
    await ask("chat-post");
    await user.click(screen.getByRole("button", { name: "Turn on" }));
    expect(
      await screen.findByText(
        "Your browser blocked notifications for Terpsicle. Allow them in its site settings, then try again.",
      ),
    ).toBeVisible();
    expect(track).toHaveBeenCalledWith("push_ask_result", {
      moment: "chat-post",
      kind: "card",
      outcome: "blocked",
    });
  });

  it.each([
    ["Turn on", "Your browser asks you to allow them"],
    ["Not now", "Don't ask me for a while"],
  ])("gives %s a tooltip", async (name, tip) => {
    const { user } = renderPage(<PushAskCard moment="chat-post" />);
    await ask("chat-post");
    await user.hover(screen.getByRole("button", { name }));
    expect(await screen.findByRole("tooltip", { name: tip })).toBeVisible();
  });
});

describe("the other moments", () => {
  it("asks after connecting ELMS in its own words", async () => {
    renderPage(<PushAskCard moment="todo-connected" />);
    expect(await ask("todo-connected")).toBe("card");
    expect(
      screen.getByRole("region", {
        name: "Remind you the evening before something's due?",
      }),
    ).toBeVisible();
  });

  it("asks for a seat watch only where the page has a place for it", async () => {
    // The watch started away from course details: the install prompt's turn.
    renderPage();
    expect(await ask("seat-watch")).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
  });

  it("waits a moment for its page to mount (course details on a phone, after signing in)", async () => {
    const view = renderPage();
    let asked: Promise<unknown> = Promise.resolve();
    act(() => {
      asked = askForPush("seat-watch", NOW, { waitForPage: true });
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    view.rerender(
      <TooltipProvider delayDuration={0}>
        <PushAskCard moment="seat-watch" />
        <PushAskHost />
      </TooltipProvider>,
    );
    await act(async () => {
      expect(await asked).toBe("card");
    });
    expect(
      screen.getByRole("region", { name: "Hear the moment a seat opens?" }),
    ).toBeVisible();
  });

  it("lets an unanswered card go with its page: it asked once", async () => {
    const { unmount } = renderPage(<PushAskCard moment="chat-post" />);
    await ask("chat-post");
    unmount();
    expect(usePushAsk.getState().card).toBeNull();
    renderPage(<PushAskCard moment="chat-post" />);
    expect(card()).toBeNull();
  });
});

describe("on iPhone", () => {
  it("asks in a Safari tab with the three steps to the Home Screen, and counts as the install prompt", async () => {
    device = iphoneTab;
    const { user } = renderPage();
    expect(await ask("chat-post")).toBe("iphone-setup");
    const sheet = await screen.findByRole("dialog", {
      name: "Get notifications on your iPhone",
    });
    expect(sheet).toHaveAccessibleDescription(
      "iPhone only sends notifications to apps on your Home Screen. It takes three taps, once.",
    );
    const steps = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(steps).toEqual([
      "1Tap Share in Safari's bar",
      "2Choose Add to Home Screen",
      "3Open Terpsicle from your Home Screen. We'll ask once, right there.",
    ]);
    // Focus starts on the main action. Base UI's sheet puts it there a frame
    // after it opens (its focus manager queues it), not as it mounts.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Got it" })).toHaveFocus(),
    );
    // The same ask as the install prompt's iPhone steps: not both today.
    expect(requestInstallPrompt("chat-joined", NOW)).toBe(false);

    await user.click(screen.getByRole("button", { name: "Got it" }));
    await waitFor(() => expect(usePushAsk.getState().sheet).toBeNull());
    expect(saved(PUSH_ASK_STORAGE_KEY)).toMatchObject({ dismissals: 1 });
    expect(saved(INSTALL_PROMPT_STORAGE_KEY)).toEqual({
      dismissals: 1,
      lastDismissedAt: NOW.toISOString(),
    });
    newSession();
    expect(await ask("seat-watch")).toBeNull();
  });

  it("doesn't ask on an iPhone tab when the install prompt showed this session", async () => {
    device = iphoneTab;
    renderPage();
    window.sessionStorage.setItem("terpsicle:install-shown", "1");
    expect(await ask("chat-post")).toBeNull();
  });

  it("shows the Home Screen app's Turn on step by itself, once, as soon as you're signed in there", async () => {
    device = iphoneApp;
    useAccount.setState({ status: "signed-out" });
    const { user } = renderPage();
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() =>
      useAccount.setState({
        status: "signed-in",
        flags: { ...FLAGS_OFF, signIn: true, push: true },
        pushPublicKey: "BKey",
      }),
    );
    const sheet = await screen.findByRole("dialog", {
      name: "Turn on notifications",
    });
    expect(sheet).toHaveTextContent(
      "Turn on notifications. iPhone asks you to allow them.",
    );
    expect(saved(PUSH_ASK_STORAGE_KEY)).toMatchObject({
      homeScreenAskedAt: expect.any(String),
    });
    await user.click(screen.getByRole("button", { name: "Turn on" }));
    expect(turnOn).toHaveBeenCalledWith("BKey");
    expect(await screen.findByText("Notifications are on here")).toBeVisible();

    newSession();
    expect(await ask("home-screen")).toBeNull();
  });

  it("doesn't count the Home Screen app's Not now against the moments: it asked its once", async () => {
    device = iphoneApp;
    const { user } = renderPage();
    await screen.findByRole("dialog", { name: "Turn on notifications" });
    await user.click(screen.getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(usePushAsk.getState().sheet).toBeNull());
    expect(saved(PUSH_ASK_STORAGE_KEY)).toMatchObject({ dismissals: 0 });
  });
});
