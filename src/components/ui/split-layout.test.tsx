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
});
