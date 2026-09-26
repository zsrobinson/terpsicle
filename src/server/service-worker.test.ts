import { describe, expect, it } from "vitest";
import {
  installServiceWorker,
  SERVICE_WORKER_JS,
  type SwCache,
  type SwCaches,
  type SwScope,
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

/** Installs the service worker on a fake scope; `fetchWith` swaps the network. */
function setUp(maxAssets = 400) {
  const listeners = new Map<string, Listener>();
  const caches = fakeCaches();
  let network: (request: Request) => Promise<Response> = async () =>
    new Response("");
  const scope: SwScope = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: Listener) =>
      listeners.set(type, listener),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  } as SwScope;
  installServiceWorker(scope, caches, (r) => network(r), 1, maxAssets);

  /** What the page gets for a request, or undefined when the SW stays out of it. */
  const request = async (
    path: string,
    { navigate = false, method = "GET" } = {},
  ): Promise<Response | undefined> => {
    const req = new Request(`${ORIGIN}${path}`, { method });
    if (navigate) Object.defineProperty(req, "mode", { value: "navigate" });
    let answer: Promise<Response> | undefined;
    const listener = listeners.get("fetch");
    listener?.({
      request: req,
      respondWith: (r: Promise<Response>) => {
        answer = r;
      },
      waitUntil: () => {},
    } as never);
    return answer;
  };
  const activate = async () => {
    let done: Promise<unknown> = Promise.resolve();
    listeners.get("activate")?.({
      waitUntil: (p: Promise<unknown>) => {
        done = p;
      },
    } as never);
    await done;
  };
  return {
    caches,
    request,
    activate,
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

describe("service worker", () => {
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
    sw.fetchWith(async () => html("the app"));
    await sw.request("/schedule", { navigate: true });
    sw.fetchWith(offline);
    expect(
      await (
        await sw.request("/schedule?plan=abc", { navigate: true })
      )?.text(),
    ).toBe("the app");
    // A page never loaded online falls back to the scheduler's copy.
    expect(
      await (await sw.request("/alerts/confirm", { navigate: true }))?.text(),
    ).toBe("the app");
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
    const sw = setUp(2);
    sw.fetchWith(async (r) => new Response(r.url));
    for (const name of ["a", "b", "c"]) await sw.request(`/assets/${name}.js`);
    const kept = [
      ...(sw.caches.stores.get("terpsicle-assets-v1")?.keys() ?? []),
    ];
    expect(kept).toEqual([`${ORIGIN}/assets/b.js`, `${ORIGIN}/assets/c.js`]);
  });

  it("stays out of data, API calls, other sites and anything but GET", async () => {
    const sw = setUp();
    expect(await sw.request("/data/catalog/terms.json")).toBeUndefined();
    expect(await sw.request("/api/alerts/subscribe")).toBeUndefined();
    expect(await sw.request("/", { method: "POST" })).toBeUndefined();
  });

  it("drops the previous version's caches when it takes over", async () => {
    const sw = setUp();
    await sw.caches.open("terpsicle-pages-v0");
    await sw.caches.open("someone-else");
    await sw.activate();
    expect(await sw.caches.keys()).toEqual(["someone-else"]);
  });

  it("ships as one self-contained script", () => {
    expect(SERVICE_WORKER_JS).toMatch(/^\(function installServiceWorker|^\(/);
    expect(SERVICE_WORKER_JS).toContain("(self, caches,");
    // Parses as a script.
    expect(() => new Function(SERVICE_WORKER_JS)).not.toThrow();
  });
});
