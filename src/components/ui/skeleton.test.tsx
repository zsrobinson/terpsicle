import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageSkeleton, RowSkeleton } from "./skeleton";

describe("RowSkeleton and PageSkeleton", () => {
  it("are one quiet status each, in the shape of what's coming", () => {
    render(
      <>
        <RowSkeleton rows={4} label="Loading your deadlines" />
        <PageSkeleton rows={2} label="Loading Todo" />
      </>,
    );
    const rows = screen.getByRole("status", { name: "Loading your deadlines" });
    expect(rows.children).toHaveLength(4);
    expect(rows.firstElementChild).toHaveClass("px-4", "border-b");
    const page = screen.getByRole("status", { name: "Loading Todo" });
    // The page's rows sit flush with its column and aren't a second status.
    expect(screen.getAllByRole("status")).toHaveLength(2);
    expect(
      page.querySelector("[data-slot=row-skeleton] > div"),
    ).not.toHaveClass("px-4");
  });
});
