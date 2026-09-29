import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PageHeader } from "./page-header";
import { renderInRouter } from "./test-utils";

describe("PageHeader at page size", () => {
  it("is the page's h1, with its status, one Back, views and actions", async () => {
    renderInRouter(
      <PageHeader
        back={{ label: "Reviews", to: "/reviews" }}
        title="CMSC216 · Introduction to Computer Systems"
        status="Offered in Spring 2027"
        views={<nav aria-label="Views">views</nav>}
        actions={<button type="button">Write a review</button>}
      />,
    );
    const h1 = await screen.findByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("CMSC216 · Introduction to Computer Systems");
    expect(h1).toHaveClass("text-xl", "emph-title");
    expect(screen.getByText("Offered in Spring 2027")).toHaveClass("emph-meta");
    const back = screen.getByRole("link", { name: "Reviews" });
    expect(back).toHaveAttribute("href", "/reviews");
    // Every control has a tooltip: Back says where it goes.
    await userEvent.setup().hover(back);
    expect(
      await screen.findByRole("tooltip", { name: "Back to Reviews" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Views" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Write a review" }),
    ).toBeInTheDocument();
    // A header inside the page, not the site's banner.
    expect(h1.closest("header")).toHaveClass("border-b");
  });

  it("is a title alone when that's all there is", async () => {
    renderInRouter(<PageHeader title="Settings" />);
    const h1 = await screen.findByRole("heading", { level: 1 });
    expect(h1.closest("header")?.children).toHaveLength(1);
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("PageHeader at display size", () => {
  it("is a public page's h1, larger, with what the page is over it and no rule", async () => {
    renderInRouter(
      <PageHeader
        size="display"
        eyebrow="Instructor"
        title="Clyde Kruskal"
        status="Taught CMSC351"
        back={{ label: "Reviews", to: "/reviews" }}
        actions={<button type="button">Write a review</button>}
      />,
    );
    const h1 = await screen.findByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent("Clyde Kruskal");
    expect(h1).toHaveClass("text-3xl", "emph-title");
    expect(screen.getByText("Instructor")).toHaveClass(
      "text-product-reviews-text",
    );
    expect(screen.getByText("Taught CMSC351")).toHaveClass("text-lg");
    const header = h1.closest("header");
    expect(header).toHaveAttribute("data-slot", "page-header");
    expect(header).not.toHaveClass("border-b");
    expect(screen.getByRole("link", { name: "Reviews" })).toHaveAttribute(
      "href",
      "/reviews",
    );
  });
});

describe("PageHeader at panel size", () => {
  it("is the 48px panel header: an h2, never an h1", async () => {
    renderInRouter(
      <PageHeader
        size="panel"
        title="Plan A"
        status="5 courses · 16 credits"
        actions={<button type="button">Plan options</button>}
      />,
    );
    const h2 = await screen.findByRole("heading", { level: 2 });
    expect(h2).toHaveTextContent("Plan A");
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    const bar = h2.parentElement?.parentElement;
    expect(bar).toHaveClass("min-h-12", "border-b", "px-4");
    expect(bar).toHaveTextContent("Plan A5 courses · 16 creditsPlan options");
  });

  it("puts Back in the bar and the view switch under it", async () => {
    renderInRouter(
      <PageHeader
        size="panel"
        back={{ label: "Search", to: "/schedule/search" }}
        title="CMSC216"
        views={<nav aria-label="Room info">views</nav>}
      />,
    );
    const h2 = await screen.findByRole("heading", { level: 2 });
    const bar = h2.parentElement?.parentElement as HTMLElement;
    expect(within(bar).getByRole("link", { name: "Search" })).toHaveAttribute(
      "href",
      "/schedule/search",
    );
    const views = screen.getByRole("navigation", { name: "Room info" });
    expect(bar.contains(views)).toBe(false);
    expect(bar.nextElementSibling?.contains(views)).toBe(true);
  });
});
