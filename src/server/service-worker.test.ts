import { describe, expect, it, type Mock, vi } from "vitest";
import { pushMessage } from "~/core/push";
import { deviceLabel } from "~/core/pwa";
import { PushPayloadSchema } from "~/core/schema";
import {
  installServiceWorker,
  precacheBuildId,
  readPushPayload,
  type ServiceWorkerConfig,
  type SwCache,
  type SwCaches,
  type SwNotificationOptions,
  type SwPushSubscription,
  type SwScope,
  type SwWindowClient,
  serviceWorkerScript,
} from "./service-worker";

const ORIGIN = "https://terpsicle.com";

/** An in-memory Cache Storage, keyed by URL, in insertion order. */
function fakeCaches(): SwCaches & {
  stores: Map<string, Map<string, Response>>;
} {
  const stores = new Map<string, Map<string, Response>>();
  const urlOf = (r: Request | string) => (typeof r === "string" ? r : r.url);
  const open = async (name: string): Promise<SwCache> => {
    const store = stores.get(name) ?? new Map<string, Response>();
    stores.set(name, store);
    return {
      match: async (r) => store.get(urlOf(r))?.clone(),
      put: async (r, response) => {
        store.delete(urlOf(r));
        store.set(urlOf(r), response);
      },
      keys: async () => [...store.keys()].map((u) => new Request(u)),
      delete: async (r) => store.delete(urlOf(r)),
    };
  };
  return {
    stores,
    open,
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
  };
}

type Listener = (event: never) => void;

/** A window the notification click can find. */
function aWindow(url: string, { controlled = true } = {}): SwWindowClient {
  const client: SwWindowClient & { postMessage: Mock } = {
    url,
    focus: vi.fn(async (): Promise<unknown> => client),
    navigate: vi.fn(async (to: string): Promise<unknown> => {
      if (!controlled) throw new TypeError("Not controlled");
      client.url = to;
      return client;
    }),
    postMessage: vi.fn(),
  };
  return client;
}

