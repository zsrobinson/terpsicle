import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Plus } from "lucide-react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ActionMenu,
  ActionMenuCheckboxItem,
  ActionMenuGroup,
  ActionMenuItem,
  ActionMenuLinkItem,
  ActionMenuRadioGroup,
  ActionMenuRadioItem,
  ActionMenuSeparator,
} from "./action-menu";
import { TooltipProvider } from "./tooltip";

/** A phone (below md) when `phone`, a desktop otherwise. */
function screenIs(phone: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      ({
        matches: phone && query.includes("max-width"),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

function Plans({
  onNew = () => undefined,
  onDelete = () => undefined,
}: {
  onNew?: () => void;
  onDelete?: () => void;
}) {
  const [plan, setPlan] = useState("a");
  const [weekends, setWeekends] = useState(false);
  return (
    <TooltipProvider delayDuration={0}>
      <p data-testid="plan">{plan}</p>
      <ActionMenu
        title="Plans"
        description="Spring 2027"
        tooltip="Switch plans"
        trigger={<button type="button">Plan A</button>}
      >
        <ActionMenuRadioGroup value={plan} onValueChange={setPlan}>
          <ActionMenuRadioItem value="a" hint="5 courses · 16 credits">
            Plan A
          </ActionMenuRadioItem>
          <ActionMenuRadioItem value="b" hint="3 courses · 9 credits">
            Plan B
          </ActionMenuRadioItem>
        </ActionMenuRadioGroup>
        <ActionMenuSeparator />
        <ActionMenuGroup label="This plan">
          <ActionMenuItem icon={<Plus />} shortcut="N" onSelect={onNew}>
            New plan
          </ActionMenuItem>
          <ActionMenuCheckboxItem
            checked={weekends}
            onCheckedChange={setWeekends}
          >
            Show weekends
          </ActionMenuCheckboxItem>
          <ActionMenuLinkItem href="#generate">
            Generate plans…
          </ActionMenuLinkItem>
          <ActionMenuItem variant="destructive" onSelect={onDelete}>
            Delete Plan A
          </ActionMenuItem>
        </ActionMenuGroup>
      </ActionMenu>
    </TooltipProvider>
  );
}

describe("ActionMenu on a desktop", () => {
  it("is a menu under its trigger, named by its title", async () => {
    screenIs(false);
    const user = userEvent.setup();
    render(<Plans />);
    const trigger = screen.getByRole("button", { name: "Plan A" });
    // Every control has a tooltip: the kit's WithTooltip marks it.
    expect(trigger).toHaveAttribute("data-tooltip");
    await user.click(trigger);
    const menu = await screen.findByRole("menu", { name: "Plans" });
    expect(menu).toHaveAttribute("data-slot", "action-menu");
    expect(screen.queryByRole("dialog")).toBeNull();
    // The title names it; only the sheet shows it.
    expect(screen.queryByText("Spring 2027")).toBeNull();
    expect(
      screen.getByRole("menuitemradio", { name: /Plan A/ }),
    ).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("group", { name: "This plan" })).toBeVisible();
    // Shortcuts show on a desktop.
    expect(
      screen.getByRole("menuitem", { name: /New plan/ }),
    ).toHaveTextContent("N");
  });

  it("runs an item and closes", async () => {
    screenIs(false);
    const user = userEvent.setup();
    const onNew = vi.fn();
    render(<Plans onNew={onNew} />);
    await user.click(screen.getByRole("button", { name: "Plan A" }));
    await user.click(await screen.findByRole("menuitem", { name: /New plan/ }));
    expect(onNew).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("picks one of a set, and closes", async () => {
    screenIs(false);
    const user = userEvent.setup();
    render(<Plans />);
    await user.click(screen.getByRole("button", { name: "Plan A" }));
    await user.click(
      await screen.findByRole("menuitemradio", { name: /Plan B/ }),
    );
    expect(screen.getByTestId("plan")).toHaveTextContent("b");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("works from the keyboard, and gives focus back to the trigger", async () => {
    screenIs(false);
    const user = userEvent.setup();
    const onNew = vi.fn();
    render(<Plans onNew={onNew} />);
    await user.tab();
    await user.keyboard("{Enter}");
    await screen.findByRole("menu");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(screen.getByRole("button", { name: "Plan A" })).toHaveFocus();
  });
});

describe("ActionMenu on a phone", () => {
  it("is a sheet headed by the title, holding the same items", async () => {
    screenIs(true);
    const user = userEvent.setup();
    render(<Plans />);
    const trigger = screen.getByRole("button", { name: "Plan A" });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveAttribute("data-tooltip");
    await user.click(trigger);
    const sheet = await screen.findByRole("dialog", { name: "Plans" });
    expect(sheet).toHaveAttribute("data-slot", "action-sheet");
    expect(sheet).toHaveTextContent("Spring 2027");
    expect(screen.getByRole("menu", { name: "Plans" })).toBeVisible();
    const current = screen.getByRole("menuitemradio", { name: /Plan A/ });
    expect(current).toHaveAttribute("aria-checked", "true");
    // Focus starts on what's chosen.
    await waitFor(() => expect(current).toHaveFocus());
    // No keyboard on a phone, so no shortcuts.
    expect(
      screen.getByRole("menuitem", { name: /New plan/ }),
    ).not.toHaveTextContent(/N$/);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("runs an item and closes, handing focus back to the trigger", async () => {
    screenIs(true);
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<Plans onDelete={onDelete} />);
    await user.click(screen.getByRole("button", { name: "Plan A" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "Delete Plan A" }),
    );
    expect(onDelete).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: "Plan A" })).toHaveFocus();
  });

  it("picks one of a set, and closes", async () => {
    screenIs(true);
    const user = userEvent.setup();
    render(<Plans />);
    await user.click(screen.getByRole("button", { name: "Plan A" }));
    await user.click(
      await screen.findByRole("menuitemradio", { name: /Plan B/ }),
    );
    expect(screen.getByTestId("plan")).toHaveTextContent("b");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("stays open for a setting that turns on and off", async () => {
    screenIs(true);
    const user = userEvent.setup();
    render(<Plans />);
    await user.click(screen.getByRole("button", { name: "Plan A" }));
    const weekends = await screen.findByRole("menuitemcheckbox", {
      name: "Show weekends",
    });
    expect(weekends).toHaveAttribute("aria-checked", "false");
    await user.click(weekends);
    expect(weekends).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("moves between items with the arrow keys, as a menu does", async () => {
    screenIs(true);
    const user = userEvent.setup();
    render(<Plans />);
    await user.click(screen.getByRole("button", { name: "Plan A" }));
    const first = await screen.findByRole("menuitemradio", { name: /Plan A/ });
    await waitFor(() => expect(first).toHaveFocus());
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitemradio", { name: /Plan B/ })).toHaveFocus();
    await user.keyboard("{End}");
    expect(
      screen.getByRole("menuitem", { name: "Delete Plan A" }),
    ).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(first).toHaveFocus();
  });
});

describe("ActionMenu on an iPhone", () => {
  // Pretend to be one, as haptic.test.tsx does, and put navigator back after.
  const shadowed: string[] = [];
  afterEach(() => {
    for (const key of shadowed.splice(0))
      Reflect.deleteProperty(navigator, key);
  });
  function pretendIPhone() {
    const values = {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1",
      maxTouchPoints: 5,
      vibrate: undefined,
    };
    for (const [key, value] of Object.entries(values)) {
      Object.defineProperty(navigator, key, { value, configurable: true });
      shadowed.push(key);
    }
  }
  const overlay = (item: HTMLElement) =>
    item.querySelector("input[data-haptic-tap]");

  it("ticks on a choice, once per item, and never on a destructive one", async () => {
    screenIs(true);
    pretendIPhone();
    const user = userEvent.setup();
    const onNew = vi.fn();
    render(<Plans onNew={onNew} />);
    await user.click(screen.getByRole("button", { name: "Plan A" }));
    await screen.findByRole("menuitemradio", { name: /Plan B/ });
    for (const item of screen.getAllByRole("menuitemradio"))
      expect(item.querySelectorAll("input[data-haptic-tap]")).toHaveLength(1);
    expect(
      overlay(screen.getByRole("menuitemcheckbox", { name: "Show weekends" })),
    ).not.toBeNull();
    expect(
      overlay(screen.getByRole("menuitem", { name: /Generate plans/ })),
    ).not.toBeNull();
    expect(
      overlay(screen.getByRole("menuitem", { name: "Delete Plan A" })),
    ).toBeNull();

    // A finger lands on the switch: the item's own click runs, once.
    const tick = overlay(screen.getByRole("menuitem", { name: /New plan/ }));
    if (!(tick instanceof HTMLElement)) throw new Error("no switch");
    await user.click(tick);
    expect(onNew).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
