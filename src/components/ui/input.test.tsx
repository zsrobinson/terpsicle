import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Input, SearchField, Textarea } from "./input";
import { TooltipProvider } from "./tooltip";

describe("Input", () => {
  it("is one height (44px on phones, 32px on a desktop) and one border", () => {
    render(<Input aria-label="Plan name" defaultValue="Plan A" />);
    const field = screen.getByRole("textbox", { name: "Plan name" });
    expect(field).toHaveClass("h-11", "md:h-8", "border-hairline-strong");
    expect(field).toHaveValue("Plan A");
  });
});

describe("Textarea", () => {
  it("has the field's border and fill, at the height of its rows", () => {
    render(<Textarea aria-label="Your review" rows={6} defaultValue="Clear" />);
    const field = screen.getByRole("textbox", { name: "Your review" });
    expect(field).toHaveClass("border-hairline-strong", "bg-raised");
    expect(field).not.toHaveClass("h-11");
    expect(field).toHaveAttribute("rows", "6");
    expect(field).toHaveValue("Clear");
  });
});

function Search() {
  const [query, setQuery] = useState("");
  return (
    <TooltipProvider>
      <SearchField
        aria-label="Search courses"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onClear={() => setQuery("")}
      />
    </TooltipProvider>
  );
}

describe("SearchField", () => {
  it("is a search box whose frame draws the focus ring, with Clear once there's text", async () => {
    render(<Search />);
    const box = screen.getByRole("searchbox", { name: "Search courses" });
    expect(box.parentElement).toHaveClass(
      "h-11",
      "md:h-8",
      "focus-within:focus-outline",
    );
    expect(
      screen.queryByRole("button", { name: "Clear the search" }),
    ).toBeNull();
    const user = userEvent.setup();
    await user.type(box, "CMSC2");
    await user.click(screen.getByRole("button", { name: "Clear the search" }));
    expect(box).toHaveValue("");
    expect(
      screen.queryByRole("button", { name: "Clear the search" }),
    ).toBeNull();
  });
});