/** Installs the service worker on a fake scope; `fetchWith` swaps the network. */
function setUp(over: Partial<ServiceWorkerConfig> = {}) {
  const listeners = new Map<string, Listener>();
  const caches = fakeCaches();
  let network: (request: Request) => Promise<Response> = async () =>
    new Response("");
  const shown: { title: string; options: SwNotificationOptions }[] = [];
  /** What the device shows now: one per tag, as browsers keep them. */
  const showing: {
    title: string;
    options: SwNotificationOptions;
    close: Mock;
  }[] = [];
  const badges: (number | "cleared")[] = [];
  const opened: string[] = [];
  let windows: SwWindowClient[] = [];
  const skipWaiting = vi.fn(async () => {});
  const subscribe = vi.fn(
    async (options: { applicationServerKey: ArrayBuffer }) =>
      aSubscription("https://push.example/new", options.applicationServerKey),
  );
  const scope: SwScope = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: Listener) =>
      listeners.set(type, listener),
    skipWaiting,
    navigator: {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
      setAppBadge: async (count: number) => {
        badges.push(count);
      },
      clearAppBadge: async () => {
        badges.push("cleared");
      },
    },
    registration: {
      showNotification: async (title, options) => {
        shown.push({ title, options });
        const same = showing.findIndex((n) => n.options.tag === options.tag);
        if (options.tag !== undefined && same >= 0) showing.splice(same, 1);
        const entry = {
          title,
          options,
          close: vi.fn(() => {
            const at = showing.indexOf(entry);
            if (at >= 0) showing.splice(at, 1);
          }),
        };
        showing.push(entry);
      },
      getNotifications: async ({ tag }: { tag: string }) =>
        showing
          .filter((n) => n.options.tag === tag)
          .map((n) => ({ data: n.options.data, close: n.close })),
      pushManager: { subscribe },
    },
    clients: {
      claim: async () => {},
      matchAll: async () => windows,
      openWindow: async (url) => {
        opened.push(url);
        return null;
      },
    },
  } as SwScope;
  const config: ServiceWorkerConfig = {
    version: 1,
    maxAssets: 400,
    build: "b1",
    precache: [],
    startUrl: "/schedule",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-72.png",
    skipWaitingMessage: "skip-waiting",
    subscribePath: "/api/push/subscribe",
    readPath: "/api/notifications/read",
    readMessage: "notifications-read",
    ...over,
  };
  installServiceWorker(
    scope,
    caches,
    (r) => network(r),
    readPushPayload,
    deviceLabel,
    config,
  );

  /** Fires an event and waits for what it passed to waitUntil. */
  const dispatch = async (type: string, event: object) => {
    let done: Promise<unknown> = Promise.resolve();
    listeners.get(type)?.({
      ...event,
      waitUntil: (p: Promise<unknown>) => {
        done = p;
      },
    } as never);
    await done;
  };

  /** What the page gets for a request, or undefined when the SW stays out of it. */
  const request = async (
    path: string,
    { navigate = false, method = "GET" } = {},
  ): Promise<Response | undefined> => {
    const req = new Request(`${ORIGIN}${path}`, { method });
    if (navigate) Object.defineProperty(req, "mode", { value: "navigate" });
    let answer: Promise<Response> | undefined;
    listeners.get("fetch")?.({
      request: req,
      respondWith: (r: Promise<Response>) => {
        answer = r;
      },
      waitUntil: () => {},
    } as never);
    return answer;
  };
  return {
    caches,
    request,
    install: () => dispatch("install", {}),
    activate: () => dispatch("activate", {}),
    message: (data: unknown) => dispatch("message", { data }),
    push: (data: unknown) =>
      dispatch("push", {
        data:
          data === null
            ? null
            : {
                json: () => {
                  if (typeof data === "string") return JSON.parse(data);
                  return data;
                },
              },
      }),
    click: (data: unknown) => {
      const close = vi.fn();
      return {
        close,
        done: dispatch("notificationclick", { notification: { data, close } }),
      };
    },
    subscriptionChanged: (event: {
      oldSubscription: SwPushSubscription | null;
      newSubscription: SwPushSubscription | null;
    }) => dispatch("pushsubscriptionchange", event),
    subscribe,
    shown,
    showing,
    badges,
    opened,
    skipWaiting,
    setWindows: (list: SwWindowClient[]) => {
      windows = list;
    },
    fetchWith: (fn: (request: Request) => Promise<Response>) => {
      network = fn;
    },
  };
}

/** A push subscription as the browser reports it. */
function aSubscription(
  endpoint: string,
  key: ArrayBuffer | null = new Uint8Array([4, 1, 2]).buffer,
): SwPushSubscription {
  return {
    options: { applicationServerKey: key },
    toJSON: () => ({ endpoint, keys: { p256dh: "p256", auth: "secret" } }),
  };
}

const html = (body: string) =>
  new Response(body, { headers: { "Content-Type": "text/html" } });
const offline = async (): Promise<Response> => {
  throw new TypeError("Failed to fetch");
};

