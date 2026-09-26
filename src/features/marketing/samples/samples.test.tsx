import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { mockCourses } from "~/fixtures";
import { TooltipProvider } from "~/ui/tooltip";
import { ChatSample } from "./chat-sample";
import chatSource from "./chat-sample.tsx?raw";
import { PlanSample } from "./plan-sample";
import planSource from "./plan-sample.tsx?raw";
import { ReviewsSample } from "./reviews-sample";
import { ScheduleSample } from "./schedule-sample";
import scheduleSource from "./schedule-sample.tsx?raw";
import { TodoSample } from "./todo-sample";
import todoSource from "./todo-sample.tsx?raw";

// The five live samples on the marketing page: each works from the
// keyboard, says what changed in its live region, and uses the fixtures'
// real UMD courses.

const show = (el: ReactElement) =>
  render(<TooltipProvider>{el}</TooltipProvider>);

const status = () => screen.getByRole("status");

describe("the samples' content", () => {
  it("names only courses the mock catalog has", () => {
    const known = new Set(mockCourses().map((c) => c.code));
    const codes = new Set(
      [scheduleSource, chatSource, planSource, todoSource]
        .join("\n")
        .match(/\b[A-Z]{4}\d{3}\b/g),
    );
    expect(codes.size).toBeGreaterThan(5);
    for (const code of codes) expect(known, code).toContain(code);
  });
});

describe("ScheduleSample", () => {
  it("adds sections, shows the problems they cause, fixes one and undoes", async () => {
    const user = userEvent.setup();
    show(<ScheduleSample active reduced={false} />);
    expect(screen.getByText("No problems")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add ENGL393 0101" }));
    expect(screen.getByText("1 problem")).toBeInTheDocument();
    expect(screen.getByText(/ENGL393 0101 overlaps CMSC330/)).toBeVisible();
    expect(status()).toHaveTextContent("ENGL393 0101 added.");

    await user.click(screen.getByRole("button", { name: "Add STAT400 0101" }));
    expect(screen.getByText("2 problems")).toBeInTheDocument();
    expect(screen.getByText(/8 min walk from ESJ to CSI/)).toBeVisible();

    // From the keyboard.
    screen.getByRole("button", { name: "Switch to 0404" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByText("1 problem")).toBeInTheDocument();
    expect(screen.getByText("ENGL393 0404")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Watch seats" }));
    expect(
      screen.getByRole("button", { name: "Watching", pressed: true }),
    ).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(
      screen.getByRole("button", { name: "Watch seats", pressed: false }),
    ).toBeVisible();
    expect(status()).toHaveTextContent("Undid Watch for a seat.");
  });
});

describe("ReviewsSample", () => {
  it("switches instructors, with one combined rating each", async () => {
    const user = userEvent.setup();
    show(<ReviewsSample active reduced={false} />);
    expect(
      screen.getByRole("button", { name: "Kemi Adeyemi", pressed: true }),
    ).toBeVisible();
    expect(screen.getByText("4.3")).toBeVisible();
    expect(
      screen.getByText("85 reviews: 21 on Terpsicle, 64 on PlanetTerp"),
    ).toBeVisible();

    screen.getByRole("button", { name: "Rana Haddad" }).focus();
    await user.keyboard(" ");
    expect(
      screen.getByRole("button", { name: "Rana Haddad", pressed: true }),
    ).toBeVisible();
    expect(screen.getByText("3.6")).toBeVisible();
    expect(screen.getByText(/Moves fast and skips/)).toBeVisible();
    expect(status()).toHaveTextContent("Showing Rana Haddad");
  });
});

describe("ChatSample", () => {
  it("shows the whole conversation at once under reduced motion", () => {
    show(<ChatSample active reduced />);
    const messages = within(
      screen.getByRole("list", { name: "Messages in CMSC351 0301" }),
    );
    expect(messages.getAllByRole("listitem")).toHaveLength(6);
  });

  it("sends a message and gets a reply, from the keyboard", async () => {
    const user = userEvent.setup();
    show(<ChatSample active reduced />);
    const box = screen.getByRole("textbox", { name: "Message CMSC351 0301" });
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await user.click(box);
    await user.keyboard("Room?{Enter}");
    const messages = within(
      screen.getByRole("list", { name: "Messages in CMSC351 0301" }),
    );
    expect(messages.getByText("Room?")).toBeVisible();
    expect(messages.getByText("Sounds good, see you there.")).toBeVisible();
    expect(box).toHaveValue("");
  });
});

describe("PlanSample", () => {
  it("places the unplanned course and moves the GenEd count", async () => {
    const user = userEvent.setup();
    show(<PlanSample active reduced={false} />);
    expect(
      screen.getByRole("img", {
        name: "History and Social Sciences: 1 done, 0 planned, 2 needed",
      }),
    ).toBeInTheDocument();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "into" }),
      "Fall 2028",
    );
    screen.getByRole("button", { name: "Place" }).focus();
    await user.keyboard("{Enter}");
    expect(
      within(screen.getByRole("region", { name: "Fall 2028" })).getByText(
        "ECON200",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("img", {
        name: "History and Social Sciences: 1 done, 1 planned, 2 needed",
      }),
    ).toBeInTheDocument();
    expect(status()).toHaveTextContent("ECON200 placed in Fall 2028");
  });
});

describe("TodoSample", () => {
  it("ticks items off and keeps count", async () => {
    const user = userEvent.setup();
    show(<TodoSample active reduced={false} />);
    expect(screen.getByText("6 open")).toBeVisible();
    const lab = screen.getByRole("checkbox", { name: /Homework 4/ });
    lab.focus();
    await user.keyboard(" ");
    expect(lab).toBeChecked();
    expect(screen.getByText("5 open")).toBeVisible();
    expect(status()).toHaveTextContent("Homework 4 done. 5 open.");
  });
});
