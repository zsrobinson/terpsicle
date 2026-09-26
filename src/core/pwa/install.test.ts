import { describe, expect, it } from "vitest";
import { SCHEDULE_PATH } from "../routing";
import {
  InstallPromptStateSchema,
  PushPayloadSchema,
  PWA_START_URL,
} from "../schema";
import { deviceLabel } from "./device-label";
import {
  DEFAULT_INSTALL_PROMPT_STATE,
  INSTALL_BENEFITS,
  INSTALL_COOLDOWN_DAYS,
  type InstallEnvironment,
  installMethod,
  installPlatform,
  isIosSafari,
  MAX_INSTALL_DISMISSALS,
  recordInstallDismissal,
  shouldOfferInstall,
} from "./install";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1",
  iphoneInstagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 390.0.0.28.85",
  // iPadOS asks for desktop sites: it says Macintosh, but has touch.
  ipadSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  windowsEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0",
  desktopChrome:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  desktopFirefox:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0",
};

const env = (over: Partial<InstallEnvironment>): InstallEnvironment => ({
  userAgent: UA.desktopChrome,
  maxTouchPoints: 0,
  standalone: false,
  canPrompt: false,
  ...over,
});

const NOW = new Date("2026-09-26T12:00:00.000Z");
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 86_400_000).toISOString();

describe("installMethod", () => {
  it("uses the browser's own prompt once it has offered one", () => {
    expect(installMethod(env({ canPrompt: true }))).toBe("prompt");
    expect(
      installMethod(env({ userAgent: UA.androidChrome, canPrompt: true })),
    ).toBe("prompt");
  });

  it("shows the Share steps in Safari on iPhone and iPad", () => {
    expect(
      installMethod(env({ userAgent: UA.iphoneSafari, maxTouchPoints: 5 })),
    ).toBe("ios-steps");
    expect(
      installMethod(env({ userAgent: UA.ipadSafari, maxTouchPoints: 5 })),
    ).toBe("ios-steps");
  });

  it("offers nothing where installing doesn't work", () => {
    // No prompt yet (or ever): Firefox, Safari on a Mac, Chrome before it
    // decides the site is installable.
    expect(installMethod(env({ userAgent: UA.desktopFirefox }))).toBeNull();
    expect(installMethod(env({ userAgent: UA.macSafari }))).toBeNull();
    expect(installMethod(env({}))).toBeNull();
    // Other iOS browsers and in-app browsers: the steps would be wrong.
    expect(
      installMethod(env({ userAgent: UA.iphoneChrome, maxTouchPoints: 5 })),
    ).toBeNull();
    expect(
      installMethod(env({ userAgent: UA.iphoneInstagram, maxTouchPoints: 5 })),
    ).toBeNull();
  });

  it("offers nothing once installed", () => {
    expect(
      installMethod(env({ standalone: true, canPrompt: true })),
    ).toBeNull();
    expect(
      installMethod(
        env({
          userAgent: UA.iphoneSafari,
          maxTouchPoints: 5,
          standalone: true,
        }),
      ),
    ).toBeNull();
  });

  it("tells an iPad from a Mac by touch", () => {
    expect(isIosSafari(UA.macSafari, 0)).toBe(false);
    expect(isIosSafari(UA.ipadSafari, 5)).toBe(true);
  });

  it("names the platform for analytics", () => {
    expect(installPlatform("ios-steps")).toBe("ios");
    expect(installPlatform("prompt")).toBe("chromium");
  });
});

