import { render, screen } from "@testing-library/react";
import { Component, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "~/ui/tooltip";
import { ChunkLoadError } from "./lazy-panel";
import { PanelLoadBoundary } from "./panel-load-boundary";

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
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't load Travel. Check your connection, then reload.",
    );
    expect(screen.queryByText(/Outer caught/)).toBeNull();
  });

  it("leaves a bug to the boundary above, not calling it a network problem", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderBoundary(new Error("a bug"));
    expect(screen.getByText("Outer caught: a bug")).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
