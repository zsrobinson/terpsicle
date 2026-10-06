import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProductPage } from "./product-page";
import { renderInRouter } from "./test-utils";

// A page picks a width and never invents one; only pages you read get the
// footer, and the frame, not the page, draws the bar.

describe("ProductPage", () => {
  it.each([
    ["note", "max-w-[560px]"],
    ["reading", "max-w-[720px]"],
  ] as const)("a %s page is one column with the footer", async (width, cls) => {
    renderInRouter(
      <ProductPage width={width}>
        <p>Body</p>
      </ProductPage>,
    );
    const main = await screen.findByRole("main");
    expect(main).toHaveClass(cls, "mx-auto", "px-4", "pt-4");
    expect(main).toHaveTextContent("Body");
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveClass(cls, "h-10");
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    expect(screen.getByRole("link", { name: "Terms of use" })).toHaveAttribute(
      "href",
      "/terms",
    );
    expect(
      screen.getByRole("link", { name: "About Terpsicle" }),
    ).toHaveAttribute("href", "/?stay");
    expect(screen.queryByRole("banner")).toBeNull();
  });

  it("drops the footer on a reading page that asks", async () => {
    renderInRouter(
      <ProductPage width="reading" footer={false}>
        Body
      </ProductPage>,
    );
    await screen.findByRole("main");
    expect(screen.queryByRole("contentinfo")).toBeNull();
  });

  it("gives an app page 1120px and no footer", async () => {
    renderInRouter(<ProductPage width="app">Body</ProductPage>);
    expect(await screen.findByRole("main")).toHaveClass("max-w-[1120px]");
    expect(screen.queryByRole("contentinfo")).toBeNull();
  });

  it("runs a full page edge to edge, with no column and no footer", async () => {
    renderInRouter(<ProductPage width="full">Panes</ProductPage>);
    const main = await screen.findByRole("main");
    expect(main.className).not.toMatch(/max-w-|px-4/);
    expect(main).toHaveClass("flex-1");
    expect(screen.queryByRole("contentinfo")).toBeNull();
  });
});