describe("service worker: pages and files", () => {
  it("always loads pages from the network while online, so a new deploy shows at once", async () => {
    const sw = setUp();
    sw.fetchWith(async () => html("deploy 1"));
    expect(
      await (await sw.request("/schedule", { navigate: true }))?.text(),
    ).toBe("deploy 1");
    sw.fetchWith(async () => html("deploy 2"));
    expect(
      await (
        await sw.request("/schedule?plan=abc", { navigate: true })
      )?.text(),
    ).toBe("deploy 2");
  });

  it("serves the last copy of the page when offline", async () => {
    const sw = setUp();
    sw.fetchWith(async () => html("the schedule"));
    await sw.request("/schedule", { navigate: true });
    sw.fetchWith(offline);
    expect(
      await (
        await sw.request("/schedule?plan=abc", { navigate: true })
      )?.text(),
    ).toBe("the schedule");
    // A page never loaded online falls back to the scheduler's copy.
    expect(
      await (await sw.request("/settings", { navigate: true }))?.text(),
    ).toBe("the schedule");
    // So does any of the scheduler's views, which are the same page.
    expect(
      await (
        await sw.request("/schedule/course/CMSC351?tab=search", {
          navigate: true,
        })
      )?.text(),
    ).toBe("the schedule");
  });

  it("else falls back to the page kept most recently, since every path is the same app", async () => {
    const sw = setUp();
    sw.fetchWith(async (r) => html(`app at ${new URL(r.url).pathname}`));
    await sw.request("/reviews", { navigate: true });
    await sw.request("/", { navigate: true });
    sw.fetchWith(offline);
    expect(await (await sw.request("/chat", { navigate: true }))?.text()).toBe(
      "app at /",
    );
    // Visiting a page again makes it the newest.
    sw.fetchWith(async () => html("reviews again"));
    await sw.request("/reviews", { navigate: true });
    sw.fetchWith(offline);
    expect(await (await sw.request("/chat", { navigate: true }))?.text()).toBe(
      "reviews again",
    );
    // The scheduler's copy wins once there is one.
    sw.fetchWith(async () => html("the schedule"));
    await sw.request("/schedule", { navigate: true });
    await sw.request("/reviews", { navigate: true });
    sw.fetchWith(offline);
    expect(await (await sw.request("/chat", { navigate: true }))?.text()).toBe(
      "the schedule",
    );
  });

  it("fails like the network when nothing was ever kept", async () => {
    const sw = setUp();
    sw.fetchWith(offline);
    await expect(sw.request("/schedule", { navigate: true })).rejects.toThrow(
      "Failed to fetch",
    );
  });

  it("doesn't keep error pages", async () => {
    const sw = setUp();
    sw.fetchWith(async () => html("good"));
    await sw.request("/", { navigate: true });
    sw.fetchWith(async () => new Response("down", { status: 503 }));
    await sw.request("/", { navigate: true });
    sw.fetchWith(offline);
    expect(await (await sw.request("/", { navigate: true }))?.text()).toBe(
      "good",
    );
  });

  it("doesn't keep pages that say no-store, like the admin panel", async () => {
    const sw = setUp();
    sw.fetchWith(async () => html("the landing page"));
    await sw.request("/", { navigate: true });
    sw.fetchWith(
      async () =>
        new Response("the owner's queue", {
          headers: {
            "Content-Type": "text/html",
            "Cache-Control": "private, no-store",
          },
        }),
    );
    expect(await (await sw.request("/admin", { navigate: true }))?.text()).toBe(
      "the owner's queue",
    );
    sw.fetchWith(offline);
    // Neither kept for itself nor handed to another page as the newest copy.
    expect(await (await sw.request("/admin", { navigate: true }))?.text()).toBe(
      "the landing page",
    );
    expect(await (await sw.request("/chat", { navigate: true }))?.text()).toBe(
      "the landing page",
    );
  });

  it("precaches the app shell on install, so the first offline launch works", async () => {
    const sw = setUp({
      precache: ["/assets/index-a.js", "/assets/styles-b.css"],
    });
    const fetched: string[] = [];
    sw.fetchWith(async (r) => {
      fetched.push(r.url);
      return new Response(`file ${new URL(r.url).pathname}`);
    });
    await sw.install();
    expect(fetched).toEqual([
      `${ORIGIN}/assets/index-a.js`,
      `${ORIGIN}/assets/styles-b.css`,
    ]);
    sw.fetchWith(offline);
    expect(await (await sw.request("/assets/styles-b.css"))?.text()).toBe(
      "file /assets/styles-b.css",
    );
  });

  it("still installs when a shell file fails, and fetches it on first use", async () => {
    const sw = setUp({ precache: ["/assets/gone.js", "/assets/ok.js"] });
    sw.fetchWith(async (r) =>
      r.url.endsWith("gone.js")
        ? new Response("Not found", { status: 404 })
        : new Response("ok"),
    );
    await expect(sw.install()).resolves.toBeUndefined();
    const shell = sw.caches.stores.get("terpsicle-shell-v1-b1");
    expect([...(shell?.keys() ?? [])]).toEqual([`${ORIGIN}/assets/ok.js`]);
  });

  it("keeps build files once fetched, and serves them offline", async () => {
    const sw = setUp();
    let fetches = 0;
    sw.fetchWith(async () => {
      fetches++;
      return new Response("chunk");
    });
    await sw.request("/assets/routes-abc.js");
    sw.fetchWith(offline);
    expect(await (await sw.request("/assets/routes-abc.js"))?.text()).toBe(
      "chunk",
    );
    expect(fetches).toBe(1);
  });

  it("drops the oldest build files past the cap", async () => {
    const sw = setUp({ maxAssets: 2 });
    sw.fetchWith(async (r) => new Response(r.url));
    for (const name of ["a", "b", "c"]) await sw.request(`/assets/${name}.js`);
    const kept = [
      ...(sw.caches.stores.get("terpsicle-assets-v1")?.keys() ?? []),
    ];
    expect(kept).toEqual([`${ORIGIN}/assets/b.js`, `${ORIGIN}/assets/c.js`]);
  });

  it("never touches the API, sign-in, pictures, data or analytics, even navigations", async () => {
    const sw = setUp();
    for (const path of [
      "/api/alerts/list",
      "/api/auth/google/callback?code=x",
      "/auth/test",
      "/avatars/abc.jpg",
      "/data/catalog/terms.json",
      "/ingest",
      "/ingest/e/",
    ]) {
      expect(await sw.request(path), path).toBeUndefined();
      expect(await sw.request(path, { navigate: true }), path).toBeUndefined();
    }
  });

  it("stays out of other sites and anything but GET", async () => {
    const sw = setUp();
    expect(await sw.request("/", { method: "POST" })).toBeUndefined();
    // A path that only starts like one of those is still the app.
    expect(await sw.request("/apiary", { navigate: true })).toBeDefined();
  });

  it("drops the previous version's caches when it takes over", async () => {
    const sw = setUp({ version: 2 });
    await sw.caches.open("terpsicle-pages-v1");
    await sw.caches.open("terpsicle-shell-v2-old");
    await sw.caches.open("terpsicle-assets-v2");
    await sw.caches.open("someone-else");
    await sw.activate();
    expect(await sw.caches.keys()).toEqual([
      "terpsicle-assets-v2",
      "someone-else",
    ]);
  });
});

