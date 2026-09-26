import { describe, expect, it } from "vitest";
import { schedulerUrl } from "./url";

describe("schedulerUrl", () => {
  it("opens the scheduler on a deployment's root", () => {
    expect(schedulerUrl("https://terpsicle.com")).toBe(
      "https://terpsicle.com/schedule",
    );
    expect(schedulerUrl("http://localhost:3000/?demo=1")).toBe(
      "http://localhost:3000/schedule?demo=1",
    );
  });

  it("keeps a URL that already names a page", () => {
    expect(schedulerUrl("https://terpsicle.com/schedule?plan=abc")).toBe(
      "https://terpsicle.com/schedule?plan=abc",
    );
  });
});
