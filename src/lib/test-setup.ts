// UI test project setup (vitest.config.ts): DOM matchers, a clean DOM
// between tests, and a query client around everything rendered.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
});

// In the app, every page renders inside the router's QueryClientProvider
// (src/router.tsx), so the bar's bell and any other query reads have a
// client wherever they are. Tests build their own routers without it, so
// each render and renderHook gets a fresh test client around it here. A
// test that wants its own client wraps its tree in QueryClientProvider:
// the nearest provider wins.
vi.mock("@testing-library/react", async (importOriginal) => {
  const rtl = await importOriginal<typeof import("@testing-library/react")>();
  const { createElement } = await import("react");
  const { QueryClientProvider } = await import("@tanstack/react-query");
  const { createTestQueryClient } = await import("~/state/query/testing");
  type Wrapper = import("react").JSXElementConstructor<{
    children: import("react").ReactNode;
  }>;
  const withClient = (inner: Wrapper | undefined): Wrapper => {
    const client = createTestQueryClient();
    return ({ children }) =>
      createElement(
        QueryClientProvider,
        { client },
        inner ? createElement(inner, null, children) : children,
      );
  };
  const render = ((
    ui: import("react").ReactNode,
    options?: import("@testing-library/react").RenderOptions,
  ) =>
    rtl.render(ui, {
      ...options,
      wrapper: withClient(options?.wrapper),
    })) as typeof rtl.render;
  const renderHook = ((callback, options) =>
    rtl.renderHook(callback, {
      ...options,
      wrapper: withClient(options?.wrapper),
    })) as typeof rtl.renderHook;
  return { ...rtl, render, renderHook };
});
