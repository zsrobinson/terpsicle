import { describe, expect, it } from "vitest";
import {
  type PushAskMoment,
  type PushAskState,
  PushAskStateSchema,
} from "../schema";
import {
  DEFAULT_PUSH_ASK_STATE,
  MAX_PUSH_ASK_DISMISSALS,
  PUSH_ASK_COOLDOWN_DAYS,
  PUSH_ASK_WORDS,
  type PushAskDevice,
  pushAskKind,
  recordHomeScreenAsk,
  recordPushAskDismissal,
} from "./push-ask";

const NOW = new Date("2026-09-28T12:00:00.000Z");
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 86_400_000).toISOString();

/** Chrome on a laptop, never asked. */
const chrome: PushAskDevice = {
  support: "ok",
  permission: "default",
  subscribed: false,
  iosSafari: false,
  iosHomeScreen: false,
};
/** Safari on iPhone, in a tab. */
const iphoneTab: PushAskDevice = {
  support: "ios-home-screen",
  permission: "default",
  subscribed: false,
  iosSafari: true,
  iosHomeScreen: false,
};
/** Terpsicle opened from the iPhone's Home Screen. */
const iphoneApp: PushAskDevice = {
  support: "ok",
  permission: "default",
  subscribed: false,
  iosSafari: false,
  iosHomeScreen: true,
};

const MOMENTS = ["chat-post", "todo-connected", "seat-watch"] as const;

const kind = (
  over: {
    moment?: PushAskMoment;
    device?: Partial<PushAskDevice>;
    state?: PushAskState | null;
    askedThisSession?: boolean;
  } = {},
) =>
  pushAskKind({
    moment: over.moment ?? "chat-post",
    device: { ...chrome, ...over.device },
    state: over.state === undefined ? DEFAULT_PUSH_ASK_STATE : over.state,
    now: NOW,
    askedThisSession: over.askedThisSession ?? false,
  });

describe("pushAskKind", () => {
  it("asks in our words at each moment, where the browser can say yes", () => {
    for (const moment of MOMENTS) expect(kind({ moment })).toBe("card");
  });

  it("on an iPhone tab, asks with the three steps to the Home Screen", () => {
    for (const moment of MOMENTS)
      expect(kind({ moment, device: iphoneTab })).toBe("iphone-setup");
  });

  it("doesn't ask in iPhone browsers that can't add to the Home Screen", () => {
    expect(kind({ device: { ...iphoneTab, iosSafari: false } })).toBeNull();
  });

  it("never asks once notifications are on here, or blocked, or impossible", () => {
    expect(
      kind({ device: { permission: "granted", subscribed: true } }),
    ).toBeNull();
    expect(kind({ device: { permission: "denied" } })).toBeNull();
    expect(kind({ device: { support: "unsupported" } })).toBeNull();
  });

  it("asks again where notifications are allowed but not on here (turned off, or another account's)", () => {
    expect(kind({ device: { permission: "granted", subscribed: false } })).toBe(
      "card",
    );
  });

  it("asks at most once a session, across every moment", () => {
    for (const moment of [...MOMENTS, "home-screen"] as const)
      expect(
        kind({ moment, device: iphoneApp, askedThisSession: true }),
      ).toBeNull();
  });

  it("remembers Not now for 90 days, and stops after two", () => {
    expect(PUSH_ASK_COOLDOWN_DAYS).toBe(90);
    expect(MAX_PUSH_ASK_DISMISSALS).toBe(2);
    const once = recordPushAskDismissal(DEFAULT_PUSH_ASK_STATE, NOW);
    expect(once).toEqual({
      dismissals: 1,
      lastDismissedAt: NOW.toISOString(),
      homeScreenAskedAt: null,
    });
    // Not now in Chat quiets Todo and seats too: one ask, not three.
    for (const moment of MOMENTS)
      expect(kind({ moment, state: once })).toBeNull();
    const later = { ...once, lastDismissedAt: daysAgo(89) };
    expect(kind({ state: later })).toBeNull();
    expect(kind({ state: { ...once, lastDismissedAt: daysAgo(90) } })).toBe(
      "card",
    );
    const twice = {
      dismissals: 2,
      lastDismissedAt: daysAgo(400),
      homeScreenAskedAt: null,
    };
    expect(kind({ state: twice })).toBeNull();
    expect(kind({ state: twice, device: iphoneTab })).toBeNull();
  });

  it("asks only when it could remember the answer", () => {
    expect(kind({ state: null })).toBeNull();
    expect(
      kind({ moment: "home-screen", device: iphoneApp, state: null }),
    ).toBeNull();
  });

  it("reads an unreadable dismissal date as long ago", () => {
    expect(
      kind({
        state: {
          ...DEFAULT_PUSH_ASK_STATE,
          dismissals: 1,
          lastDismissedAt: "garbage",
        },
      }),
    ).toBe("card");
  });

  describe("the Home Screen app's first launch", () => {
    it("shows the Turn on step by itself, once per device", () => {
      expect(kind({ moment: "home-screen", device: iphoneApp })).toBe(
        "home-screen",
      );
      const asked = recordHomeScreenAsk(DEFAULT_PUSH_ASK_STATE, NOW);
      expect(asked.homeScreenAskedAt).toBe(NOW.toISOString());
      expect(
        kind({ moment: "home-screen", device: iphoneApp, state: asked }),
      ).toBeNull();
    });

    it("still asks after a Not now in Safari: it's what the person installed it for", () => {
      const twice = recordPushAskDismissal(
        recordPushAskDismissal(DEFAULT_PUSH_ASK_STATE, NOW),
        NOW,
      );
      expect(
        kind({ moment: "home-screen", device: iphoneApp, state: twice }),
      ).toBe("home-screen");
    });

    it("isn't a thing anywhere but the iPhone's Home Screen app, or once decided", () => {
      expect(kind({ moment: "home-screen" })).toBeNull();
      expect(kind({ moment: "home-screen", device: iphoneTab })).toBeNull();
      for (const permission of ["granted", "denied"] as const)
        expect(
          kind({
            moment: "home-screen",
            device: { ...iphoneApp, permission },
          }),
        ).toBeNull();
    });
  });
});

describe("PushAskStateSchema", () => {
  it("reads state saved before the Home Screen ask existed", () => {
    expect(
      PushAskStateSchema.parse({ dismissals: 1, lastDismissedAt: null }),
    ).toEqual({
      dismissals: 1,
      lastDismissedAt: null,
      homeScreenAskedAt: null,
    });
  });
});

describe("PUSH_ASK_WORDS", () => {
  it("asks a question, and says where to change it", () => {
    for (const { title, line } of Object.values(PUSH_ASK_WORDS)) {
      expect(title).toMatch(/\?$/);
      expect(line).toMatch(/Change it anytime in Settings\.$/);
      expect(`${title} ${line}`).not.toMatch(/Terpsicle|!/);
    }
    expect(PUSH_ASK_WORDS["chat-post"].title).toBe(
      "Hear back when someone answers?",
    );
    expect(PUSH_ASK_WORDS["todo-connected"].title).toBe(
      "Remind you the evening before something's due?",
    );
  });
});
