import { describe, expect, it } from "vitest";
import { feedbackPath, pathnameOf } from "./path";

describe("feedbackPath", () => {
  it("keeps only what analytics may see of a reporter's page", () => {
    expect(
      feedbackPath(
        "/schedule?plan=eyJzZWN0aW9ucyI6W119&tab=generate&q=cmsc",
        "bug",
      ),
    ).toBe("/schedule?plan=shared&tab=generate");
    expect(feedbackPath("/chat/202608/CMSC131/0101", "idea")).toBe(
      "/chat/:term/:course/:room",
    );
  });

  it("keeps a pinned note's page as it was", () => {
    expect(feedbackPath("/schedule?course=CMSC131&tab=search", "review")).toBe(
      "/schedule?course=CMSC131&tab=search",
    );
  });
});

describe("pathnameOf", () => {
  it("drops search and hash", () => {
    expect(pathnameOf("/reviews/x?a=1#b")).toBe("/reviews/x");
    expect(pathnameOf("?a")).toBe("/");
  });
});
