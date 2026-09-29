import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  NotFoundUnavailable,
  RouteErrorUnavailable,
} from "./lazy-route-states";

const reload = vi.hoisted(() => vi.fn());
vi.mock("~/ui/reload", async (original) => ({
  ...(await original<typeof import("~/ui/reload")>()),
  reloadPage: reload,
}));

// The stand-ins for when the failure state's or the 404 page's own code
// doesn't arrive (~/lib/lazy-component covers when they show, and that they
// never throw): plain words, and a way out, with nothing more to load.
describe("the route states' stand-ins", () => {
  it("says the page didn't load, with Reload", () => {
    render(<RouteErrorUnavailable />);
    expect(
      screen.getByRole("heading", { name: "This page didn't load" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Check your connection, then reload.",
    );
    const button = screen.getByRole("button", { name: "Reload" });
    expect(button).toHaveAttribute("data-tooltip");
    fireEvent.click(button);
    expect(reload).toHaveBeenCalled();
  });

  it("still says there's nothing at the address", () => {
    render(<NotFoundUnavailable />);
    expect(
      screen.getByRole("heading", { name: "Page not found" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("There's nothing at this address."),
    ).toBeInTheDocument();
  });
});
