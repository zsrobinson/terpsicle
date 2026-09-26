import { describe, expect, it } from "vitest";
import { InstallPromptPrefsSchema, PushPayloadSchema } from "../schema";
import {
  DEFAULT_INSTALL_PROMPT_PREFS,
  INSTALL_COOLDOWN_DAYS,
  type InstallEnvironment,
  installBenefits,
  installDevice,
  installMethod,
  isIosSafari,
  neverOfferInstall,
  recordInstallOffer,
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
});

describe("shouldOfferInstall", () => {
  const offer = (
    over: Partial<Parameters<typeof shouldOfferInstall>[0]> = {},
  ) =>
    shouldOfferInstall({
      method: "prompt",
      prefs: DEFAULT_INSTALL_PROMPT_PREFS,
      now: NOW,
      offeredThisSession: false,
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
    expect(offer({ offeredThisSession: true })).toBe(false);
  });

  it(`waits ${INSTALL_COOLDOWN_DAYS} days after the last offer`, () => {
    const offeredDaysAgo = (days: number) =>
      offer({ prefs: { lastOfferedAt: daysAgo(days), never: false } });
    expect(offeredDaysAgo(0)).toBe(false);
    expect(offeredDaysAgo(INSTALL_COOLDOWN_DAYS - 1)).toBe(false);
    expect(offeredDaysAgo(INSTALL_COOLDOWN_DAYS)).toBe(true);
    expect(offeredDaysAgo(90)).toBe(true);
  });

  it("never offers again after Don't ask again", () => {
    const never = neverOfferInstall(DEFAULT_INSTALL_PROMPT_PREFS);
    expect(offer({ prefs: never })).toBe(false);
    expect(offer({ prefs: { ...never, lastOfferedAt: daysAgo(365) } })).toBe(
      false,
    );
  });

  it("starts the cooldown when it offers", () => {
    const prefs = recordInstallOffer(DEFAULT_INSTALL_PROMPT_PREFS, NOW);
    expect(InstallPromptPrefsSchema.parse(prefs)).toEqual(prefs);
    expect(offer({ prefs })).toBe(false);
    expect(
      offer({
        prefs,
        now: new Date(NOW.getTime() + INSTALL_COOLDOWN_DAYS * 86_400_000),
      }),
    ).toBe(true);
  });

  it("treats an unreadable date as never offered", () => {
    expect(offer({ prefs: { lastOfferedAt: "soon", never: false } })).toBe(
      true,
    );
  });
});

describe("install copy", () => {
  it("names the home screen on phones and the dock on computers", () => {
    expect(installDevice(UA.iphoneSafari, 5)).toBe("mobile");
    expect(installDevice(UA.androidChrome, 5)).toBe("mobile");
    expect(installDevice(UA.desktopChrome, 0)).toBe("desktop");
    expect(installBenefits("mobile")).toEqual([
      "Get notified when your class chat or a seat alert needs you",
      "Open Terpsicle from your home screen",
      "Full screen, no browser bars",
    ]);
    expect(installBenefits("desktop")[1]).toBe(
      "Open Terpsicle from your dock or taskbar",
    );
  });
});

describe("PushPayloadSchema", () => {
  const ok = { title: "CMSC131 0101 has a seat", body: "", url: "/schedule" };

  it("takes a title, body, a path on this site and an optional tag", () => {
    expect(PushPayloadSchema.parse({ ...ok, tag: "seat" })).toEqual({
      ...ok,
      tag: "seat",
    });
    expect(PushPayloadSchema.safeParse(ok).success).toBe(true);
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

  it("needs a title", () => {
    expect(PushPayloadSchema.safeParse({ ...ok, title: " " }).success).toBe(
      false,
    );
  });
});
