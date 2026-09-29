import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "~/ui/tooltip";

// Each test starts before the tooltips' code has come (it's kept per page).
let LazyTooltip: typeof import("./lazy-tooltip").LazyTooltip;
beforeEach(async () => {
  vi.resetModules();
  ({ LazyTooltip } = await import("./lazy-tooltip"));
});

function Links() {
  return (
    <TooltipProvider delayDuration={0}>
      <LazyTooltip label="What Terpsicle keeps about you">
        <a href="/privacy">Privacy</a>
      </LazyTooltip>
      <LazyTooltip label="No account needed">
        <a href="/schedule">View schedule</a>
      </LazyTooltip>
    </TooltipProvider>
  );
}

/** The kit's tooltip marks its trigger this way; the stand-in doesn't. */
const kitTriggers = () =>
  document.querySelectorAll("[data-slot=tooltip-trigger]");

describe("LazyTooltip", () => {
  it("marks each control as having a tooltip before its code comes", () => {
    render(<Links />);
    for (const name of ["Privacy", "View schedule"])
      expect(screen.getByRole("link", { name })).toHaveAttribute(
        "data-tooltip",
      );
    expect(kitTriggers()).toHaveLength(0);
  });

  it("brings the kit's tooltip on the first move of a mouse", async () => {
    render(<Links />);
    const user = userEvent.setup();
    await user.hover(document.body);
    await waitFor(() => expect(kitTriggers()).toHaveLength(2));
    await user.hover(screen.getByRole("link", { name: "Privacy" }));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "What Terpsicle keeps about you",
    );
  });

  it("never loads for a finger", async () => {
    render(<Links />);
    fireEvent.pointerMove(document.body, { pointerType: "touch" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(kitTriggers()).toHaveLength(0);
  });

  it("keeps focus on the control that had it, and shows its tooltip", async () => {
    render(<Links />);
    await userEvent.setup().tab();
    await waitFor(() => expect(kitTriggers()).toHaveLength(2));
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "What Terpsicle keeps about you",
    );
  });

  it("waits while a key is held, so a press ends on the control it began on", async () => {
    render(<Links />);
    const link = screen.getByRole("link", { name: "View schedule" });
    act(() => link.focus());
    fireEvent.keyDown(link, { key: "Enter", code: "Enter" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(link).toBeInTheDocument();
    expect(kitTriggers()).toHaveLength(0);
    fireEvent.keyUp(link, { key: "Enter", code: "Enter" });
    await waitFor(() => expect(kitTriggers()).toHaveLength(2));
    expect(screen.getByRole("link", { name: "View schedule" })).toHaveFocus();
  });
});
