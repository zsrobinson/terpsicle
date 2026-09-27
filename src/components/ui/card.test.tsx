import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "./card";

describe("Card", () => {
  it("is a keyline with the offset, for what you press or what floats", () => {
    render(<Card>Read 112 reviews</Card>);
    expect(screen.getByText("Read 112 reviews")).toHaveClass(
      "border-keyline",
      "shadow-offset",
      "bg-raised",
    );
  });
});
