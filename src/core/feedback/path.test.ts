import { describe, expect, it } from "vitest";
import { feedbackPath, feedbackProduct, pathnameOf } from "./path";

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

describe("feedbackProduct", () => {
  it("names the product a page belongs to", () => {
    expect(feedbackProduct("/schedule")).toBe("schedule");
    expect(feedbackProduct("/reviews/courses/CMSC131")).toBe("reviews");
    expect(feedbackProduct("/chat/202608/CMSC131/0101")).toBe("chat");
    expect(feedbackProduct("/settings/notifications")).toBe("settings");
    expect(feedbackProduct("/todo/connect")).toBe("todo");
    expect(feedbackProduct("/plan")).toBe("plan");
    expect(feedbackProduct("/admin/decisions")).toBe("admin");
  });

  it("is null where the button doesn't show", () => {
    expect(feedbackProduct("/")).toBeNull();
    expect(feedbackProduct("/privacy")).toBeNull();
    expect(feedbackProduct("/signin")).toBeNull();
    expect(feedbackProduct("/planner")).toBeNull();
  });
});
