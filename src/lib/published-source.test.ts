import { afterEach, describe, expect, it } from "vitest";
import { createMemoryDataSource } from "~/state/data-source";
import { connectPublished, usePublishedSource } from "~/state/query/published";
import { pageSource, resetPageSource } from "./published-source";

afterEach(() => {
  connectPublished(null);
  resetPageSource();
});

describe("pageSource", () => {
  it("uses the source another product connected, else connects its own", async () => {
    const connected = createMemoryDataSource({});
    connectPublished(connected);
    expect(await pageSource()).toBe(connected);
    connectPublished(null);
    resetPageSource();
    const own = await pageSource();
    expect(usePublishedSource.getState().source).toBe(own);
    expect(await pageSource()).toBe(own);
  });
});
