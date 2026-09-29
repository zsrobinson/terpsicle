import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  NotFoundUnavailable,
  RouteErrorUnavailable,
} from "./lazy-route-states";

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
    const reload = screen.getByRole("link", { name: "Reload" });
    expect(reload).toHaveAttribute("href", window.location.href);
    expect(reload).toHaveAttribute("data-tooltip");
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
