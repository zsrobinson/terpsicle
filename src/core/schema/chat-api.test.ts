import { describe, expect, it } from "vitest";
import { ChatSearchSchema } from "./chat-api";

describe("ChatSearchSchema", () => {
  it("takes the term back as text when the router read it as a number", () => {
    expect(ChatSearchSchema.parse({ term: 202608, course: "CMSC216" })).toEqual(
      { term: "202608", course: "CMSC216" },
    );
    expect(ChatSearchSchema.parse({ term: "202608" }).term).toBe("202608");
  });

  it("drops a term that isn't one", () => {
    expect(ChatSearchSchema.parse({ term: 2026 }).term).toBeUndefined();
    expect(ChatSearchSchema.parse({ term: "fall" }).term).toBeUndefined();
  });
});
