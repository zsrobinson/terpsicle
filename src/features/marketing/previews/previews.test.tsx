import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "~/ui/tooltip";
import { ChatPreview } from "./chat-preview";
import { PlanPreview } from "./plan-preview";
import { ReviewsPreview } from "./reviews-preview";
import { SchedulePreview } from "./schedule-preview";
import { TodoPreview } from "./todo-preview";

// The marketing page's live samples, with reduced motion: everything lands
// at once, so each test sees the end of the little show straight away.

function setup(ui: ReactNode) {
  const user = userEvent.setup();
  render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>);
  return user;
}

const politeText = () =>
  [...document.querySelectorAll("[aria-live='polite']")]
    .map((el) => el.textContent)
    .join(" ");

describe("the schedule sample", () => {
  it("adds a section, shows its problem, fixes it, and undoes", async () => {
    const user = setup(<SchedulePreview active reduced />);
    expect(screen.getByText("1 problem")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add STAT400 0101" }));
    expect(screen.getByText("2 problems")).toBeInTheDocument();
    expect(
      screen.getByText("STAT400 0101 overlaps CMSC351 0201"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Switch to 0301" }));
    expect(screen.getByText("1 problem")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText("2 problems")).toBeInTheDocument();
  });

  it("watches a full section for a seat, and the plan fits once it's fixed", async () => {
    const user = setup(<SchedulePreview active reduced />);
    await user.click(screen.getByRole("button", { name: "Add ECON200 0101" }));
    await user.click(screen.getByRole("button", { name: "Watch for a seat" }));
    expect(
      screen.getByText("Watching ECON200 0101 for a seat"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Switch to 0205" }));
    // A watch is handled, not a problem.
    expect(screen.getByText("No problems")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText("1 problem")).toBeInTheDocument();
  });

  it("says it's sample data", () => {
    setup(<SchedulePreview active reduced />);
    expect(screen.getByText("Sample seats")).toBeInTheDocument();
  });
});

describe("the reviews sample", () => {
  it("shows the whole summary at once, and switches instructors", async () => {
    const user = setup(<ReviewsPreview active reduced />);
    expect(screen.getByText("Sample")).toBeInTheDocument();
    expect(
      screen.getAllByText(/Clear, well-paced lectures/).length,
    ).toBeGreaterThan(0);
    const whitfield = screen.getByRole("button", { name: "J. Whitfield" });
    await user.click(whitfield);
    expect(whitfield).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getAllByText(/Knows the material deeply/).length,
    ).toBeGreaterThan(0);
  });
});

describe("the chat sample", () => {
  it("has its classmates' messages, and answers a reply politely", async () => {
    const user = setup(<ChatPreview active reduced />);
    const list = screen.getByRole("list", { name: "Messages in CMSC351" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    await user.type(
      screen.getByRole("textbox", { name: "Message CMSC351" }),
      "Can I join?{Enter}",
    );
    expect(within(list).getByText("Can I join?")).toBeInTheDocument();
    expect(
      within(list).getByText("Sounds good, see you there."),
    ).toBeInTheDocument();
    expect(politeText()).toContain("Devin Ruiz replied: Sounds good");
  });

  it("ignores an empty message", async () => {
    const user = setup(<ChatPreview active reduced />);
    await user.click(screen.getByRole("button", { name: "Send" }));
    const list = screen.getByRole("list", { name: "Messages in CMSC351" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
  });
});

describe("the plan sample", () => {
  it("moves a course from the keyboard, and GenEd progress follows", async () => {
    const user = setup(<PlanPreview active reduced />);
    expect(screen.getByText("Sample")).toBeInTheDocument();
    const dssp = screen.getByRole("img", { name: /^Scholarship in Practice/ });
    expect(dssp).toHaveAccessibleName(
      "Scholarship in Practice: 0 done, 0 planned, 2 needed",
    );
    // The form starts on the hint's move: ARTT100 to Spring 2028.
    expect(screen.getByRole("combobox", { name: "Move" })).toHaveValue(
      "ARTT100",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "to" }),
      "Spring 2028",
    );
    await user.click(screen.getByRole("button", { name: "Move" }));
    expect(politeText()).toContain("ARTT100 moved to Spring 2028.");
    expect(
      within(screen.getByRole("region", { name: "Spring 2028" })).getByText(
        "ARTT100",
      ),
    ).toBeInTheDocument();
    expect(dssp).toHaveAccessibleName(
      "Scholarship in Practice: 0 done, 1 planned, 2 needed",
    );
  });
});

describe("the todo sample", () => {
  it("ticks something off and says how many are left", async () => {
    const user = setup(<TodoPreview active reduced />);
    expect(screen.getByText("6 open")).toBeInTheDocument();
    await user.click(
      screen.getByRole("checkbox", {
        name: /Lab 4 report: mineral identification/,
      }),
    );
    expect(screen.getByText("5 open")).toBeInTheDocument();
    expect(politeText()).toContain(
      "Lab 4 report: mineral identification done. 5 open.",
    );
  });
});

describe("the marketing page's code", () => {
  const SOURCES = import.meta.glob<string>(
    ["/src/features/marketing/**/*.{ts,tsx}", "!/src/**/*.test.{ts,tsx}"],
    { query: "?raw", import: "default", eager: true },
  );

  it("never reaches for the scheduler's state or IndexedDB", () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(8);
    const code = Object.entries(SOURCES).filter(
      ([file]) => !/\.test\.tsx?$/.test(file),
    );
    const found = code.flatMap(([file, text]) =>
      [...text.matchAll(/from\s+["']([^"']+)["']/g)]
        .map((m) => m[1] ?? "")
        .filter((spec) =>
          /^(?:~\/state|dexie|~\/features\/auth(?:$|\/)|~\/app\/app$)/.test(
            spec,
          ),
        )
        .map((spec) => `${file}: ${spec}`),
    );
    expect(found).toEqual([]);
  });
});
