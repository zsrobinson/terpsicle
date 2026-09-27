import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EmptyState } from "./empty-state";
import { renderInRouter } from "./test-utils";

describe("EmptyState", () => {
  it("has a mark, a headline, one sentence, one filled action and a quiet link", async () => {
    renderInRouter(
      <EmptyState
        mark={<svg data-testid="mark" />}
        title="No classes here yet"
        line="Find any course to open its chat."
        primary={{ label: "Find a course", to: "/chat" }}
        secondary={{ label: "View schedule", to: "/schedule" }}
      />,
    );
    const heading = await screen.findByRole("heading", {
      level: 2,
      name: "No classes here yet",
    });
    expect(heading).toHaveClass("text-xl");
    expect(screen.getByTestId("mark").parentElement).toHaveClass("size-10");
    expect(screen.getByText("Find any course to open its chat.")).toHaveClass(
      "text-muted",
    );
    const primary = screen.getByRole("link", { name: "Find a course" });
    expect(primary).toHaveAttribute("href", "/chat");
    expect(primary).toHaveAttribute("data-slot", "button");
    const quiet = screen.getByRole("link", { name: "View schedule" });
    expect(quiet).toHaveAttribute("href", "/schedule");
    expect(quiet).not.toHaveAttribute("data-slot");
    expect(quiet).toHaveClass("underline");
  });

  it("puts a question the paths share between the sentence and the actions", async () => {
    renderInRouter(
      <EmptyState
        equal
        title="Plan your four years"
        line="Lay out every semester."
        primary={{ label: "Import your transcript", to: "/plan" }}
        secondary={{ label: "Start from a sample plan", to: "/plan" }}
      >
        <label>
          I started at UMD in <input />
        </label>
      </EmptyState>,
    );
    const question = await screen.findByLabelText("I started at UMD in");
    const line = screen.getByText("Lay out every semester.");
    const action = screen.getByRole("link", { name: "Import your transcript" });
    expect(
      line.compareDocumentPosition(question) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      question.compareDocumentPosition(action) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("gives equal paths two filled buttons of one size, and a third way as the quiet link", async () => {
    const onImport = vi.fn();
    renderInRouter(
      <EmptyState
        equal
        headingLevel={1}
        title="Plan your four years"
        line="Lay out every semester."
        primary={{ label: "Import your transcript", onClick: onImport }}
        secondary={{ label: "Start from a sample plan", to: "/plan" }}
        quiet={{ label: "or add courses yourself", to: "/plan" }}
      />,
    );
    await screen.findByRole("heading", { level: 1 });
    const importButton = screen.getByRole("button", {
      name: "Import your transcript",
    });
    const sample = screen.getByRole("link", {
      name: "Start from a sample plan",
    });
    for (const action of [importButton, sample]) {
      expect(action).toHaveAttribute("data-slot", "button");
      expect(action).toHaveClass("bg-accent", "h-9");
    }
    // Side by side, wrapping when the space is narrow.
    expect(importButton.parentElement).toBe(sample.parentElement);
    expect(importButton.parentElement).toHaveClass("flex-wrap");
    expect(
      screen.getByRole("link", { name: "or add courses yourself" }),
    ).not.toHaveAttribute("data-slot");
    await userEvent.setup().click(importButton);
    expect(onImport).toHaveBeenCalledOnce();
  });

  it("centers in a pane, and sits at the top-left on a page", async () => {
    renderInRouter(
      <>
        <EmptyState
          align="center"
          title="Centered"
          line="In a pane."
          primary={{ label: "One", onClick: () => undefined }}
        />
        <EmptyState
          title="Start"
          line="On a page."
          primary={{ label: "Two", onClick: () => undefined }}
        />
      </>,
    );
    const centered = (await screen.findByRole("heading", { name: "Centered" }))
      .parentElement?.parentElement;
    const start = screen.getByRole("heading", { name: "Start" }).parentElement
      ?.parentElement;
    expect(centered).toHaveClass("m-auto", "items-center", "text-center");
    expect(start).toHaveClass("items-start");
    expect(start).not.toHaveClass("text-center");
  });

  it("links outside the router with a plain link, as a filled button or the quiet link", async () => {
    const onStart = vi.fn();
    renderInRouter(
      <EmptyState
        title="Your deadlines and exams, in one list"
        line="Sign in to see your ELMS deadlines here."
        primary={{
          label: "Sign in with Google",
          href: "/api/auth/google?return=%2Ftodo",
          onClick: onStart,
        }}
        secondary={{ label: "Privacy", href: "/privacy" }}
      />,
    );
    const signIn = await screen.findByRole("link", {
      name: "Sign in with Google",
    });
    expect(signIn).toHaveAttribute("href", "/api/auth/google?return=%2Ftodo");
    expect(signIn).toHaveAttribute("data-slot", "button");
    const quiet = screen.getByRole("link", { name: "Privacy" });
    expect(quiet).toHaveAttribute("href", "/privacy");
    expect(quiet).not.toHaveAttribute("data-slot");
    // Kept on this page, so the click is all that's tested.
    signIn.addEventListener("click", (e) => e.preventDefault());
    await userEvent.setup().click(signIn);
    expect(onStart).toHaveBeenCalledOnce();
  });

  it("opens a step done elsewhere in a new tab, with no handle back", async () => {
    renderInRouter(
      <EmptyState
        title="Connect ELMS to see your deadlines"
        line="Copy the link from ELMS and paste it here."
        primary={{
          label: "Open your ELMS calendar",
          href: "https://umd.instructure.com/calendar",
          newTab: true,
        }}
        secondary={{ label: "Privacy", href: "/privacy" }}
      />,
    );
    const step = await screen.findByRole("link", {
      name: "Open your ELMS calendar",
    });
    expect(step).toHaveAttribute("target", "_blank");
    expect(step).toHaveAttribute("rel", "noopener noreferrer");
    // Without newTab, a link stays in this tab.
    expect(screen.getByRole("link", { name: "Privacy" })).not.toHaveAttribute(
      "target",
    );
  });

  it("shows an action's hint as its tooltip", async () => {
    renderInRouter(
      <EmptyState
        title="Nothing due"
        line="When ELMS lists one, it shows up here."
        primary={{
          label: "Connect ELMS",
          hint: "Add your ELMS calendar link",
          to: "/todo/connect",
        }}
      />,
    );
    const user = userEvent.setup();
    await user.hover(await screen.findByRole("link", { name: "Connect ELMS" }));
    expect(
      await screen.findByRole("tooltip", {
        name: "Add your ELMS calendar link",
      }),
    ).toBeInTheDocument();
  });
});
