import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageSection } from "./page-section";

describe("PageSection", () => {
  it("is a region under a hairline with a small heading, never a box", () => {
    render(
      <PageSection title="Account" aside="Signed in with Google">
        <p>Test Student</p>
      </PageSection>,
    );
    const heading = screen.getByRole("heading", { level: 2, name: "Account" });
    const section = heading.closest("section");
    expect(section).toHaveClass("border-t", "border-hairline", "pt-3");
    expect(section).not.toHaveClass("border", "shadow-offset");
    expect(section).toHaveTextContent(
      "AccountSigned in with GoogleTest Student",
    );
  });

  it("nests one level down", () => {
    render(
      <PageSection title="Grades" headingLevel={3}>
        <p>A 41%</p>
      </PageSection>,
    );
    expect(
      screen.getByRole("heading", { level: 3, name: "Grades" }),
    ).toBeInTheDocument();
  });
});
