import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Plan } from "~/core/schema";
import { useUi } from "~/state/ui-store";
import { track } from "./analytics";
import { splitTabs } from "./plan-tabs";
import { renderShell } from "./test-utils";

vi.mock("./analytics", () => ({ track: vi.fn() }));

const tablist = () => screen.getByRole("tablist", { name: "Plans" });
const tabNames = () =>
  within(tablist())
    .getAllByRole("tab")
    .map((t) => t.textContent);

async function setup() {
  const view = await renderShell();
  await screen.findByRole("tab", { name: "Plan A" });
  return view;
}

async function openPlanMenu(user: Awaited<ReturnType<typeof setup>>["user"]) {
  const selected = within(tablist())
    .getAllByRole("tab")
    .find((t) => t.getAttribute("aria-selected") === "true");
  await user.click(
    screen.getByRole("button", { name: `${selected?.textContent} options` }),
  );
  return screen.findByRole("menu");
}

describe("plan tabs", () => {
  beforeEach(() => {
    vi.mocked(track).mockClear();
  });

  it("starts a first visit with one empty plan", async () => {
    await setup();
    expect(tabNames()).toEqual(["Plan A"]);
    expect(screen.getByRole("tab", { name: "Plan A" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("+ makes an empty plan, a copy, or opens Generate", async () => {
    const { user } = await setup();
    await user.click(screen.getByRole("button", { name: "New plan" }));
    await user.click(
      await screen.findByRole("menuitem", { name: /Empty plan/ }),
    );
    expect(tabNames()).toEqual(["Plan A", "Plan B"]);
    expect(track).toHaveBeenCalledWith("plan_created", { source: "empty" });

    await user.click(screen.getByRole("button", { name: "New plan" }));
    await user.click(
      await screen.findByRole("menuitem", { name: /Copy of Plan B/ }),
    );
    expect(tabNames()).toEqual(["Plan A", "Plan B", "Copy of Plan B"]);

    await user.click(screen.getByRole("button", { name: "New plan" }));
    await user.click(
      await screen.findByRole("menuitem", { name: /Generate plans/ }),
    );
    expect(useUi.getState().tab).toBe("generate");
    expect(screen.getByRole("heading", { name: "Generate" })).toBeVisible();
  });

  it("renames from the menu, and Esc cancels", async () => {
    const { user } = await setup();
    const menu = await openPlanMenu(user);
    await user.click(within(menu).getByRole("menuitem", { name: "Rename" }));
    const field = screen.getByRole("textbox", { name: "Plan name" });
    expect(field).toHaveFocus();
    await user.clear(field);
    await user.type(field, "Chill week{Enter}");
    expect(tabNames()).toEqual(["Chill week"]);
    expect(track).toHaveBeenCalledWith("plan_renamed", { via: "menu" });

    await user.dblClick(screen.getByRole("tab", { name: "Chill week" }));
    await user.type(
      screen.getByRole("textbox", { name: "Plan name" }),
      "zzz{Escape}",
    );
    expect(tabNames()).toEqual(["Chill week"]);
  });

  it("double-click renames in place", async () => {
    const { user } = await setup();
    await user.dblClick(screen.getByRole("tab", { name: "Plan A" }));
    expect(screen.getByRole("textbox", { name: "Plan name" })).toHaveFocus();
    // The old name is selected, so typing replaces it.
    await user.keyboard("Mornings off{Enter}");
    expect(tabNames()).toEqual(["Mornings off"]);
    expect(track).toHaveBeenCalledWith("plan_renamed", {
      via: "double-click",
    });
  });

  it("duplicates and deletes from the menu; Undo in the toast brings it back", async () => {
    const { user } = await setup();
    await user.click(
      within(await openPlanMenu(user)).getByRole("menuitem", {
        name: "Duplicate",
      }),
    );
    expect(tabNames()).toEqual(["Plan A", "Copy of Plan A"]);

    await user.click(
      within(await openPlanMenu(user)).getByRole("menuitem", {
        name: "Delete",
      }),
    );
    expect(tabNames()).toEqual(["Plan A"]);
    expect(screen.queryByRole("dialog")).toBeNull();
    const toast = await screen.findByText("Deleted Copy of Plan A");
    expect(toast).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(tabNames()).toEqual(["Plan A", "Copy of Plan A"]);
    expect(track).toHaveBeenCalledWith("undo_used", { via: "toast" });
  });

  it("⌘Z / Ctrl+Z undoes, ⇧ redoes", async () => {
    const { user } = await setup();
    await user.click(
      within(await openPlanMenu(user)).getByRole("menuitem", {
        name: "Duplicate",
      }),
    );
    await user.keyboard("{Control>}z{/Control}");
    expect(tabNames()).toEqual(["Plan A"]);
    await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
    expect(tabNames()).toEqual(["Plan A", "Copy of Plan A"]);
  });
});

describe("splitTabs", () => {
  const plans = ["A", "B", "C", "D", "E", "F", "G"].map(
    (l, order) => ({ id: `plan${l}xxxx`, name: `Plan ${l}`, order }) as Plan,
  );
  const ids = (ps: readonly Plan[]) => ps.map((p) => p.name.slice(-1)).join("");

  it("shows every tab up to the limit", () => {
    const { visible, overflow } = splitTabs(plans.slice(0, 5), "planAxxxx", 5);
    expect(ids(visible)).toBe("ABCDE");
    expect(overflow).toEqual([]);
  });

  it("moves the rest into the menu, keeping the open plan visible", () => {
    expect(ids(splitTabs(plans, "planBxxxx", 5).visible)).toBe("ABCDE");
    const { visible, overflow } = splitTabs(plans, "planGxxxx", 5);
    expect(ids(visible)).toBe("ABCDG");
    expect(ids(overflow)).toBe("EF");
  });

  it("shows just the open plan when there's room for one", () => {
    expect(ids(splitTabs(plans, "planCxxxx", 1).visible)).toBe("C");
  });
});
