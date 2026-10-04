import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { RatingInput, ratingAt } from "./rating-input";
import { TooltipProvider } from "./tooltip";

function Rated({ start = null }: { start?: number | null }) {
  const [value, setValue] = useState<number | null>(start);
  return (
    <TooltipProvider delayDuration={0}>
      <RatingInput value={value} onChange={setValue} />
    </TooltipProvider>
  );
}

describe("RatingInput", () => {
  it("moves by half stars from the keyboard, and reads its value out", async () => {
    const user = userEvent.setup();
    render(<Rated />);
    const slider = screen.getByRole("slider", { name: "Rating" });
    expect(slider).toHaveAttribute("aria-valuetext", "Not rated yet");
    slider.focus();
    await user.keyboard("{ArrowRight}");
    expect(slider).toHaveAttribute("aria-valuenow", "1");
    await user.keyboard("{ArrowRight}{ArrowUp}{PageUp}");
    expect(slider).toHaveAttribute("aria-valuenow", "3");
    await user.keyboard("{ArrowLeft}");
    expect(slider).toHaveAttribute("aria-valuetext", "2.5 out of 5 stars");
    await user.keyboard("{End}{ArrowRight}");
    expect(slider).toHaveAttribute("aria-valuenow", "5");
    await user.keyboard("{Home}{ArrowDown}");
    expect(slider).toHaveAttribute("aria-valuenow", "1");
  });

  it("takes a star's left half as a half star", () => {
    // Five stars across 0–1: the second star's left half is 1.5.
    expect(ratingAt(0.25)).toBe(1.5);
    expect(ratingAt(0.4)).toBe(2);
    expect(ratingAt(0.95)).toBe(5);
    // Nothing under 1.
    expect(ratingAt(0.02)).toBe(1);
    expect(ratingAt(1.2)).toBe(5);
  });
});
