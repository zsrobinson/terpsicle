import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registerServiceWorker,
  SERVICE_WORKER_FLAG_KEY,
  shouldRegisterServiceWorker,
  UPDATE_CHECK_MS,
  watchForUpdates,
} from "./service-worker-registration";

const fakeNavigator = () => {
  const register = vi.fn(async () => ({}) as ServiceWorkerRegistration);
  return {
    register,
    nav: { serviceWorker: { register } } as unknown as Navigator,
  };
};

afterEach(() => {
  window.localStorage.clear();
});

describe("registerServiceWorker", () => {
  it("registers /sw.js for the whole site in production builds", () => {
    const { nav, register } = fakeNavigator();
    registerServiceWorker({ mode: "production" }, () => {}, nav);
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });

  it("stays out of dev and mock mode, where files change under it", () => {
    for (const mode of ["development", "mock", "test"]) {
      const { nav, register } = fakeNavigator();
      registerServiceWorker({ mode }, () => {}, nav);
      expect(register).not.toHaveBeenCalled();
    }
  });

  it("registers in dev and mock mode when the flag is on", () => {
    window.localStorage.setItem(SERVICE_WORKER_FLAG_KEY, "on");
    const { nav, register } = fakeNavigator();
    registerServiceWorker({ mode: "mock" }, () => {}, nav);
    expect(register).toHaveBeenCalled();
    expect(shouldRegisterServiceWorker("mock", "off")).toBe(false);
  });

  it("does nothing in browsers without service workers", () => {
    expect(() =>
      registerServiceWorker({ mode: "production" }, () => {}, {} as Navigator),
    ).not.toThrow();
  });
});

/** A registration and container with just enough to drive `watchForUpdates`. */
function fakeRegistration({ controlled = true } = {}) {
  const registration = new EventTarget() as EventTarget & {
    waiting: ServiceWorker | null;
    installing: ServiceWorker | null;
    update: () => Promise<void>;
  };
  registration.waiting = null;
  registration.installing = null;
  registration.update = vi.fn(async () => {});
  const container = new EventTarget() as EventTarget & {
    controller: ServiceWorker | null;
  };
  container.controller = controlled ? ({} as ServiceWorker) : null;
  const worker = () => {
    const w = new EventTarget() as EventTarget & {
      state: string;
      postMessage: ReturnType<typeof vi.fn>;
    };
    w.state = "installing";
    w.postMessage = vi.fn();
    return w;
  };
  return {
    registration,
    container,
    worker,
    watch: (onReady: (apply: () => void) => void, now = () => 0) =>
      watchForUpdates(
        registration as unknown as ServiceWorkerRegistration,
        container as unknown as ServiceWorkerContainer,
        onReady,
        { now },
      ),
  };
}

describe("watchForUpdates", () => {
  it("offers a version that's already waiting", () => {
    const sw = fakeRegistration();
    const waiting = sw.worker();
    sw.registration.waiting = waiting as unknown as ServiceWorker;
    const onReady = vi.fn();
    sw.watch(onReady);
    expect(onReady).toHaveBeenCalledOnce();
  });

  it("offers a new version once it has installed", () => {
    const sw = fakeRegistration();
    const onReady = vi.fn();
    sw.watch(onReady);
    const next = sw.worker();
    sw.registration.installing = next as unknown as ServiceWorker;
    sw.registration.dispatchEvent(new Event("updatefound"));
    expect(onReady).not.toHaveBeenCalled();
    next.state = "installed";
    next.dispatchEvent(new Event("statechange"));
    expect(onReady).toHaveBeenCalledOnce();
  });

  it("doesn't call a first install an update", () => {
    const sw = fakeRegistration({ controlled: false });
    sw.registration.waiting = sw.worker() as unknown as ServiceWorker;
    const onReady = vi.fn();
    sw.watch(onReady);
    expect(onReady).not.toHaveBeenCalled();
  });

  it("asks the waiting version to take over, then reloads once", () => {
    const sw = fakeRegistration();
    const waiting = sw.worker();
    sw.registration.waiting = waiting as unknown as ServiceWorker;
    let apply = () => {};
    sw.watch((fn) => {
      apply = fn;
    });
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    try {
      apply();
      expect(waiting.postMessage).toHaveBeenCalledWith({
        type: "skip-waiting",
      });
      sw.container.dispatchEvent(new Event("controllerchange"));
      sw.container.dispatchEvent(new Event("controllerchange"));
      expect(reload).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("checks for a new version when a long-open tab comes back", () => {
    const sw = fakeRegistration();
    let time = 0;
    sw.watch(
      () => {},
      () => time,
    );
    const visible = () => document.dispatchEvent(new Event("visibilitychange"));
    visible();
    expect(sw.registration.update).not.toHaveBeenCalled();
    time = UPDATE_CHECK_MS;
    visible();
    expect(sw.registration.update).toHaveBeenCalledOnce();
    visible();
    expect(sw.registration.update).toHaveBeenCalledOnce();
  });
});
