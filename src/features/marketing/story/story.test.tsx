import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAccount } from "~/features/auth/account-store";
import { mockCourse } from "~/fixtures";
import { TooltipProvider } from "~/ui/tooltip";
import { HeroWords } from "../hero";
import { Pieces } from "./pieces";
import { PLAN_A, START } from "./plan-a";
import { Story } from "./story";

// The story's demos: they work from the keyboard, say what changed in the
// app's own toast with Undo, and show the mock catalog's real sections.

const toasts = vi.hoisted(
  () => [] as { message: string; onUndo: () => void }[],
);
vi.mock("~/ui/toast", async (original) => ({
  ...(await original<typeof import("~/ui/toast")>()),
  undoToast: (t: { message: string; onUndo: () => void }) => toasts.push(t),
}));

const show = (el: ReactElement) =>
  render(<TooltipProvider>{el}</TooltipProvider>);

const DAY = ["M", "Tu", "W", "Th", "F"] as const;

beforeEach(() => {
  toasts.length = 0;
  useAccount.setState({ status: "signed-out", user: null });
});
afterEach(() => vi.useRealTimers());

describe("Plan A", () => {
  it("is the mock catalog's sections, meeting where the catalog says", () => {
    for (const course of PLAN_A) {
      const real = mockCourse(course.code);
      expect(real.title).toBe(course.title);
      for (const section of course.sections) {
        const match = real.sections.find((s) => s.code === section.code);
        expect(match, `${course.code} ${section.code}`).toBeDefined();
        expect(match?.instructors).toEqual([section.instructor]);
        const timed = (match?.meetings ?? []).flatMap((m) =>
          m.timed
            ? [
                {
                  days: m.days.join(""),
                  start: m.start,
                  end: m.end,
                  place: `${m.building} ${m.room}`,
                },
              ]
            : [],
        );
        expect(timed).toEqual(
          section.meetings.map((m) => ({
            days: m.days.map((d) => DAY[d]).join(""),
            start: m.start,
            end: m.end,
            place: m.place,
          })),
        );
      }
    }
  });
});

describe("the Problems tab", () => {
  it("fixes the walk and the overlap, watches the full section, and undoes", async () => {
    const user = userEvent.setup();
    let state = START;
    const view = show(
      <Pieces stage={1} state={state} onChange={(next) => (state = next)} />,
    );
    const rerender = () =>
      view.rerender(
        <TooltipProvider>
          <Pieces stage={1} state={state} onChange={(next) => (state = next)} />
        </TooltipProvider>,
      );
    const problems = () =>
      [...document.querySelectorAll("[data-problem]")].map(
        (el) => (el as HTMLElement).dataset.problem,
      );
    expect(problems()).toEqual(["overlap", "tight-connection", "full"]);

    // The walking conflict, from the keyboard.
    screen.getByRole("button", { name: "Switch STAT400 to 0201" }).focus();
    await user.keyboard("{Enter}");
    rerender();
    expect(state.STAT400).toBe("0201");
    expect(problems()).toEqual(["overlap", "full"]);
    expect(toasts.at(-1)?.message).toBe("Switched STAT400 to 0201");
    // Focus lands on the next fix, not the top of the page.
    expect(
      screen.getByRole("button", { name: "Switch ENGL393 to 0205" }),
    ).toHaveFocus();

    await user.click(
      screen.getByRole("button", { name: "Watch CMSC351 0301 for a seat" }),
    );
    rerender();
    expect(state.watching).toBe(true);
    expect(
      screen.getByRole("button", { name: "Watching CMSC351 0301" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(toasts.at(-1)?.message).toBe("Watching CMSC351 0301 for a seat");

    act(() => toasts.at(-1)?.onUndo());
    rerender();
    expect(state).toEqual({ ...START, STAT400: "0201" });
  });

  it("leaves every piece but the current one's inert", () => {
    show(<Pieces stage={3} state={START} onChange={() => {}} />);
    const piece = (name: string) =>
      document.querySelector(`[data-piece="${name}"]`);
    expect(piece("chat")).not.toHaveAttribute("inert");
    expect(piece("reviews")).not.toHaveAttribute("inert");
    // A tab: it closes when you move on.
    expect(piece("problems")).toHaveAttribute("inert");
    // Not landed yet.
    expect(piece("plan")).toHaveAttribute("inert");
    expect(piece("todo")).toHaveAttribute("inert");
  });
});

describe("Chat and Todo", () => {
  it("sends a message into the sample room, and a classmate answers", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    show(<Pieces stage={3} state={START} onChange={() => {}} />);
    const log = screen.getByRole("list", { name: "Messages in CMSC351 0301" });
    expect(within(log).getAllByRole("listitem")).toHaveLength(2);
    await user.type(
      screen.getByRole("textbox", { name: "Message CMSC351 0301" }),
      "Room?{Enter}",
    );
    expect(within(log).getByText("Room?")).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Message CMSC351 0301" }),
    ).toHaveValue("");
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(
      within(log).getByText("Sounds good, see you there."),
    ).toBeInTheDocument();
  });

  it("checks a due date off, with Undo", async () => {
    const user = userEvent.setup();
    show(<Pieces stage={5} state={START} onChange={() => {}} />);
    const hw = screen.getByRole("checkbox", { name: "Done: Homework 4" });
    await user.click(hw);
    expect(hw).toBeChecked();
    expect(screen.getByText(/2 to do/)).toBeInTheDocument();
    expect(toasts.at(-1)?.message).toBe("Done: Homework 4");
    act(() => toasts.at(-1)?.onUndo());
    expect(hw).not.toBeChecked();
  });
});

describe("the story", () => {
  it("renders the words for search engines, and the steps move the screen", async () => {
    const user = userEvent.setup();
    Element.prototype.scrollIntoView = vi.fn();
    show(<Story />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Plan the semester in five steps, in one place.",
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(5);
    // The first move of the mouse brings the tooltips' code, and each
    // control is made anew inside its tooltip (marketing/lazy-tooltip.tsx),
    // so the controls are found after it.
    await user.hover(document.body);
    await waitFor(() =>
      expect(
        document.querySelector("[data-slot=tooltip-trigger]"),
      ).not.toBeNull(),
    );
    const steps = screen.getByRole("navigation", { name: "Steps" });
    const reviews = within(steps).getByRole("button", { name: "Reviews" });
    expect(reviews).toHaveAttribute("aria-pressed", "false");
    await user.click(reviews);
    expect(reviews).toHaveAttribute("aria-pressed", "true");
    expect(
      document.querySelector("[data-stage]")?.getAttribute("data-stage"),
    ).toBe("2");
    // The top bar's problems chip goes to Schedule's step.
    await user.click(
      screen.getByRole("button", { name: "Plan A has 3 problems" }),
    );
    expect(
      within(steps).getByRole("button", { name: "Schedule" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("never asks someone signed in to sign in", () => {
    useAccount.setState({ status: "signed-in" });
    show(<HeroWords />);
    expect(screen.queryByRole("link", { name: /Sign in/ })).toBeNull();
    expect(screen.getByText(/You're signed in/)).toBeInTheDocument();
  });

  it("keeps the sign-in link's place unseen until the account answers", () => {
    useAccount.setState({ status: "loading" });
    show(<HeroWords />);
    expect(screen.getByRole("link", { name: "Sign in with UMD" })).toHaveClass(
      "invisible",
    );
  });
});
