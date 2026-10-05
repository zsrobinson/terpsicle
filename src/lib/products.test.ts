import { describe, expect, it } from "vitest";
import { listedProducts, PRODUCTS, productLink } from "./products";

describe("listedProducts", () => {
  const ids = (plan: boolean, current: Parameters<typeof listedProducts>[1]) =>
    listedProducts({ plan }, current).map((p) => p.id);

  it("keeps the color order", () => {
    expect(PRODUCTS.map((p) => p.id)).toEqual([
      "schedule",
      "reviews",
      "chat",
      "plan",
      "todo",
    ]);
  });

  it("lists Plan once PLAN_ENABLED is on, or while you're in it", () => {
    expect(ids(false, "schedule")).toEqual([
      "schedule",
      "reviews",
      "chat",
      "todo",
    ]);
    expect(ids(false, null)).not.toContain("plan");
    expect(ids(false, "plan")).toContain("plan");
    expect(ids(true, null)).toContain("plan");
  });
});

describe("productLink", () => {
  const reviews = PRODUCTS[1];

  it("sends the purple tab to PlanetTerp while our Reviews pages are off", () => {
    expect(productLink(reviews, { reviewsPages: false }, "schedule")).toEqual({
      href: "https://planetterp.com",
      outside: true,
      hint: "On PlanetTerp",
      tooltip: "Reviews on PlanetTerp. Opens in a new tab.",
    });
  });

  it("keeps our own pages when they're on, and the page you're on", () => {
    expect(productLink(reviews, { reviewsPages: true }, null)).toEqual({
      href: "/reviews",
      outside: false,
    });
    expect(productLink(reviews, { reviewsPages: false }, "reviews")).toEqual({
      href: "/reviews",
      outside: false,
    });
  });

  it("never sends another product away", () => {
    for (const p of PRODUCTS.filter((p) => p.id !== "reviews"))
      expect(productLink(p, { reviewsPages: false }, null)).toEqual({
        href: p.to,
        outside: false,
      });
  });
});
