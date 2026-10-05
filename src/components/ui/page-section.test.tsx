import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./page-header";
import { PageSection } from "./page-section";

describe("PageSection", () => {
  it("is a region under a hairline with a heading, never a box", () => {
    render(
      <PageSection title="Account" aside="Signed in with Google">
        <p>Test Student</p>
      </PageSection>,
    );
    const heading = screen.getByRole("heading", { level: 2, name: "Account" });
    // A step over its 13px content (QA5: both were 13px on Notifications).
    expect(heading).toHaveClass("emph-heading", "text-lg");
    const section = heading.closest("section");
    expect(section).toHaveClass("border-t", "border-hairline", "pt-3");
    expect(section).not.toHaveClass("border", "shadow-offset");
    expect(section).toHaveTextContent(
      "AccountSigned in with GoogleTest Student",
    );
  });

  it("leaves the rule to a page header right above it (QA2's double rule)", () => {
    render(
      <>
        <PageHeader title="CMSC351" />
        <PageSection title="Grades">
          <p>A 41%</p>
        </PageSection>
      </>,
    );
    const header = screen.getByRole("heading", { level: 1 }).closest("header");
    expect(header).toHaveAttribute("data-slot", "page-header");
    const section = screen
      .getByRole("heading", { level: 2, name: "Grades" })
      .closest("section");
    expect(section).toHaveClass(
      "[[data-slot=page-header]+&]:border-t-0",
      "[[data-slot=page-header]+&]:pt-0",
    );
  });

  it("nests one level down, a step under its parent's title", () => {
    render(
      <PageSection title="Grades" headingLevel={3}>
        <p>A 41%</p>
      </PageSection>,
    );
    expect(
      screen.getByRole("heading", { level: 3, name: "Grades" }),
    ).toHaveClass("emph-heading", "text-base");
  });
});

describe("PageSection at display size", () => {
  it("sets a public page's section larger and roomier, still under a hairline", () => {
    render(
      <PageSection size="display" title="Reviews" aside="171">
        <p>A review</p>
      </PageSection>,
    );
    const heading = screen.getByRole("heading", { level: 2, name: "Reviews" });
    expect(heading).toHaveClass("text-2xl", "emph-title");
    expect(heading.closest("section")).toHaveClass("border-t", "pt-6", "gap-4");
    expect(screen.getByText("171")).toHaveClass("text-base");
  });
});
