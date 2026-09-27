import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fromBase64url } from "~/core/push/bytes";
import { notificationsApi } from "~/server/fns/notifications";
import { turnOffHere, turnOnHere } from "./this-device";

vi.mock("~/server/fns/notifications", () => ({
  notificationsApi: { subscribe: vi.fn(), unsubscribe: vi.fn() },
}));

const api = vi.mocked(notificationsApi);
const KEY =
  "BCaZdJdFpRKWBFQ3DgGmlr7qXSXYHrxL1ktLZ4D2K5obuJNbs_n3StLJluqcDpQ7JLHoJfcVyYTqNiqYkBfSZ8o";
const OTHER_KEY =
  "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";

function aSubscription(key: string, endpoint = "https://fcm.googleapis.com/x") {
  const bytes = fromBase64url(key);
  return {
    endpoint,
    options: { applicationServerKey: bytes?.buffer ?? null },
    toJSON: () => ({ endpoint, keys: { p256dh: KEY, auth: "a".repeat(22) } }),
    unsubscribe: vi.fn(async () => true),
  };
}

let current: ReturnType<typeof aSubscription> | null;
let permission: NotificationPermission;
const subscribe = vi.fn(
  async (options: { applicationServerKey: Uint8Array }) => {
    current = aSubscription(
      btoa(String.fromCharCode(...options.applicationServerKey))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, ""),
      "https://fcm.googleapis.com/new",
    );
    return current;
  },
);

beforeEach(() => {
  vi.clearAllMocks();
  current = null;
  permission = "granted";
  api.subscribe.mockResolvedValue({ status: "ok" });
  api.unsubscribe.mockResolvedValue({ status: "ok" });
  const registration = {
    pushManager: { getSubscription: async () => current, subscribe },
  };
  vi.stubGlobal("PushManager", class {});
  vi.stubGlobal("Notification", {
    permission: "default",
    requestPermission: async () => permission,
  });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration: async () => registration },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("turnOnHere", () => {
  it("subscribes with the key and saves it with this device's label", async () => {
    expect(await turnOnHere(KEY)).toBe("on");
    expect(subscribe).toHaveBeenCalledOnce();
    expect(api.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "https://fcm.googleapis.com/new" }),
    );
  });

  it("replaces a subscription made with another key (a rotated pair)", async () => {
    const old = aSubscription(OTHER_KEY);
    current = old;
    expect(await turnOnHere(KEY)).toBe("on");
    expect(old.unsubscribe).toHaveBeenCalledOnce();
    expect(subscribe).toHaveBeenCalledOnce();
  });

  it("reuses a subscription made with this key", async () => {
    current = aSubscription(KEY);
    expect(await turnOnHere(KEY)).toBe("on");
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("maps the permission answer, and asks nothing more when refused", async () => {
    permission = "denied";
    expect(await turnOnHere(KEY)).toBe("denied");
    permission = "default";
    expect(await turnOnHere(KEY)).toBe("dismissed");
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("drops the browser's subscription when the server won't use it", async () => {
    api.subscribe.mockResolvedValue({ status: "unsupported" });
    expect(await turnOnHere(KEY)).toBe("unsupported");
    expect(current?.unsubscribe).toHaveBeenCalledOnce();
    api.subscribe.mockResolvedValue({ status: "off" });
    expect(await turnOnHere(KEY)).toBe("off-here");
  });

  it("says failed, never throws, when the browser does", async () => {
    vi.stubGlobal("Notification", {
      permission: "default",
      requestPermission: async () => {
        throw new Error("insecure context");
      },
    });
    expect(await turnOnHere(KEY)).toBe("failed");
  });
});

describe("turnOffHere", () => {
  it("forgets it on the account, then in the browser", async () => {
    const sub = aSubscription(KEY);
    current = sub;
    await turnOffHere();
    expect(api.unsubscribe).toHaveBeenCalledWith({ endpoint: sub.endpoint });
    expect(sub.unsubscribe).toHaveBeenCalledOnce();
  });

  it("does nothing without a subscription", async () => {
    await turnOffHere();
    expect(api.unsubscribe).not.toHaveBeenCalled();
  });
});
