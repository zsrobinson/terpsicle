import { describe, expect, it, vi } from "vitest";
import { PushPayloadSchema } from "~/core/schema";
import {
  installServiceWorker,
  precacheBuildId,
  readPushPayload,
  type ServiceWorkerConfig,
  type SwCache,
  type SwCaches,
  type SwNotificationOptions,
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
  const client: SwWindowClient = {
    url,
    focus: vi.fn(async (): Promise<unknown> => client),
    navigate: vi.fn(async (to: string): Promise<unknown> => {
      if (!controlled) throw new TypeError("Not controlled");
      client.url = to;
      return client;
    }),
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
  const opened: string[] = [];
  let windows: SwWindowClient[] = [];
  const skipWaiting = vi.fn(async () => {});
  const scope: SwScope = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: Listener) =>
      listeners.set(type, listener),
    skipWaiting,
    registration: {
      showNotification: async (title, options) => {
        shown.push({ title, options });
      },
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
    skipWaitingMessage: "skip-waiting",
    ...over,
  };
  installServiceWorker(
    scope,
    caches,
    (r) => network(r),
    readPushPayload,
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
    shown,
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

const html = (body: string) =>
  new Response(body, { headers: { "Content-Type": "text/html" } });
const offline = async (): Promise<Response> => {
  throw new TypeError("Failed to fetch");
};

describe("service worker: pages and files", () => {
  it("always loads pages from the network while online, so a new deploy shows at once", async () => {
    const sw = setUp();
    sw.fetchWith(async () => html("deploy 1"));
    expect(await (await sw.request("/", { navigate: true }))?.text()).toBe(
      "deploy 1",
    );
    sw.fetchWith(async () => html("deploy 2"));
    expect(
      await (await sw.request("/?plan=abc", { navigate: true }))?.text(),
    ).toBe("deploy 2");
  });

  it("serves the last copy of the page when offline", async () => {
    const sw = setUp();
    sw.fetchWith(async () => html("the app"));
    await sw.request("/schedule", { navigate: true });
    sw.fetchWith(offline);
    expect(
      await (
        await sw.request("/schedule?plan=abc", { navigate: true })
      )?.text(),
    ).toBe("the app");
    // A page never loaded online falls back to the app's copy.
    expect(
      await (await sw.request("/alerts/confirm", { navigate: true }))?.text(),
    ).toBe("the app");
  });

  it("falls back to the home page's copy when the app page was never loaded", async () => {
    const sw = setUp();
    sw.fetchWith(async () => html("home"));
    await sw.request("/", { navigate: true });
    sw.fetchWith(offline);
    expect(await (await sw.request("/chat", { navigate: true }))?.text()).toBe(
      "home",
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

  it("never caches the API or data, other sites, or anything but GET", async () => {
    const sw = setUp();
    expect(await sw.request("/api/alerts/status")).toBeUndefined();
    expect(
      await sw.request("/api/alerts/status", { navigate: true }),
    ).toBeUndefined();
    expect(await sw.request("/data/catalog/terms.json")).toBeUndefined();
    expect(await sw.request("/", { method: "POST" })).toBeUndefined();
  });

  it("drops the previous version's caches when it takes over", async () => {
    const sw = setUp();
    await sw.caches.open("terpsicle-pages-v0");
    await sw.caches.open("terpsicle-shell-v1-old");
    await sw.caches.open("terpsicle-assets-v1");
    await sw.caches.open("someone-else");
    await sw.activate();
    expect(await sw.caches.keys()).toEqual([
      "terpsicle-assets-v1",
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

describe("service worker: push", () => {
  it("shows the payload's title and body, and remembers where to go", async () => {
    const sw = setUp();
    await sw.push({
      title: "CMSC131 0101 has a seat",
      body: "Register on Testudo before it's gone.",
      url: "/schedule?course=CMSC131",
      tag: "seat-CMSC131-0101",
    });
    expect(sw.shown).toEqual([
      {
        title: "CMSC131 0101 has a seat",
        options: {
          body: "Register on Testudo before it's gone.",
          icon: "/icons/icon-192.png",
          tag: "seat-CMSC131-0101",
          data: { url: "/schedule?course=CMSC131" },
        },
      },
    ]);
  });

  it("still says something for a payload it can't read", async () => {
    const sw = setUp();
    await sw.push(null);
    await sw.push("not json {");
    await sw.push({ title: "Phish", body: "", url: "https://evil.example" });
    expect(sw.shown).toHaveLength(3);
    for (const { title, options } of sw.shown) {
      expect(title).toBe("Terpsicle");
      expect(options.data.url).toBe("/schedule");
    }
  });

  it("reads payloads exactly as PushPayloadSchema does", () => {
    const cases: unknown[] = [
      { title: "Hi", body: "", url: "/" },
      { title: "  Hi  ", body: "b", url: "/chat/x?m=1", tag: "t" },
      { title: "Hi", body: "b", url: "/x", extra: true },
      { title: "", body: "", url: "/" },
      { title: "   ", body: "", url: "/" },
      { title: "x".repeat(121), body: "", url: "/" },
      { title: "Hi", body: "x".repeat(401), url: "/" },
      { title: "Hi", body: "", url: "//evil.example" },
      { title: "Hi", body: "", url: "https://evil.example/" },
      { title: "Hi", body: "", url: `/${"x".repeat(2048)}` },
      { title: "Hi", body: "", url: "/", tag: "" },
      { title: "Hi", body: "", url: "/", tag: "x".repeat(65) },
      { title: "Hi", body: "", url: "/", tag: 3 },
      { title: "Hi", url: "/" },
      { title: 1, body: "", url: "/" },
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
