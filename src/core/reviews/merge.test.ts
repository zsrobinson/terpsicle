import { describe, expect, it } from "vitest";
import { aPageReview, aPlanetTerpReview } from "~/fixtures";
import { mergeReviews } from "./merge";

const ours = (id: string, createdMonth: string) =>
  aPageReview({ id: `rv${id.padStart(20, "0")}`, createdMonth });
const theirs = (id: string, createdMonth: string) =>
  aPlanetTerpReview({ id: id.padStart(16, "0"), createdMonth });

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
});
