import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { NO_FILTERS, type SearchFilters } from "~/core/search/filters";
import { wildcardSearchInfo } from "~/core/search/wildcards";
import { aCourse } from "~/fixtures";
import {
  CourseResultRow,
  CourseSearchField,
  creditsLabel,
} from "./course-search";
import { TooltipProvider } from "./tooltip";

const info = wildcardSearchInfo([aCourse({ code: "CMSC351" })]);

function Box({
  count = 3,
  initialFilters = NO_FILTERS,
  onPick = () => {},
  tokens = true,
}: {
  count?: number;
  initialFilters?: SearchFilters;
  onPick?: (index: number) => void;
  tokens?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(initialFilters);
  const [active, setActive] = useState(-1);
  return (
    <TooltipProvider>
      <CourseSearchField
        query={query}
        onQueryChange={setQuery}
        tokens={
          tokens ? { info, filters, onFiltersChange: setFilters } : undefined
        }
        count={count}
        active={active}
        onActiveChange={setActive}
        onPick={onPick}
        placeholder="Course, title or GenEd"
        tooltip="Search"
      />
      <output data-testid="filters">{JSON.stringify(filters)}</output>
      <output data-testid="active">{active}</output>
    </TooltipProvider>
  );
}

const box = () => screen.getByRole("searchbox", { name: "Search courses" });
const filters = () =>
  JSON.parse(screen.getByTestId("filters").textContent ?? "{}");

describe("CourseSearchField", () => {
  it("moves through results with the arrows, stopping at the ends", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Box onPick={onPick} />);
    await user.click(box());
    await user.keyboard("{ArrowUp}");
    expect(screen.getByTestId("active")).toHaveTextContent("0");
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(screen.getByTestId("active")).toHaveTextContent("2");
    await user.keyboard("{Enter}");
    expect(onPick).toHaveBeenCalledWith(2);
  });

  it("Enter with nothing highlighted takes the top result", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Box onPick={onPick} />);
    await user.type(box(), "cmsc{Enter}");
    expect(onPick).toHaveBeenCalledWith(0);
  });

  it("turns a filter token into its chip on space or Enter", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<Box onPick={onPick} />);
    await user.type(box(), "ecology DSNS ");
    expect(box()).toHaveValue("ecology ");
    expect(filters().genEds).toEqual(["DSNS"]);
    await user.type(box(), "3cr{Enter}");
    expect(box()).toHaveValue("ecology ");
    expect(filters().credits).toEqual([3]);
    expect(onPick).not.toHaveBeenCalled();
    // A department stays text.
    await user.clear(box());
    await user.type(box(), "CMSC ");
    expect(box()).toHaveValue("CMSC ");
  });

  it("Backspace in an empty box takes the newest typed chip off first", async () => {
    const user = userEvent.setup();
    render(
      <Box
        initialFilters={{ ...NO_FILTERS, levels: [400], openSeats: true }}
      />,
    );
    await user.type(box(), "DSNS ");
    await user.keyboard("{Backspace}");
    expect(filters()).toMatchObject({
      genEds: [],
      levels: [400],
      openSeats: true,
    });
    // Then the line's last chip.
    await user.keyboard("{Backspace}");
    expect(filters()).toMatchObject({ levels: [], openSeats: true });
    await user.keyboard("{Backspace}");
    expect(filters()).toEqual(NO_FILTERS);
  });

  it("leaves tokens as text where there are no chips", async () => {
    const user = userEvent.setup();
    render(<Box tokens={false} />);
    await user.type(box(), "DSNS ");
    expect(box()).toHaveValue("DSNS ");
  });

  it("Esc clears the box, and lets the page have the next one", async () => {
    const user = userEvent.setup();
    const outer = vi.fn();
    render(
      // biome-ignore lint/a11y/noStaticElementInteractions: listens for the Esc that bubbles
      <div onKeyDown={(e) => e.key === "Escape" && outer()}>
        <Box />
      </div>,
    );
    await user.type(box(), "cmsc");
    await user.keyboard("{Escape}");
    expect(box()).toHaveValue("");
    expect(outer).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(outer).toHaveBeenCalledOnce();
  });
});

describe("CourseResultRow", () => {
  it("shows the code, credits, GenEds, title and meta", () => {
    render(
      <CourseResultRow
        code="PSYC100"
        title="Introduction to Psychology"
        credits={{ min: 3, max: 3 }}
        genEds={["DSHS", "DSNS"]}
        meta="2 sections"
        note="In Fall 2026"
      />,
    );
    for (const text of [
      "PSYC100",
      "3 cr",
      "DSHS",
      "DSNS",
      "Introduction to Psychology",
      "2 sections",
      "In Fall 2026",
    ])
      expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("says a credit range", () => {
    expect(creditsLabel(3, 3)).toBe("3 cr");
    expect(creditsLabel(1, 4)).toBe("1–4 cr");
  });
});
