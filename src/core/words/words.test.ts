import { describe, expect, it } from "vitest";
import { countWords, listWords } from "./index";

describe("countWords", () => {
  it("adds an s past one", () => {
    expect(countWords(1, "section")).toBe("1 section");
    expect(countWords(4, "lecture")).toBe("4 lectures");
    expect(countWords(0, "course")).toBe("0 courses");
  });

  it("takes the plural for nouns that don't just add an s", () => {
    expect(countWords(1, "course", "courses")).toBe("1 course");
    expect(countWords(2, "class", "classes")).toBe("2 classes");
  });

  it("groups thousands", () => {
    expect(countWords(1200, "review")).toBe("1,200 reviews");
  });
});

describe("listWords", () => {
  it("reads a list aloud, without a comma before and", () => {
    expect(listWords([])).toBe("");
    expect(listWords(["A"])).toBe("A");
    expect(listWords(["A", "B"])).toBe("A and B");
    expect(listWords(["A", "B", "C"])).toBe("A, B and C");
    expect(listWords(["A", "B", "C", "D", "E"])).toBe("A, B, C, D and E");
  });

  it("counts what's past `shown`", () => {
    expect(listWords(["A", "B", "C"], 3)).toBe("A, B and C");
    expect(listWords(["A", "B", "C", "D", "E"], 3)).toBe("A, B, C and 2 more");
  });
});