describe("shouldOfferInstall", () => {
  const offer = (
    over: Partial<Parameters<typeof shouldOfferInstall>[0]> = {},
  ) =>
    shouldOfferInstall({
      method: "prompt",
      state: DEFAULT_INSTALL_PROMPT_STATE,
      now: NOW,
      shownThisSession: false,
      ...over,
    });

  it("offers the first time on a browser that can install", () => {
    expect(offer()).toBe(true);
    expect(offer({ method: "ios-steps" })).toBe(true);
  });

  it("never offers where the app can't be installed, or already is", () => {
    expect(offer({ method: null })).toBe(false);
  });

  it("offers at most once a session", () => {
    expect(offer({ shownThisSession: true })).toBe(false);
  });

  it("doesn't offer when storage can't be read", () => {
    expect(offer({ state: null })).toBe(false);
  });

  it(`waits ${INSTALL_COOLDOWN_DAYS} days after a dismissal`, () => {
    const dismissedDaysAgo = (days: number) =>
      offer({ state: { dismissals: 1, lastDismissedAt: daysAgo(days) } });
    expect(dismissedDaysAgo(0)).toBe(false);
    expect(dismissedDaysAgo(INSTALL_COOLDOWN_DAYS - 1)).toBe(false);
    expect(dismissedDaysAgo(INSTALL_COOLDOWN_DAYS)).toBe(true);
  });

  it(`stops after ${MAX_INSTALL_DISMISSALS} dismissals`, () => {
    let state = recordInstallDismissal(DEFAULT_INSTALL_PROMPT_STATE, NOW);
    expect(InstallPromptStateSchema.parse(state)).toEqual(state);
    const later = new Date(NOW.getTime() + 365 * 86_400_000);
    expect(offer({ state, now: later })).toBe(true);
    state = recordInstallDismissal(state, later);
    expect(state.dismissals).toBe(MAX_INSTALL_DISMISSALS);
    expect(
      offer({ state, now: new Date(later.getTime() + 999 * 86_400_000) }),
    ).toBe(false);
  });

  it("treats an unreadable date as long ago", () => {
    expect(offer({ state: { dismissals: 1, lastDismissedAt: "soon" } })).toBe(
      true,
    );
  });
});

describe("install copy", () => {
  it("says what installing gives you, in the plan's words", () => {
    expect(INSTALL_BENEFITS).toEqual([
      "Get notified when a seat opens or a classmate replies",
      "Open it from your home screen, like an app",
      "Use the full screen, without browser bars",
    ]);
  });
});

describe("deviceLabel", () => {
  it("names the device and browser", () => {
    expect(deviceLabel(UA.iphoneSafari)).toBe("iPhone · Safari");
    expect(deviceLabel(UA.iphoneChrome)).toBe("iPhone · Chrome");
    expect(deviceLabel(UA.ipadSafari, 5)).toBe("iPad · Safari");
    expect(deviceLabel(UA.macSafari)).toBe("Mac · Safari");
    expect(deviceLabel(UA.androidChrome)).toBe("Android · Chrome");
    expect(deviceLabel(UA.windowsEdge)).toBe("Windows · Edge");
    expect(deviceLabel(UA.desktopFirefox)).toBe("Windows · Firefox");
    expect(deviceLabel(UA.desktopChrome)).toBe("Linux · Chrome");
    expect(deviceLabel("curl/8.0")).toBe("Device · Browser");
  });

  it("stays self-contained, for the service worker", () => {
    // Stringified and rebuilt, as /sw.js does.
    const copy = new Function(
      `return (${deviceLabel.toString()})`,
    )() as typeof deviceLabel;
    expect(copy(UA.iphoneSafari)).toBe("iPhone · Safari");
  });
});

describe("PushPayloadSchema", () => {
  const ok = {
    v: 1,
    type: "seat-open",
    title: "CMSC131 0101 has a seat",
    body: "",
    url: "/schedule",
    tag: "seat:202701:CMSC131-0101",
  };

  it("takes the plan's fields", () => {
    expect(PushPayloadSchema.parse(ok)).toEqual(ok);
    for (const missing of ["v", "type", "title", "url", "tag"]) {
      const { [missing]: _, ...rest } = ok as Record<string, unknown>;
      expect(PushPayloadSchema.safeParse(rest).success, missing).toBe(false);
    }
  });

  it("only ever opens Terpsicle", () => {
    for (const url of [
      "https://evil.example/",
      "//evil.example/x",
      "javascript:alert(1)",
      "schedule",
      "",
    ])
      expect(PushPayloadSchema.safeParse({ ...ok, url }).success).toBe(false);
  });

  it("needs a title and a known version", () => {
    expect(PushPayloadSchema.safeParse({ ...ok, title: " " }).success).toBe(
      false,
    );
    expect(PushPayloadSchema.safeParse({ ...ok, v: 2 }).success).toBe(false);
  });
});

describe("PWA_START_URL", () => {
  it("opens the installed app on the scheduler", () => {
    expect(PWA_START_URL).toBe(SCHEDULE_PATH);
  });
});
