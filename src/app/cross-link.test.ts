import { describe, expect, it, vi } from "vitest";
import { track } from "./analytics";
import { crossLinkClicked, viewWords } from "./cross-link";

vi.mock("./analytics", () => ({ track: vi.fn() }));

describe("cross links", () => {
  it("say View and the product's own word (decisions.md)", () => {
    expect(viewWords("schedule")).toBe("View schedule");
    expect(viewWords("reviews")).toBe("View reviews");
    expect(viewWords("chat")).toBe("View chat");
    expect(viewWords("plan")).toBe("View plan");
    expect(viewWords("todo")).toBe("View todos");
  });

  it("count themselves with the two product ids and nothing else", () => {
    crossLinkClicked("todo", "chat");
    expect(track).toHaveBeenCalledWith("cross_link_clicked", {
      from: "todo",
      to: "chat",
    });
  });
});
