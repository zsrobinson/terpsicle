import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MainPlanMark, TermTag } from "./term-tag";

describe("TermTag", () => {
  it("says Now or Next, and nothing for other terms", () => {
    const { rerender, container } = render(<TermTag tag="now" />);
    expect(screen.getByText("Now")).toHaveAttribute("data-term-tag", "now");
    rerender(<TermTag tag="next" />);
    expect(screen.getByText("Next")).toHaveClass("text-muted");
    rerender(<TermTag tag={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("MainPlanMark", () => {
  it("is decorative", () => {
    const { container } = render(<MainPlanMark />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });
});
