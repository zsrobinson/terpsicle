import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  fitHourHeight,
  hourLabel,
  MIN_HOUR_HEIGHT,
  WeekFrame,
} from "./week-frame";

describe("fitHourHeight", () => {
  it("shares the available height between the hours", () => {
    expect(fitHourHeight(900, 9)).toBe(100);
  });

  it("never goes below the readable minimum (then the grid scrolls)", () => {
    expect(fitHourHeight(200, 9)).toBe(MIN_HOUR_HEIGHT);
    expect(fitHourHeight(0, 9)).toBe(MIN_HOUR_HEIGHT);
  });
});

describe("hourLabel", () => {
  it.each([
    [8 * 60, "8am"],
    [12 * 60, "12pm"],
    [13 * 60, "1pm"],
    [0, "12am"],
  ])("%i → %s", (minute, label) => {
    expect(hourLabel(minute)).toBe(label);
  });
});

describe("WeekFrame", () => {
  it("draws the days given, the hours between, and lays out children", () => {
    render(
      <WeekFrame
        days={["M", "Tu", "W", "Th", "F", "Sa"]}
        startMinute={8 * 60}
        endMinute={17 * 60 + 15}
      >
        {(layout) => (
          <div data-testid="probe">
            {layout.startMinute}-{layout.endMinute}:{layout.yOf(9 * 60)}
          </div>
        )}
      </WeekFrame>,
    );
    const calendar = screen.getByRole("region", { name: "Week calendar" });
    for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"])
      expect(within(calendar).getByText(day)).toBeInTheDocument();
    // Rounded out to whole hours; the edges carry no label.
    expect(screen.getByTestId("probe")).toHaveTextContent(
      `480-1080:${MIN_HOUR_HEIGHT}`,
    );
    expect(screen.queryByText("8am")).toBeNull();
    expect(screen.getByText("5pm")).toBeInTheDocument();
    expect(screen.queryByText("6pm")).toBeNull();
  });

  it("lays an overlay over the day names, out of the grid's flow", () => {
    const frame = (overlay?: string) => (
      <WeekFrame
        days={["M", "Tu"]}
        startMinute={8 * 60}
        endMinute={17 * 60}
        overlay={overlay ? <div>{overlay}</div> : undefined}
      />
    );
    const { rerender } = render(frame());
    const header = screen.getByText("Mon").parentElement;
    const scroller = header?.parentElement;
    rerender(frame("Showing every section of CMSC351."));
    const layer = screen.getByText(
      "Showing every section of CMSC351.",
    ).parentElement;
    // Positioned over the grid, not a sibling pushing it down: the day
    // header and its scroll area are the same elements as before.
    expect(layer).toHaveClass("absolute", "top-0");
    expect(screen.getByText("Mon").parentElement).toBe(header);
    expect(header?.parentElement).toBe(scroller);
    expect(layer?.contains(header ?? null)).toBe(false);
  });
});
