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

  it("starts the narrow column beside a head, each column flowing on its own", () => {
    render(
      <SplitLayout
        size="display"
        top={<h1>CMSC351</h1>}
        mainProps={{ "aria-label": "Wide" }}
        sideProps={{ "aria-label": "Narrow" }}
        main={<h2>Reviews</h2>}
        side={<p>3.1</p>}
        after={<h2>Grades</h2>}
      />,
    );
    const wide = screen.getByLabelText("Wide");
    const narrow = screen.getByLabelText("Narrow");
    const head = screen.getByRole("heading", { name: "CMSC351" });
    const reviews = screen.getByRole("heading", { name: "Reviews" });
    const rating = screen.getByText("3.1");
    const grades = screen.getByRole("heading", { name: "Grades" });
    // Two columns from lg: the head and the reviews in the wide one, the
    // rating and the grades in the narrow one, each part under the last
    // (owner, 2026-10-04: "those two columns and things flowing naturally
    // within them"), so no part waits on a row the other column sets.
    expect(wide).toHaveClass("lg:col-span-2", "lg:flex-col");
    expect(narrow).toHaveClass("lg:col-start-3", "lg:flex-col");
    expect(wide).toContainElement(head);
    expect(wide).toContainElement(reviews);
    expect(narrow).toContainElement(rating);
    expect(narrow).toContainElement(grades);
    const layout = wide.parentElement as HTMLElement;
    for (const el of [layout, ...layout.querySelectorAll("*")]) {
      expect(el.className).not.toMatch(/row-start|row-span|grid-rows/);
    }
    // On a phone, one column: the head, the rating, the reviews, then the
    // grades.
    expect(wide).toHaveClass("max-lg:contents");
    expect(narrow).toHaveClass("max-lg:contents");
    const order = (el: HTMLElement) =>
      Number(
        /max-lg:order-(\d)/.exec(
          (el.parentElement as HTMLElement).className,
        )?.[1],
      );
    expect([head, rating, reviews, grades].map(order)).toEqual([1, 2, 3, 4]);
  });
});
