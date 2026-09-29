import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageSection } from "./page-section";
import { SplitLayout } from "./split-layout";

describe("SplitLayout", () => {
  it("puts the wide column first, two thirds from lg, and passes each its props", () => {
    render(
      <SplitLayout
        mainProps={{ "aria-label": "Now" }}
        sideProps={{ "aria-label": "Next" }}
        main={<PageSection title="Today">Classes</PageSection>}
        side={<PageSection title="Spring 2027">Plan A</PageSection>}
      />,
    );
    const main = screen.getByLabelText("Now");
    const side = screen.getByLabelText("Next");
    expect(main).toHaveClass("lg:col-span-2");
    expect(main.parentElement).toHaveClass("lg:grid-cols-3");
    // In the DOM, and so on a phone, the wide column comes first.
    expect(
      main.compareDocumentPosition(side) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Under the wide column, the narrow one's first section keeps its rule.
    expect(side.className).toContain("max-lg:[&>section:first-child]:border-t");
  });

  it("spaces a display page's sections roomier", () => {
    render(
      <SplitLayout
        size="display"
        mainProps={{ "aria-label": "Main" }}
        main={<p>Reviews</p>}
        side={<p>Grades</p>}
      />,
    );
    expect(screen.getByLabelText("Main")).toHaveClass("gap-8");
  });

  it("starts the narrow column beside a head, and after it on a phone", () => {
    render(
      <SplitLayout
        size="display"
        top={<h1>Clyde Kruskal</h1>}
        mainProps={{ "aria-label": "Reviews" }}
        sideProps={{ "aria-label": "More" }}
        main={<p>Every review</p>}
        side={<p>Review them</p>}
      />,
    );
    const head = screen.getByRole("heading", { name: "Clyde Kruskal" });
    const side = screen.getByLabelText("More");
    const main = screen.getByLabelText("Reviews");
    // DOM (and phone) order: the head, the narrow column, the reviews.
    expect(
      head.compareDocumentPosition(side) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      side.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(side).toHaveClass("lg:row-span-2", "lg:col-start-3");
    expect(main).toHaveClass("lg:row-start-2", "lg:col-span-2");
  });

  it("puts the narrow column's end after the wide column on a phone, under its start on a wide screen", () => {
    render(
      <SplitLayout
        size="display"
        top={<h1>CMSC351</h1>}
        mainProps={{ "aria-label": "Reviews" }}
        main={<p>Every review</p>}
        side={<p>Review it</p>}
        after={<h2>Grades</h2>}
      />,
    );
    const main = screen.getByLabelText("Reviews");
    const after = screen.getByRole("heading", { name: "Grades" }).parentElement;
    expect(
      main.compareDocumentPosition(after as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(after).toHaveClass("lg:col-start-3", "lg:row-start-3");
    expect(main).toHaveClass("lg:row-span-2");
    expect(main.parentElement).toHaveClass("lg:grid-rows-[auto_auto_1fr]");
  });
});