describe("service worker: updates", () => {
  it("waits after installing instead of taking over open tabs", async () => {
    const sw = setUp();
    await sw.install();
    expect(sw.skipWaiting).not.toHaveBeenCalled();
  });

  it("takes over when the app says Reload", async () => {
    const sw = setUp();
    await sw.message({ type: "something-else" });
    await sw.message(null);
    expect(sw.skipWaiting).not.toHaveBeenCalled();
    await sw.message({ type: "skip-waiting" });
    expect(sw.skipWaiting).toHaveBeenCalledOnce();
  });
});

const aPush = {
  v: 1,
  type: "seat-open",
  title: "CMSC131 0101 has a seat",
  body: "Register on Testudo before it's gone.",
  url: "/schedule?course=CMSC131",
  tag: "seat:202701:CMSC131-0101",
};

describe("service worker: push", () => {
  it("shows the payload's title and body, and remembers where to go", async () => {
    const sw = setUp();
    await sw.push(aPush);
    expect(sw.shown).toEqual([
      {
        title: "CMSC131 0101 has a seat",
        options: {
          body: "Register on Testudo before it's gone.",
          icon: "/icons/icon-192.png",
          badge: "/icons/badge-72.png",
          tag: "seat:202701:CMSC131-0101",
          data: {
            url: "/schedule?course=CMSC131",
            tag: "seat:202701:CMSC131-0101",
          },
        },
      },
    ]);
    // No badge in the payload: the app's number stays as it is.
    expect(sw.badges).toEqual([]);
  });

  it("keeps one notification per tag, rewritten for the group", async () => {
    const sw = setUp();
    const mention = {
      v: 1,
      type: "chat-mention",
      tag: "chat-mention:202701:CMSC351",
      url: "/chat/CMSC351/everyone",
    };
    await sw.push({
      ...mention,
      title: "Maya in CMSC351",
      body: "are we meeting at 7?",
      count: 1,
      badge: 1,
      renotify: true,
      id: "n1",
    });
    await sw.push({
      ...mention,
      title: "2 mentions in CMSC351",
      body: "Maya: also bring the notes",
      count: 2,
      badge: 1,
      renotify: false,
      id: "n2",
    });
    expect(sw.showing.map((n) => [n.title, n.options.body])).toEqual([
      ["2 mentions in CMSC351", "Maya: also bring the notes"],
    ]);
    // The first replaced nothing, so it buzzes without being told to; the
    // second, from the same person, replaces quietly.
    expect(sw.shown.map((n) => n.options.renotify)).toEqual([
      undefined,
      undefined,
    ]);
    expect(sw.shown[1]?.options.data).toEqual({
      url: mention.url,
      tag: mention.tag,
      id: "n2",
    });
    await sw.push({
      ...mention,
      title: "3 mentions in CMSC351",
      body: "Jon: me too",
      count: 3,
      badge: 2,
      renotify: true,
      id: "n3",
    });
    // Someone new: it replaces the notification and buzzes again.
    expect(sw.shown[2]?.options.renotify).toBe(true);
    expect(sw.showing).toHaveLength(1);
    expect(sw.badges).toEqual([1, 1, 2]);
  });

  it("groups a Declarative Web Push message as it does any push, since it's mutable", async () => {
    // What the server sends (V2 §6.7): Safari 18.4+ would show
    // `notification` itself, but hands it to us where we run.
    const sw = setUp();
    const mention = {
      v: 1,
      type: "chat-mention",
      tag: "chat-mention:202701:CMSC351",
      url: "/chat/CMSC351/everyone",
    } as const;
    await sw.push(
      pushMessage(
        {
          ...mention,
          title: "Maya in CMSC351",
          body: "are we meeting at 7?",
          count: 1,
          badge: 1,
          renotify: true,
          id: "n1",
        },
        ORIGIN,
      ),
    );
    await sw.push(
      pushMessage(
        {
          ...mention,
          title: "2 mentions in CMSC351",
          body: "Maya: also bring the notes",
          count: 2,
          badge: 2,
          renotify: false,
          id: "n2",
        },
        ORIGIN,
      ),
    );
    expect(sw.showing.map((n) => [n.title, n.options.body])).toEqual([
      ["2 mentions in CMSC351", "Maya: also bring the notes"],
    ]);
    // The path, never the declarative absolute link: a click stays on the
    // origin this worker serves (a preview's, localhost).
    expect(sw.showing[0]?.options.data).toEqual({
      url: mention.url,
      tag: mention.tag,
      id: "n2",
    });
    expect(sw.badges).toEqual([1, 2]);
  });

  it("reads a Declarative Web Push message exactly as the payload inside it", () => {
    for (const payload of [
      aPush,
      { ...aPush, count: 3, badge: 0, renotify: true, id: "n1" },
    ] as const) {
      const message = pushMessage(PushPayloadSchema.parse(payload), ORIGIN);
      expect(readPushPayload(message)).toEqual(
        PushPayloadSchema.parse(payload),
      );
    }
  });

  it("clears the app badge at 0", async () => {
    const sw = setUp();
    await sw.push({ ...aPush, badge: 0 });
    expect(sw.badges).toEqual(["cleared"]);
  });

  it("still says something for a payload it can't read", async () => {
    const sw = setUp();
    await sw.push(null);
    await sw.push("not json {");
    await sw.push({ ...aPush, url: "https://evil.example" });
    await sw.push({ ...aPush, v: 2 });
    expect(sw.shown).toHaveLength(4);
    for (const { title, options } of sw.shown) {
      expect(title).toBe("Terpsicle");
      expect(options.body).toBe("Open the app for details.");
      expect(options.data.url).toBe("/schedule");
    }
  });

  it("reads payloads exactly as PushPayloadSchema does", () => {
    const cases: unknown[] = [
      aPush,
      { ...aPush, title: "  Hi  " },
      {
        ...aPush,
        type: "chat-reply",
        url: "/chat/202701/CMSC131/section-0303?m=1",
      },
      { ...aPush, type: "chat-mention" },
      { ...aPush, type: "admin-urgent" },
      { ...aPush, type: "todo-due" },
      { ...aPush, type: "test" },
      { ...aPush, extra: true },
      { ...aPush, count: 3, badge: 0, renotify: true, id: "n1" },
      { ...aPush, count: 0 },
      { ...aPush, count: 1.5 },
      { ...aPush, count: "2" },
      { ...aPush, badge: -1 },
      { ...aPush, badge: 100_001 },
      { ...aPush, renotify: "yes" },
      { ...aPush, id: "" },
      { ...aPush, id: "x".repeat(201) },
      { ...aPush, id: 7 },
      { ...aPush, v: 2 },
      { ...aPush, v: "1" },
      { ...aPush, type: "chat-digest" },
      { ...aPush, title: "" },
      { ...aPush, title: "   " },
      { ...aPush, title: "x".repeat(121) },
      { ...aPush, body: "x".repeat(401) },
      { ...aPush, body: undefined },
      { ...aPush, url: "//evil.example" },
      { ...aPush, url: "https://evil.example/" },
      { ...aPush, url: `/${"x".repeat(2048)}` },
      { ...aPush, tag: "" },
      { ...aPush, tag: "x".repeat(65) },
      { ...aPush, tag: 3 },
      { ...aPush, tag: undefined },
      { ...aPush, title: 1 },
      "a string",
      null,
      [],
    ];
    for (const raw of cases) {
      const parsed = PushPayloadSchema.safeParse(raw);
      expect(readPushPayload(raw), JSON.stringify(raw)).toEqual(
        parsed.success ? parsed.data : null,
      );
    }
  });

  it("saves a subscription the browser replaced, with the same key", async () => {
    const sw = setUp();
    const sent: Request[] = [];
    sw.fetchWith(async (r) => {
      sent.push(r);
      return new Response("{}");
    });
    const key = new Uint8Array([4, 9, 9]).buffer;
    await sw.subscriptionChanged({
      oldSubscription: aSubscription("https://push.example/old", key),
      newSubscription: null,
    });
    expect(sw.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: key,
    });
    expect(sent).toHaveLength(1);
    const [request] = sent;
    expect(request?.url).toBe(`${ORIGIN}/api/push/subscribe`);
    expect(request?.method).toBe("POST");
    expect(request?.headers.get("Content-Type")).toBe("application/json");
    expect(await request?.json()).toEqual({
      endpoint: "https://push.example/new",
      keys: { p256dh: "p256", auth: "secret" },
      label: "iPhone · Safari",
    });
  });

  it("saves the browser's own new subscription as is", async () => {
    const sw = setUp();
    const sent: Request[] = [];
    sw.fetchWith(async (r) => {
      sent.push(r);
      return new Response("{}");
    });
    await sw.subscriptionChanged({
      oldSubscription: null,
      newSubscription: aSubscription("https://push.example/given"),
    });
    expect(sw.subscribe).not.toHaveBeenCalled();
    expect(sent).toHaveLength(1);
    const body = (await sent[0]?.json()) as { endpoint?: string } | undefined;
    expect(body?.endpoint).toBe("https://push.example/given");
  });

  it("leaves it to the app when there's no key to reuse", async () => {
    const sw = setUp();
    const sent: Request[] = [];
    sw.fetchWith(async (r) => {
      sent.push(r);
      return new Response("{}");
    });
    await sw.subscriptionChanged({
      oldSubscription: null,
      newSubscription: null,
    });
    await sw.subscriptionChanged({
      oldSubscription: aSubscription("https://push.example/old", null),
      newSubscription: null,
    });
    expect(sw.subscribe).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });
});

