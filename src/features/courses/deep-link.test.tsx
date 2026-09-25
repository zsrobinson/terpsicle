import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderShell } from "~/app/test-utils";
import { archivedFixtureTermId, aTerm } from "~/fixtures";
import { useUi } from "~/state/ui-store";
import { applyDeepLink, readDeepLink, withoutDeepLink } from "./deep-link";
import { panels } from "./panels";

vi.mock("~/app/analytics", () => ({ track: vi.fn() }));

describe("deep links", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("reads ?term=&course= and ignores anything malformed", () => {
    expect(readDeepLink("?term=202701&course=cmsc351")).toEqual({
      term: "202701",
      course: "CMSC351",
    });
    expect(readDeepLink("?term=202701")).toEqual({ term: "202701" });
    expect(readDeepLink("?course=CMSC351")).toBeNull();
    expect(readDeepLink("?term=spring&course=CMSC351")).toBeNull();
    expect(readDeepLink("?term=202701&course=<b>")).toBeNull();
  });

  it("drops only its own params", () => {
    expect(
      withoutDeepLink("https://terpsicle.com/?term=202701&course=CMSC351&x=1"),
    ).toBe("/?x=1");
  });

  it("switches term and opens the course; an unknown term does nothing", () => {
    const terms = [aTerm({ id: "202701" }), aTerm({ id: "202605" })];
    expect(applyDeepLink({ term: "202612" }, terms)).toBe("unknown-term");
    expect(applyDeepLink({ term: "202605", course: "CMSC131" }, terms)).toBe(
      "ok",
    );
    expect(useUi.getState().lastTermId).toBe("202605");
    expect(useUi.getState().stack).toEqual([
      { kind: "course", courseCode: "CMSC131" },
    ]);
  });

  it("follows the link on load, then clears it from the URL", async () => {
    window.history.replaceState(
      null,
      "",
      `/?term=${archivedFixtureTermId}&course=CMSC131`,
    );
    await act(async () => {
      await renderShell({ panels: [panels] });
    });
    await waitFor(() =>
      expect(useUi.getState().stack.at(-1)).toEqual({
        kind: "course",
        courseCode: "CMSC131",
      }),
    );
    expect(useUi.getState().lastTermId).toBe(archivedFixtureTermId);
    expect(window.location.search).toBe("");
  });
});
