import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";

// Button on Base UI's useRender: the same classes and element as before,
// with `render` for another element and `asChild` kept for one wave.

describe("Button", () => {
  it("is a button with its variant's classes, and forwards its ref", async () => {
    const onClick = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button ref={ref} variant="outline" size="sm" onClick={onClick}>
        Add 0101
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Add 0101" });
    expect(ref.current).toBe(button);
    expect(button).toHaveAttribute("data-slot", "button");
    expect(button).toHaveClass("border-fg", "shadow-offset", "h-7");
    // No type is added: in a form it submits, as a plain <button> does.
    expect(button).not.toHaveAttribute("type");
    await userEvent.setup().click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("draws its only child as the button with asChild, keeping both classes", () => {
    render(
      <Button asChild size="lg" className="w-fit">
        <a href="/reviews" className="ident">
          Search reviews
        </a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Search reviews" });
    expect(link).toHaveAttribute("href", "/reviews");
    expect(link).toHaveClass("ident", "w-fit", "h-9", "bg-accent");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("draws another element with render, around its own children", () => {
    render(
      <Button variant="ghost" render={<a href="/plan" />}>
        Open Plan
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Open Plan" });
    expect(link).toHaveAttribute("href", "/plan");
    expect(link).toHaveClass("text-muted");
  });

  it("runs both the button's and the child's click handlers", async () => {
    const outer = vi.fn();
    const inner = vi.fn((event: React.MouseEvent) => event.preventDefault());
    render(
      <Button asChild onClick={outer}>
        <a href="/plan" onClick={inner}>
          Open Plan
        </a>
      </Button>,
    );
    await userEvent
      .setup()
      .click(screen.getByRole("link", { name: "Open Plan" }));
    expect(outer).toHaveBeenCalledOnce();
    expect(inner).toHaveBeenCalledOnce();
  });
});
