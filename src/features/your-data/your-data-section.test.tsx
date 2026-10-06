import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDataExport, planImport } from "~/core/data-export";
import { aPlan, aSyncedTables } from "~/fixtures";
import { Toaster } from "~/ui/sonner";
import { TooltipProvider } from "~/ui/tooltip";
import type { AppliedImport, PreparedImport } from "./actions";
import { YourDataSection } from "./your-data-section";

// Settings → Your data: download, add a file with a preview first, Undo.
// The actions (IndexedDB, the account) are stood in for; what adding does
// is ~/core/data-export's, tested there.

const NOW = "2026-10-05T14:00:00.000Z";

const actions = vi.hoisted(() => ({
  downloadData: vi.fn(),
  prepareImport: vi.fn(),
  applyImport: vi.fn(),
  undoApplied: vi.fn(),
}));
vi.mock("./actions", () => actions);

function prepared(): Extract<PreparedImport, { status: "ok" }> {
  const file = buildDataExport({
    from: "browser",
    tables: aSyncedTables({
      plans: [aPlan({ id: "plan_theirs_c", name: "Plan C" })],
    }),
    account: null,
    now: NOW,
  });
  const plan = planImport({
    current: aSyncedTables(),
    file,
    taskUids: null,
    newId: () => "plan_new",
    now: NOW,
  });
  return {
    status: "ok",
    file,
    plan,
    summary: "Adds 1 plan.",
    names: ["Plan C · Spring 2027"],
  };
}

function show(signedIn: boolean) {
  render(
    <TooltipProvider>
      <YourDataSection who={{ signedIn, todo: true }}>
        {signedIn ? <p>Delete row</p> : null}
      </YourDataSection>
      <Toaster />
    </TooltipProvider>,
  );
}

const jsonFile = () =>
  new File(["{}"], "terpsicle-data-2026-10-05.json", {
    type: "application/json",
  });

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset();
});

describe("Your data", () => {
  it("says what a browser's file holds when signed out, and what an account's does", () => {
    show(false);
    expect(
      screen.getByText(
        /The plans, four-year plans and settings in this browser/,
      ),
    ).toBeVisible();
    expect(screen.getByText(/to this browser/)).toBeVisible();
    expect(screen.queryByText("Delete row")).toBeNull();
  });

  it("downloads the file and says so", async () => {
    actions.downloadData.mockResolvedValue("terpsicle-data-2026-10-05.json");
    show(true);
    await userEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(actions.downloadData).toHaveBeenCalledWith({
      signedIn: true,
      todo: true,
    });
    expect(
      await screen.findByText("Downloaded terpsicle-data-2026-10-05.json"),
    ).toBeVisible();
  });

  it("shows what a file adds before adding it, then adds it with Undo", async () => {
    const ready = prepared();
    actions.prepareImport.mockResolvedValue(ready);
    const applied: AppliedImport = {
      plan: ready.plan,
      taskUids: [],
      tasksLeftOut: 0,
      tasksStopped: false,
    };
    actions.applyImport.mockResolvedValue(applied);
    actions.undoApplied.mockResolvedValue(undefined);
    show(true);
    await userEvent.upload(
      screen.getByTitle("Choose a Terpsicle data file (.json)"),
      jsonFile(),
    );
    expect(await screen.findByText("Adds 1 plan.")).toBeVisible();
    expect(screen.getByText("Plan C · Spring 2027")).toBeVisible();
    // Nothing is added until asked.
    expect(actions.applyImport).not.toHaveBeenCalled();

    await userEvent.click(
      screen.getByRole("button", { name: "Add to your account" }),
    );
    expect(actions.applyImport).toHaveBeenCalledWith(ready.file, {
      signedIn: true,
      todo: true,
    });
    expect(await screen.findByText("Added 1 plan")).toBeVisible();
    expect(screen.queryByText("Adds 1 plan.")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(actions.undoApplied).toHaveBeenCalledWith(applied);
  });

  it("still offers Undo when adding tasks stopped partway, and says to add the file again", async () => {
    const ready = prepared();
    actions.prepareImport.mockResolvedValue(ready);
    actions.applyImport.mockResolvedValue({
      plan: ready.plan,
      taskUids: [],
      tasksLeftOut: 3,
      tasksStopped: true,
    } satisfies AppliedImport);
    show(true);
    await userEvent.upload(
      screen.getByTitle("Choose a Terpsicle data file (.json)"),
      jsonFile(),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Add to your account" }),
    );
    expect(
      await screen.findByText(
        "3 tasks weren't added. Check your connection and add the file again: what's already here is skipped.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Undo" })).toBeVisible();
  });

  it("leaves everything as it is on Cancel", async () => {
    actions.prepareImport.mockResolvedValue(prepared());
    show(false);
    await userEvent.upload(
      screen.getByTitle("Choose a Terpsicle data file (.json)"),
      jsonFile(),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Cancel" }),
    );
    expect(screen.queryByText("Adds 1 plan.")).toBeNull();
    expect(actions.applyImport).not.toHaveBeenCalled();
  });

  it("says plainly why a file can't be added", async () => {
    actions.prepareImport.mockResolvedValue({
      status: "error",
      message: "That isn't a Terpsicle data file.",
    });
    show(false);
    await userEvent.upload(
      screen.getByTitle("Choose a Terpsicle data file (.json)"),
      jsonFile(),
    );
    expect(
      await screen.findByText("That isn't a Terpsicle data file."),
    ).toBeVisible();
  });
});
