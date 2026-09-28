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
    // Rounded out to whole hours. Every row is labeled, the first one too;
    // the bottom edge only closes the grid.
    expect(screen.getByTestId("probe")).toHaveTextContent(
      `480-1080:${MIN_HOUR_HEIGHT}`,
    );
    expect(screen.getByText("8am")).toBeInTheDocument();
    expect(screen.getByText("5pm")).toBeInTheDocument();
    expect(screen.queryByText("6pm")).toBeNull();
  });
});
