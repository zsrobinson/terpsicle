import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getRouter } from "./router";

// The generated tree pulls in every route's build-time modules; the wiring
// under test doesn't depend on which routes there are.
vi.mock("./routeTree.gen", async () => {
  const { createRootRoute } = await import("@tanstack/react-router");
  return { routeTree: createRootRoute() };
});
// Without Start's build, the CSP nonce's isomorphic function runs its
// server side, which reads the request: there's none here.
vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeader: () => undefined,
}));

// The app's query client comes from the router (src/router.tsx): in every
// route's context, and around every page. UI tests get a client from
// test-setup.ts whatever the router does, so this checks the real wiring.

describe("getRouter", () => {
  it("puts one query client in router context", () => {
    const router = getRouter();
    expect(router.options.context.queryClient).toBeInstanceOf(QueryClient);
    // A fresh one each time: per server render, never shared.
    expect(getRouter().options.context.queryClient).not.toBe(
      router.options.context.queryClient,
    );
  });

  it("wraps every page in that client's provider", () => {
    const router = getRouter();
    const { Wrap } = router.options;
    expect(Wrap).toBeDefined();
    if (!Wrap) return;
    function Probe() {
      const client = useQueryClient();
      return (
        <p>
          {client === router.options.context.queryClient ? "router's" : "other"}
        </p>
      );
    }
    render(
      <Wrap>
        <Probe />
      </Wrap>,
    );
    // The nearest provider wins, so test-setup's outer one can't hide this.
    expect(screen.getByText("router's")).toBeInTheDocument();
  });
});
