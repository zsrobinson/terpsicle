import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OutsideLink } from "./outside-link";

describe("OutsideLink", () => {
  it("opens another site in a new tab, with no handle back, and wears the arrow", () => {
    render(
      <OutsideLink href="https://planetterp.com/course/CMSC351">
        PlanetTerp
      </OutsideLink>,
    );
    const link = screen.getByRole("link", { name: "PlanetTerp" });
    expect(link).toHaveAttribute(
      "href",
      "https://planetterp.com/course/CMSC351",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link.querySelector("[data-outside-arrow]")).not.toBeNull();
    // The arrow is decoration: the words name the link.
    expect(link.querySelector("[data-outside-arrow]")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
