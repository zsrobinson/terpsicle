import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { TooltipProvider, WithTooltip } from "./tooltip";

function PlanMenu({
  onRename = () => undefined,
  onKeep = () => undefined,
}: {
  onRename?: () => void;
  onKeep?: () => void;
}) {
  const [plan, setPlan] = useState("a");
  return (
    <TooltipProvider delayDuration={0}>
      <DropdownMenu>
        <WithTooltip label="Plan options">
          <DropdownMenuTrigger asChild>
            <Button variant="outline">Plan A</Button>
          </DropdownMenuTrigger>
        </WithTooltip>
        <DropdownMenuContent>
          <DropdownMenuLabel>Spring 2027</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={plan} onValueChange={setPlan}>
            <DropdownMenuRadioItem value="a">Plan A</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="b">Plan B</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuItem onSelect={onRename}>Rename</DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              onKeep();
            }}
          >
            Sign in again
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href="/settings">Settings</a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
}

const trigger = () => screen.getByRole("button", { name: "Plan A" });

describe("DropdownMenu", () => {
  it("opens from its trigger, whose tooltip it leaves alone, and marks it open", async () => {
    render(<PlanMenu />);
    const user = userEvent.setup();
    expect(trigger()).toHaveAttribute("data-state", "closed");
    // Hovering first opens the trigger's tooltip; the press still opens
    // the menu on the same button.
    await user.hover(trigger());
    await screen.findByRole("tooltip");
    await user.click(trigger());
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(trigger()).toHaveAttribute("data-state", "open");
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
  });

  it("runs onSelect and closes, handing focus back to the trigger", async () => {
    const onRename = vi.fn();
    render(<PlanMenu onRename={onRename} />);
    const user = userEvent.setup();
    await user.click(trigger());
    await user.click(await screen.findByRole("menuitem", { name: "Rename" }));
    expect(onRename).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(trigger()).toHaveFocus();
    expect(trigger()).toHaveAttribute("data-state", "closed");
  });

  it("stays open when onSelect prevents it, as on Radix", async () => {
    const onKeep = vi.fn();
    render(<PlanMenu onKeep={onKeep} />);
    const user = userEvent.setup();
    await user.click(trigger());
    await user.click(
      await screen.findByRole("menuitem", { name: "Sign in again" }),
    );
    expect(onKeep).toHaveBeenCalledOnce();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("picks one of a radio group and closes, from the keyboard", async () => {
    render(<PlanMenu />);
    const user = userEvent.setup();
    trigger().focus();
    await user.keyboard("{Enter}");
    const planB = await screen.findByRole("menuitemradio", { name: "Plan B" });
    expect(
      screen.getByRole("menuitemradio", { name: "Plan A" }),
    ).toHaveAttribute("aria-checked", "true");
    // Typeahead: "p" moves through the items that start with it.
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(planB).toHaveFocus());
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await user.keyboard("{Enter}");
    expect(
      await screen.findByRole("menuitemradio", { name: "Plan B" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("ticks on an iPhone's tap: one overlay per item, none on a destructive one", async () => {
    const values = {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1",
      maxTouchPoints: 5,
      vibrate: undefined,
    };
    for (const [key, value] of Object.entries(values))
      Object.defineProperty(navigator, key, { value, configurable: true });
    try {
      const onRename = vi.fn();
      render(
        <DropdownMenu defaultOpen>
          <DropdownMenuTrigger>Plan A</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={onRename}>Rename</DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="/settings">Settings</a>
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>,
      );
      const tap = (name: string) =>
        screen
          .getByRole("menuitem", { name })
          .querySelectorAll(":scope > input[data-haptic-tap]");
      await screen.findByRole("menu");
      expect(tap("Rename")).toHaveLength(1);
      expect(tap("Settings")).toHaveLength(1);
      expect(tap("Delete")).toHaveLength(0);
      // The finger lands on the overlay; the item gets the click.
      const [overlay] = tap("Rename");
      await userEvent.setup().click(overlay as HTMLElement);
      expect(onRename).toHaveBeenCalledOnce();
    } finally {
      for (const key of Object.keys(values))
        Reflect.deleteProperty(navigator, key);
    }
  });

  it("renders an asChild item as its link", async () => {
    render(<PlanMenu />);
    const user = userEvent.setup();
    await user.click(trigger());
    const settings = await screen.findByRole("menuitem", { name: "Settings" });
    expect(settings.tagName).toBe("A");
    expect(settings).toHaveAttribute("href", "/settings");
  });
});
