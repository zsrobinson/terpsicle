import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Plus } from "lucide-react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ActionContextMenu,
  ActionMenu,
  ActionMenuCheckboxItem,
  ActionMenuGroup,
  ActionMenuItem,
  ActionMenuLinkItem,
  ActionMenuRadioGroup,
  ActionMenuRadioItem,
  ActionMenuSeparator,
  ActionMenuSub,
  ActionMenuText,
} from "./action-menu";
import { quietTooltips, TooltipProvider, WithTooltip } from "./tooltip";

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

/** The account menu's shape: words, a sign-out that stays open, a note. */
function Account({ onSignOut = () => undefined }: { onSignOut?: () => void }) {
  return (
    <TooltipProvider delayDuration={0}>
      <ActionMenu
        title="Account"
        tooltip="Your account and theme"
        trigger={<button type="button">TS</button>}
      >
        <ActionMenuText>Test Student</ActionMenuText>
        <ActionMenuItem
          keepOpen
          tooltip="Your plans stay on this device"
          onSelect={onSignOut}
        >
          Sign out
        </ActionMenuItem>
      </ActionMenu>
    </TooltipProvider>
  );
}

/** Rename swaps the trigger for a field, as the phone's plans sheet does. */
function Renaming() {
  const [renaming, setRenaming] = useState(false);
  const sent = useRef(false);
  if (renaming)
    // biome-ignore lint/a11y/noAutofocus: the person asked to rename
    return <input aria-label="Name" autoFocus />;
  return (
    <ActionMenu
      title="Plans"
      tooltip="Switch plans"
      finalFocus={() => (sent.current ? false : null)}
      trigger={<button type="button">Plan A</button>}
    >
      <ActionMenuItem
        onSelect={() => {
          sent.current = true;
          setRenaming(true);
        }}
      >
        Rename
      </ActionMenuItem>
    </ActionMenu>
  );
}

