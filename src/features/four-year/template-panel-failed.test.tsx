import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { aFourYear } from "~/fixtures";
import { TooltipProvider } from "~/ui/tooltip";
import { PlanModelProvider, PlanNavProvider, usePlanModel } from "./model";
import { TemplatePanel } from "./template-panel";

// The Samples view when its files don't load (offline, or a deploy replaced
// them): a specific line, Try again, and no card to act on.

const retry = vi.fn();
vi.mock("./template-files", () => ({
  useTemplates: () => ({ phase: "failed", chunk: false, retry }),
}));

function Harness() {
  const model = usePlanModel(aFourYear(), "2026-09-26", undefined);
  return (
    <TooltipProvider>
      <PlanNavProvider
        value={{ search: { tab: "templates" }, go: vi.fn(), back: vi.fn() }}
      >
        <PlanModelProvider value={model}>
          <TemplatePanel />
        </PlanModelProvider>
      </PlanNavProvider>
    </TooltipProvider>
  );
}

it("says the sample plans didn't load, and tries again", async () => {
  render(<Harness />);
  expect(screen.getByRole("status")).toHaveTextContent(
    "The sample plans didn't load. Check your connection and try again.",
  );
  expect(screen.queryByText(/reload the page/)).toBeNull();
  expect(screen.queryByRole("button", { name: /^Add to/ })).toBeNull();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledOnce();
});
