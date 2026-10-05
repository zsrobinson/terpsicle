import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MUST_HAVES,
  type FilterCount,
  type Relaxable,
} from "~/core/schema";
import { aGeneratedPlan } from "~/fixtures";
import { TooltipProvider } from "~/ui/tooltip";
import { FilterChipsForGenerate, PreferenceChips } from "./chips";

// Each Generate chip's card (the owner, 2026-10-05: "hovering should display
// more information, like that histogram thing"): what the plans look like on
// what the chip ranks or filters by.

const plans = [
  // Best first: no gaps, then two with about two hours, one with four.
  aGeneratedPlan({ id: "a", breakdown: { compact: 1 } }),
  aGeneratedPlan({ id: "b", breakdown: { compact: 1 - 120 / 1200 } }),
  aGeneratedPlan({ id: "c", breakdown: { compact: 1 - 120 / 1200 } }),
  aGeneratedPlan({ id: "d", breakdown: { compact: 1 - 240 / 1200 } }),
];

describe("PreferenceChips' cards", () => {
  it("chart how the plans spread out, with the top plan marked", async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <PreferenceChips
          rankBy={{ preset: "compact" }}
          onChange={() => {}}
          plans={plans}
        />
      </TooltipProvider>,
    );
    await userEvent.setup().tab();
    const card = await screen.findByRole("tooltip");
    expect(card).toHaveTextContent("Least idle time between classes");
    expect(card).toHaveTextContent("Gaps between classes, a week");
    expect(card).toHaveTextContent("Your top plan:No gaps");
    expect(card).toHaveTextContent("Ranks higher");
    const chart = within(card).getByRole("img");
    expect(chart).toHaveAccessibleName(
      /Under half an hour of gaps, 1 plan; About 1 hour of gaps, 0 plans; About 2 hours of gaps, 2 plans; .*About 4 hours of gaps, 1 plan/,
    );
    expect(card.querySelectorAll("[data-top]")).toHaveLength(1);
  });

  it("are plain tooltips before there are plans", async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <PreferenceChips rankBy={{ preset: "compact" }} onChange={() => {}} />
      </TooltipProvider>,
    );
    await userEvent.setup().tab();
    const tip = await screen.findByRole("tooltip");
    expect(within(tip).queryByRole("img")).toBeNull();
  });
});

describe("FilterChipsForGenerate's cards", () => {
  const counts = new Map<Relaxable, FilterCount>([
    [
      "earliest-start",
      { constraint: "earliest-start", removed: 306, atLeast: false },
    ],
  ]);

  it("say what a filter that's on took out", async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <FilterChipsForGenerate
          mustHaves={{ ...DEFAULT_MUST_HAVES, earliestStart: 600 }}
          onChange={() => {}}
          blockCount={0}
          counts={counts}
          found={918}
          plans={plans}
        />
      </TooltipProvider>,
    );
    await userEvent.setup().tab();
    const card = await screen.findByRole("tooltip");
    expect(card).toHaveTextContent("Takes out 306 plans");
    expect(card).toHaveTextContent("Without it, 1,224 plans");
    expect(within(card).getByRole("img")).toHaveAccessibleName(
      "Kept 918 plans, took out 306",
    );
  });

  it("chart the plans on screen for a filter that's off", async () => {
    render(
      <TooltipProvider delayDuration={0}>
        <FilterChipsForGenerate
          mustHaves={DEFAULT_MUST_HAVES}
          onChange={() => {}}
          blockCount={0}
          counts={null}
          plans={[
            aGeneratedPlan({ stats: { firstClass: 9 * 60 } }),
            aGeneratedPlan({ stats: { firstClass: 11 * 60 } }),
          ]}
        />
      </TooltipProvider>,
    );
    await userEvent.setup().tab();
    const card = await screen.findByRole("tooltip");
    expect(card).toHaveTextContent("First class of the week");
    expect(within(card).getByRole("img")).toHaveAccessibleName(
      /First class 9am–10am, 1 plan; First class 10am–11am, 0 plans; First class 11am–12pm, 1 plan/,
    );
    // A filter's chart ranks nothing.
    expect(card).not.toHaveTextContent("Ranks higher");
  });
});
