import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { aFourYear } from "~/fixtures";
import { TooltipProvider } from "~/ui/tooltip";
import { PlanModelProvider, PlanNavProvider, usePlanModel } from "./model";
import { TemplatePanel } from "./template-panel";

// The Samples tab when its chunk doesn't load (offline, or a deploy replaced
// it): a specific line, and no card to act on.

vi.mock("./template-files", () => ({
  useTemplates: () => ({ phase: "failed" }),
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

it("says the sample plans didn't load, and how to try again", () => {
  render(<Harness />);
  expect(screen.getByRole("alert")).toHaveTextContent(
    "The sample plans didn't load. Check your connection and reload the page.",
  );
  expect(screen.queryByRole("button", { name: /^Add to/ })).toBeNull();
});
