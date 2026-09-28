import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Component, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "~/ui/tooltip";
import { ChunkLoadError, PanelLoadBoundary } from "./panel-load-boundary";

class Outer extends Component<{ children: ReactNode }, { caught: string }> {
  override state = { caught: "" };
  static getDerivedStateFromError(error: Error) {
    return { caught: error.message };
  }
  override render() {
    return this.state.caught ? (
      <p>Outer caught: {this.state.caught}</p>
    ) : (
      this.props.children
    );
  }
}

function Throws({ error }: { error: Error }): ReactNode {
  throw error;
}

function renderBoundary(error: Error) {
  render(
    <TooltipProvider>
      <Outer>
        <PanelLoadBoundary title="Travel">
          <Throws error={error} />
        </PanelLoadBoundary>
      </Outer>
    </TooltipProvider>,
  );
}

describe("PanelLoadBoundary", () => {
  afterEach(() => vi.restoreAllMocks());

  it("words a chunk that didn't arrive, in the panel", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderBoundary(new ChunkLoadError(new TypeError("Failed to fetch")));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Couldn't load Travel. Check your connection, then reload.",
    );
    expect(screen.queryByText(/Outer caught/)).toBeNull();
  });

  it("words a route's chunk that didn't arrive the same way", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderBoundary(
      new TypeError(
        "Failed to fetch dynamically imported module: /assets/schedule.travel-x.js",
      ),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Couldn't load Travel.",
    );
  });

  it("leaves a bug to the boundary above, not calling it a network problem", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderBoundary(new Error("a bug"));
    expect(screen.getByText("Outer caught: a bug")).toBeVisible();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("reloads from its Reload button, since a failed import stays failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi
      .spyOn(window.location, "reload")
      .mockImplementation(() => {});
    renderBoundary(new ChunkLoadError(new TypeError("Failed to fetch")));
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalledOnce();
  });
});
