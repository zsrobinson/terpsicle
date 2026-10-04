import { describe, expect, it } from "vitest";
import { aPageReview, aPlanetTerpReview } from "~/fixtures";
import { mergeReviews } from "./merge";

const ours = (id: string, createdMonth: string, rating = 4) =>
  aPageReview({ id: `rv${id.padStart(20, "0")}`, createdMonth, rating });
const theirs = (id: string, createdMonth: string, rating = 4) =>
  aPlanetTerpReview({ id: id.padStart(16, "0"), createdMonth, rating });

const order = (list: ReturnType<typeof mergeReviews>) =>
  list.map(
    (r) => `${r.source === "terpsicle" ? "T" : "P"}${r.review.createdMonth}`,
  );

describe("mergeReviews", () => {
  it("lists both sources newest first, ours first within a month", () => {
    const merged = mergeReviews(
      [ours("1", "2026-09"), ours("2", "2025-11")],
      [theirs("a", "2026-01"), theirs("b", "2025-11"), theirs("c", "2024-03")],
      true,
    );
    expect(order(merged)).toEqual([
      "T2026-09",
      "P2026-01",
      "T2025-11",
      "P2025-11",
      "P2024-03",
    ]);
  });

  it("holds back ours older than the PlanetTerp reviews loaded so far", () => {
    const merged = mergeReviews(
      [ours("1", "2026-09"), ours("2", "2023-02")],
      [theirs("a", "2026-01"), theirs("b", "2025-11")],
      false,
    );
    expect(order(merged)).toEqual(["T2026-09", "P2026-01", "P2025-11"]);
  });

  it("shows all of ours when PlanetTerp has none", () => {
    expect(order(mergeReviews([ours("1", "2023-02")], [], false))).toEqual([
      "T2023-02",
    ]);
  });

  it("orders by rating, highest or lowest, newest first within a rating", () => {
    const mine = [ours("1", "2026-09", 4.5), ours("2", "2025-01", 2)];
    const pt = [
      theirs("a", "2026-01", 5),
      theirs("b", "2025-11", 2),
      theirs("c", "2024-03", 1),
    ];
    const rated = (list: ReturnType<typeof mergeReviews>) =>
      list.map((r) => `${r.review.rating}:${r.review.createdMonth}`);
    expect(rated(mergeReviews(mine, pt, true, "highest"))).toEqual([
      "5:2026-01",
      "4.5:2026-09",
      "2:2025-11",
      "2:2025-01",
      "1:2024-03",
    ]);
    expect(rated(mergeReviews(mine, pt, true, "lowest"))).toEqual([
      "1:2024-03",
      "2:2025-11",
      "2:2025-01",
      "4.5:2026-09",
      "5:2026-01",
    ]);
    // Oldest first; ours after the last PlanetTerp page loaded wait.
    expect(
      order(mergeReviews(mine, pt.slice(0, 1).reverse(), false, "oldest")),
    ).toEqual(["T2025-01", "P2026-01"]);
  });
});
