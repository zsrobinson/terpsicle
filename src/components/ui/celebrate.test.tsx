import { render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type BarCount, justFinished, useCelebrate } from "./celebrate";
import { burstConfetti, flashDone } from "./confetti";

vi.mock("./confetti", () => ({
  burstConfetti: vi.fn(),
  flashDone: vi.fn(),
}));

const COLORS = [{ token: "course-blue-dot", weight: 1 }];

function Bar({
  quiet,
  ...count
}: BarCount & {
  quiet?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useCelebrate(ref, { ...count, colors: COLORS, size: "large", quiet });
  return (
    <div>
      <div ref={ref} data-testid="bar" />
    </div>
  );
}

function reduceMotion(on: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: on && query === "(prefers-reduced-motion: reduce)",
    })),
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  reduceMotion(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.mocked(burstConfetti).mockClear();
  vi.mocked(flashDone).mockClear();
});

const week = (done: number, total = 5, identity = "2026-09-28") => ({
  identity,
  done,
  total,
});

describe("justFinished", () => {
  it("is the check that fills the bar", () => {
    expect(justFinished(week(4), week(5))).toBe(true);
    expect(justFinished(week(3), week(5))).toBe(true);
  });

  it("is never the first look, or a bar that was already full", () => {
    expect(justFinished(null, week(5))).toBe(false);
    expect(justFinished(week(5), week(5))).toBe(false);
    expect(justFinished(week(4), week(4))).toBe(false);
  });

  it("is never another week, or a total that shrank to meet what's done", () => {
    expect(justFinished(week(4), week(5, 5, "2026-10-05"))).toBe(false);
    // A course hidden, or a deadline gone.
    expect(justFinished(week(4, 5), week(4, 4))).toBe(false);
    expect(justFinished(week(0, 0), week(0, 0))).toBe(false);
  });
});

describe("useCelebrate", () => {
  it("sends confetti once as a check fills the bar, as the fill gets there", () => {
    const { rerender, getByTestId } = render(<Bar {...week(4)} />);
    rerender(<Bar {...week(5)} />);
    expect(burstConfetti).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(burstConfetti).toHaveBeenCalledTimes(1);
    expect(burstConfetti).toHaveBeenCalledWith(
      getByTestId("bar"),
      COLORS,
      "large",
    );
    // The same count again (a refetch) sends nothing more.
    rerender(<Bar {...week(5)} />);
    vi.advanceTimersByTime(1000);
    expect(burstConfetti).toHaveBeenCalledTimes(1);
  });

  it("sends nothing for a week that opens done, or comes up done", () => {
    const { rerender } = render(<Bar {...week(5)} />);
    rerender(<Bar {...week(5, 5, "2026-10-05")} />);
    rerender(<Bar {...week(3, 3, "2026-10-12")} />);
    vi.advanceTimersByTime(1000);
    expect(burstConfetti).not.toHaveBeenCalled();
  });

  it("sends nothing when the check comes off before the fill gets there", () => {
    const { rerender } = render(<Bar {...week(4)} />);
    rerender(<Bar {...week(5)} />);
    rerender(<Bar {...week(4)} />);
    vi.advanceTimersByTime(1000);
    expect(burstConfetti).not.toHaveBeenCalled();
  });

  it("sends nothing more after an Undo and a check again, but does for the next week", () => {
    const { rerender } = render(<Bar {...week(4)} />);
    rerender(<Bar {...week(5)} />);
    vi.advanceTimersByTime(400);
    rerender(<Bar {...week(4)} />);
    rerender(<Bar {...week(5)} />);
    vi.advanceTimersByTime(400);
    expect(burstConfetti).toHaveBeenCalledTimes(1);
    rerender(<Bar {...week(2, 3, "2026-10-05")} />);
    rerender(<Bar {...week(3, 3, "2026-10-05")} />);
    vi.advanceTimersByTime(400);
    expect(burstConfetti).toHaveBeenCalledTimes(2);
  });

  it("still sends it after a check comes off before the fill got there", () => {
    const { rerender } = render(<Bar {...week(4)} />);
    rerender(<Bar {...week(5)} />);
    rerender(<Bar {...week(4)} />);
    rerender(<Bar {...week(5)} />);
    vi.advanceTimersByTime(400);
    expect(burstConfetti).toHaveBeenCalledTimes(1);
  });

  it("holds back while quiet", () => {
    const { rerender } = render(<Bar {...week(4)} quiet />);
    rerender(<Bar {...week(5)} quiet />);
    vi.advanceTimersByTime(1000);
    expect(burstConfetti).not.toHaveBeenCalled();
  });

  it("flashes the row instead under Reduce Motion, at once, with no confetti", () => {
    reduceMotion(true);
    const { rerender, getByTestId } = render(<Bar {...week(4)} />);
    rerender(<Bar {...week(5)} />);
    expect(flashDone).toHaveBeenCalledTimes(1);
    expect(flashDone).toHaveBeenCalledWith(getByTestId("bar").parentElement);
    vi.advanceTimersByTime(1000);
    expect(burstConfetti).not.toHaveBeenCalled();
  });

  it("forgets a pending burst when the bar goes away", () => {
    const { rerender, unmount } = render(<Bar {...week(4)} />);
    rerender(<Bar {...week(5)} />);
    unmount();
    vi.advanceTimersByTime(1000);
    expect(burstConfetti).not.toHaveBeenCalled();
  });
});
