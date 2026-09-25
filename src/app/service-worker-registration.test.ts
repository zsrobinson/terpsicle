import { describe, expect, it, vi } from "vitest";
import { registerServiceWorker } from "./service-worker-registration";

const fakeNavigator = () => {
  const register = vi.fn(async () => ({}) as ServiceWorkerRegistration);
  return {
    register,
    nav: { serviceWorker: { register } } as unknown as Navigator,
  };
};

describe("registerServiceWorker", () => {
  it("registers /sw.js for the whole site in production builds", () => {
    const { nav, register } = fakeNavigator();
    registerServiceWorker({ mode: "production" }, nav);
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });

  it("stays out of dev and mock mode, where files change under it", () => {
    for (const mode of ["development", "mock", "test"]) {
      const { nav, register } = fakeNavigator();
      registerServiceWorker({ mode }, nav);
      expect(register).not.toHaveBeenCalled();
    }
  });

  it("does nothing in browsers without service workers", () => {
    expect(() =>
      registerServiceWorker({ mode: "production" }, {} as Navigator),
    ).not.toThrow();
  });
});
