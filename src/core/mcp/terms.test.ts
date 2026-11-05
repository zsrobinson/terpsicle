import { describe, expect, it } from "vitest";
import { aTerm } from "~/fixtures";
import {
  defaultTerm,
  newestTerm,
  readTermInput,
  semestersAfter,
  termRef,
} from "./terms";

// Terms as the MCP server takes and names them (docs/MCP.md).

describe("terms", () => {
  it("reads a term id or a name, any case, and nothing else", () => {
    expect(readTermInput("202708")).toBe("202708");
    expect(readTermInput(" Fall 2027 ")).toBe("202708");
    expect(readTermInput("winter 2027")).toBe("202612");
    expect(readTermInput("202703")).toBeNull();
    expect(readTermInput("next fall")).toBeNull();
  });

  it("names a term both ways", () => {
    expect(termRef("202612")).toEqual({ id: "202612", name: "Winter 2027" });
  });

  it("defaults to the newest active fall or spring, and knows the newest term", () => {
    const terms = [
      aTerm({ id: "202701", name: "Spring 2027" }),
      aTerm({ id: "202612", name: "Winter 2027", season: "winter" }),
      aTerm({ id: "202608", name: "Fall 2026", season: "fall" }),
    ];
    expect(defaultTerm(terms)?.id).toBe("202701");
    expect(newestTerm(terms)).toBe("202701");
    expect(defaultTerm([])).toBeNull();
    expect(newestTerm([])).toBeNull();
  });

  it("counts falls and springs forward from any season", () => {
    expect(semestersAfter("202701", 3)).toEqual(["202708", "202801", "202808"]);
    expect(semestersAfter("202708", 2)).toEqual(["202801", "202808"]);
    expect(semestersAfter("202612", 1)).toEqual(["202701"]);
    expect(semestersAfter("202605", 1)).toEqual(["202608"]);
  });
});