describe("service worker: notification clicks", () => {
  it("focuses a tab already on the notification's page", async () => {
    const sw = setUp();
    const there = aWindow(`${ORIGIN}/chat/cmsc131`);
    sw.setWindows([aWindow(`${ORIGIN}/schedule`), there]);
    const click = sw.click({ url: "/chat/cmsc131" });
    await click.done;
    expect(click.close).toHaveBeenCalled();
    expect(there.focus).toHaveBeenCalled();
    expect(sw.opened).toEqual([]);
  });

  it("brings an open Terpsicle window to the page", async () => {
    const sw = setUp();
    const open = aWindow(`${ORIGIN}/schedule`);
    sw.setWindows([open]);
    await sw.click({ url: "/chat/cmsc131" }).done;
    expect(open.focus).toHaveBeenCalled();
    expect(open.url).toBe(`${ORIGIN}/chat/cmsc131`);
    expect(sw.opened).toEqual([]);
  });

  it("opens a window when none can go there", async () => {
    const sw = setUp();
    await sw.click({ url: "/chat/cmsc131" }).done;
    sw.setWindows([aWindow(`${ORIGIN}/`, { controlled: false })]);
    await sw.click({ url: "/schedule" }).done;
    expect(sw.opened).toEqual([`${ORIGIN}/chat/cmsc131`, `${ORIGIN}/schedule`]);
  });

  it("reads its inbox item with the session, closes its tag, and passes on the unread count", async () => {
    const sw = setUp();
    const sent: Request[] = [];
    sw.fetchWith(async (r) => {
      sent.push(r);
      return Response.json({ unread: 2 });
    });
    const tag = "chat-mention:202701:CMSC351";
    await sw.push({
      ...aPush,
      type: "chat-mention",
      tag,
      url: "/chat/cmsc351",
      id: "n2",
    });
    const page = aWindow(`${ORIGIN}/schedule`);
    sw.setWindows([page]);
    const click = sw.click({ url: "/chat/cmsc351", tag, id: "n2" });
    await click.done;
    expect(click.close).toHaveBeenCalled();
    expect(sw.showing).toEqual([]);
    expect(sent).toHaveLength(1);
    const [request] = sent;
    expect(request?.url).toBe(`${ORIGIN}/api/notifications/read`);
    // Same origin, so the browser sends the session cookie and the Origin
    // (e2e/pwa-push.spec.ts checks that for real).
    expect(request?.method).toBe("POST");
    expect(await request?.json()).toEqual({ ids: ["n2"] });
    expect(sw.badges).toEqual([2]);
    expect(page.postMessage).toHaveBeenCalledWith({
      type: "notifications-read",
      unread: 2,
    });
    expect(page.url).toBe(`${ORIGIN}/chat/cmsc351`);
  });

  it("still opens the page when the read fails, and reads nothing without an id", async () => {
    const sw = setUp();
    const sent: Request[] = [];
    sw.fetchWith(async (r) => {
      sent.push(r);
      throw new TypeError("Failed to fetch");
    });
    await sw.click({ url: "/todo?day=2026-09-29", tag: "t", id: "n1" }).done;
    await sw.click({ url: "/schedule" }).done;
    expect(sent).toHaveLength(1);
    expect(sw.badges).toEqual([]);
    expect(sw.opened).toEqual([
      `${ORIGIN}/todo?day=2026-09-29`,
      `${ORIGIN}/schedule`,
    ]);
  });

  it("only ever opens Terpsicle", async () => {
    const sw = setUp();
    await sw.click({ url: "https://evil.example/" }).done;
    await sw.click(null).done;
    expect(sw.opened).toEqual([`${ORIGIN}/schedule`, `${ORIGIN}/schedule`]);
  });
});

describe("/sw.js", () => {
  it("ships as one self-contained script with this build's precache list", () => {
    const script = serviceWorkerScript(["/assets/index-abc.js"]);
    expect(script).toContain("(self, caches,");
    expect(script).toContain('"/assets/index-abc.js"');
    // Parses as a script.
    expect(() => new Function(script)).not.toThrow();
  });

  it("changes with every build, so browsers pick up the new version", () => {
    expect(serviceWorkerScript(["/assets/a.js"])).not.toBe(
      serviceWorkerScript(["/assets/b.js"]),
    );
    expect(precacheBuildId(["/assets/a.js"])).toBe(
      precacheBuildId(["/assets/a.js"]),
    );
    expect(precacheBuildId(["/assets/a.js"])).toMatch(/^[0-9a-z]+$/);
  });
});