describe("ActionMenu's more-words and staying open", () => {
  it("on a phone, an item's tooltip is its described line, not its name", async () => {
    screenIs(true);
    const user = userEvent.setup();
    render(<Account />);
    await user.click(screen.getByRole("button", { name: "TS" }));
    const signOut = await screen.findByRole("menuitem", { name: "Sign out" });
    expect(signOut).toHaveAccessibleDescription(
      "Your plans stay on this device",
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("Test Student");
  });

  it("keeps a `keepOpen` item's menu open after it runs, in both shapes", async () => {
    for (const phone of [true, false]) {
      screenIs(phone);
      const user = userEvent.setup();
      const onSignOut = vi.fn();
      const { unmount } = render(<Account onSignOut={onSignOut} />);
      await user.click(screen.getByRole("button", { name: "TS" }));
      await user.click(
        await screen.findByRole("menuitem", { name: "Sign out" }),
      );
      expect(onSignOut).toHaveBeenCalledOnce();
      expect(screen.getByRole("menu")).toBeInTheDocument();
      unmount();
      vi.restoreAllMocks();
    }
  });

  it("leaves focus where an item sent it when `finalFocus` says so", async () => {
    screenIs(true);
    const user = userEvent.setup();
    render(
      <TooltipProvider delayDuration={0}>
        <Renaming />
      </TooltipProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Plan A" }));
    await user.click(await screen.findByRole("menuitem", { name: "Rename" }));
    const field = await screen.findByRole("textbox", { name: "Name" });
    await waitFor(() => expect(field).toHaveFocus());
    await new Promise((done) => setTimeout(done, 500));
    expect(field).toHaveFocus();
  });
});

/** A block's menu: an action, and a submenu of where it can go. */
function Block({
  onMove = () => undefined,
}: {
  onMove?: (to: string) => void;
}) {
  const [credits, setCredits] = useState("3");
  return (
    <TooltipProvider delayDuration={0}>
      <p data-testid="credits">{credits}</p>
      <ActionMenu
        title="CMSC216"
        tooltip="Move, remove or change CMSC216"
        trigger={<button type="button">CMSC216 options</button>}
      >
        <ActionMenuItem>About CMSC216</ActionMenuItem>
        <ActionMenuSub label="Move to…">
          <ActionMenuItem onSelect={() => onMove("fall")}>
            Fall 2026
          </ActionMenuItem>
          <ActionMenuItem onSelect={() => onMove("spring")}>
            Spring 2027
          </ActionMenuItem>
        </ActionMenuSub>
        <ActionMenuSub label="Credits">
          <ActionMenuRadioGroup value={credits} onValueChange={setCredits}>
            <ActionMenuRadioItem value="3">3 credits</ActionMenuRadioItem>
            <ActionMenuRadioItem value="4">4 credits</ActionMenuRadioItem>
          </ActionMenuRadioGroup>
        </ActionMenuSub>
      </ActionMenu>
    </TooltipProvider>
  );
}

describe("ActionMenuSub", () => {
  it("is a submenu beside its item on a desktop", async () => {
    screenIs(false);
    const user = userEvent.setup();
    const onMove = vi.fn();
    render(<Block onMove={onMove} />);
    await user.click(screen.getByRole("button", { name: "CMSC216 options" }));
    const moveTo = await screen.findByRole("menuitem", { name: "Move to…" });
    expect(moveTo).toHaveAttribute("aria-haspopup", "menu");
    // From the keyboard, as a submenu goes: right to open it.
    await user.keyboard("{ArrowDown}{ArrowDown}");
    await waitFor(() => expect(moveTo).toHaveFocus());
    await user.keyboard("{ArrowRight}");
    const fall = await screen.findByRole("menuitem", { name: "Fall 2026" });
    await waitFor(() => expect(fall).toHaveFocus());
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onMove).toHaveBeenCalledWith("spring");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("takes the sheet's list's place on a phone, with a row back", async () => {
    screenIs(true);
    const user = userEvent.setup();
    render(<Block />);
    await user.click(screen.getByRole("button", { name: "CMSC216 options" }));
    await screen.findByRole("dialog", { name: "CMSC216" });
    const credits = screen.getByRole("menuitem", { name: "Credits" });
    await user.click(credits);
    // The list steps aside; the submenu's chosen item takes focus.
    expect(
      screen.queryByRole("menuitem", { name: "About CMSC216" }),
    ).toBeNull();
    const three = screen.getByRole("menuitemradio", { name: "3 credits" });
    await waitFor(() => expect(three).toHaveFocus());
    // Back to the list, onto the row it left from.
    await user.click(
      screen.getByRole("menuitem", { name: /^Credits\s*, back$/ }),
    );
    expect(
      screen.getByRole("menuitem", { name: "About CMSC216" }),
    ).toBeVisible();
    await waitFor(() => expect(credits).toHaveFocus());
    // A pick inside one closes the sheet.
    await user.click(screen.getByRole("menuitem", { name: "Credits" }));
    await user.click(screen.getByRole("menuitemradio", { name: "4 credits" }));
    expect(screen.getByTestId("credits")).toHaveTextContent("4");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // And the next opening starts on the list again.
    await user.click(screen.getByRole("button", { name: "CMSC216 options" }));
    await screen.findByRole("dialog", { name: "CMSC216" });
    expect(
      screen.getByRole("menuitem", { name: "About CMSC216" }),
    ).toBeVisible();
  });
});

/** A row with a right-click menu. */
function Row({ onRemove = () => undefined }: { onRemove?: () => void }) {
  return (
    <TooltipProvider delayDuration={0}>
      <ActionContextMenu
        title="CMSC216"
        target={<div data-course="CMSC216">CMSC216 row</div>}
      >
        <ActionMenuItem>More about this course</ActionMenuItem>
        <ActionMenuSeparator />
        <ActionMenuItem onSelect={onRemove}>Remove</ActionMenuItem>
      </ActionContextMenu>
    </TooltipProvider>
  );
}

describe("ActionContextMenu", () => {
  it("opens at the pointer on a right click on a desktop", async () => {
    screenIs(false);
    const onRemove = vi.fn();
    render(<Row onRemove={onRemove} />);
    const row = screen.getByText("CMSC216 row");
    // The row itself is the trigger.
    expect(row).toHaveAttribute("data-course", "CMSC216");
    fireEvent.contextMenu(row, { clientX: 20, clientY: 20 });
    const menu = await screen.findByRole("menu", { name: "CMSC216" });
    expect(menu).toHaveAttribute("data-slot", "action-menu");
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent
      .setup()
      .click(screen.getByRole("menuitem", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("opens the same items as a sheet on a phone's long press", async () => {
    screenIs(true);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const onRemove = vi.fn();
      render(<Row onRemove={onRemove} />);
      const row = screen.getByText("CMSC216 row");
      fireEvent.touchStart(row, { touches: [{ clientX: 20, clientY: 20 }] });
      await vi.advanceTimersByTimeAsync(600);
      fireEvent.touchEnd(row);
      const sheet = await screen.findByRole("dialog", { name: "CMSC216" });
      expect(sheet).toHaveAttribute("data-slot", "action-sheet");
      // Never the small menu at the finger as well.
      expect(document.querySelector("[data-slot=action-menu]")).toBeNull();
      fireEvent.click(screen.getByRole("menuitem", { name: "Remove" }));
      expect(onRemove).toHaveBeenCalledOnce();
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens the sheet on a phone's context menu too (Android's long press)", async () => {
    screenIs(true);
    render(<Row />);
    fireEvent.contextMenu(screen.getByText("CMSC216 row"), {
      clientX: 20,
      clientY: 20,
    });
    expect(
      await screen.findByRole("dialog", { name: "CMSC216" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("menu", { name: "CMSC216" })).toBeVisible();
  });

  it("doesn't open on a short tap", async () => {
    screenIs(true);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<Row />);
      const row = screen.getByText("CMSC216 row");
      fireEvent.touchStart(row, { touches: [{ clientX: 20, clientY: 20 }] });
      await vi.advanceTimersByTimeAsync(100);
      fireEvent.touchEnd(row);
      await vi.advanceTimersByTimeAsync(600);
      expect(screen.queryByRole("dialog")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("A group label under a sheet title that says it", () => {
  it("names its group without saying it twice", async () => {
    screenIs(true);
    const user = userEvent.setup();
    render(
      <TooltipProvider delayDuration={0}>
        <ActionMenu
          title="No classes on"
          tooltip="Days off"
          trigger={<button type="button">Days off</button>}
        >
          <ActionMenuGroup label="No classes on">
            <ActionMenuCheckboxItem
              checked={false}
              onCheckedChange={() => undefined}
            >
              Friday
            </ActionMenuCheckboxItem>
          </ActionMenuGroup>
        </ActionMenu>
      </TooltipProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Days off" }));
    await screen.findByRole("dialog", { name: "No classes on" });
    expect(screen.getByRole("group", { name: "No classes on" })).toBeVisible();
    expect(screen.getAllByText("No classes on")[1]).toHaveClass("sr-only");
  });
});

// A row keeps its highlight while its own menu is open: the `menu-open`
// variant in src/styles.css (`hover:bg-hover menu-open:bg-hover`). Its
// selector comes from there, so these hold the rows to what the page paints.
const STYLES =
  Object.values(
    import.meta.glob<string>("/src/styles.css", {
      query: "?raw",
      import: "default",
      eager: true,
    }),
  )[0] ?? "";
/** The variant's selector, applied to the row itself. */
const MENU_OPEN =
  /@custom-variant menu-open \(\s*&(.+?)\s*\);/s.exec(STYLES)?.[1] ?? "";

/** A list row with a ⋯ menu, a tooltip and a disclosure in it. */
function MenuRow() {
  const [more, setMore] = useState(false);
  return (
    <TooltipProvider delayDuration={0}>
      <ActionContextMenu
        title="CMSC216"
        target={<div data-testid="row">CMSC216 row</div>}
      >
        <ActionMenuItem>Remove</ActionMenuItem>
      </ActionContextMenu>
      <div data-testid="menu-row">
        <WithTooltip label="See sections and details">
          <button type="button">CMSC216</button>
        </WithTooltip>
        <button
          type="button"
          aria-expanded={more}
          onClick={() => setMore(!more)}
        >
          More
        </button>
        <ActionMenu
          title="CMSC216"
          tooltip="Actions for CMSC216"
          trigger={<button type="button">Actions for CMSC216</button>}
        >
          <ActionMenuItem>Remove</ActionMenuItem>
        </ActionMenu>
      </div>
    </TooltipProvider>
  );
}

describe("A row with its own menu open", () => {
  it("reads the variant from styles.css", () => {
    expect(MENU_OPEN).toContain("[data-menu-open]");
  });

  it("is lit while its ⋯ menu is open, on a desktop and a phone", async () => {
    for (const phone of [false, true]) {
      screenIs(phone);
      const user = userEvent.setup();
      const { unmount } = render(<MenuRow />);
      const row = screen.getByTestId("menu-row");
      expect(row.matches(MENU_OPEN)).toBe(false);
      await user.click(
        screen.getByRole("button", { name: "Actions for CMSC216" }),
      );
      await screen.findByRole(phone ? "dialog" : "menu", { name: "CMSC216" });
      expect(row.matches(MENU_OPEN)).toBe(true);
      await user.keyboard("{Escape}");
      await waitFor(() => expect(row.matches(MENU_OPEN)).toBe(false));
      unmount();
      vi.restoreAllMocks();
    }
  });

  it("is lit while its right-click menu is open", async () => {
    screenIs(false);
    render(<MenuRow />);
    const row = screen.getByTestId("row");
    expect(row.matches(MENU_OPEN)).toBe(false);
    fireEvent.contextMenu(row, { clientX: 20, clientY: 20 });
    await screen.findByRole("menu", { name: "CMSC216" });
    expect(row).toHaveAttribute("data-menu-open");
    expect(row.matches(MENU_OPEN)).toBe(true);
    await userEvent.setup().keyboard("{Escape}");
    await waitFor(() => expect(row.matches(MENU_OPEN)).toBe(false));
  });

  it("isn't lit by a tooltip or an open disclosure", async () => {
    screenIs(false);
    const user = userEvent.setup();
    render(<MenuRow />);
    const row = screen.getByTestId("menu-row");
    const more = screen.getByRole("button", { name: "More" });
    // The menus closed by the tests above keep tooltips quiet for a moment.
    quietTooltips(0);
    // The keyboard reaches the row's first control, and its tooltip opens.
    await user.tab();
    const name = screen.getByRole("button", { name: "CMSC216" });
    expect(name).toHaveFocus();
    await screen.findByRole("tooltip");
    fireEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    // Base UI marks a tooltip's trigger as a popup's.
    expect(name).toHaveAttribute("data-popup-open");
    expect(row.matches(MENU_OPEN)).toBe(false);
  });
});
