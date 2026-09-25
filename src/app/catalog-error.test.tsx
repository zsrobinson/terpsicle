import { act, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDataSource } from "~/fixtures";
import { useCatalog } from "~/state/catalog-store";
import {
  createBucketDataSource,
  createDataReader,
  DataError,
  type DataSource,
} from "~/state/data-source";
import { renderShell } from "./test-utils";

vi.mock("./analytics", () => ({ track: vi.fn() }));

/** The mock bucket, behind a connection that can drop. */
function flakySource() {
  const inner = createBucketDataSource(mockDataSource);
  let offline = true;
  const source: DataSource = {
    kind: "live",
    readJson: (key) =>
      offline
        ? Promise.reject(new DataError(key, "network", "offline"))
        : inner.readJson(key),
    readBinary: (key) =>
      offline
        ? Promise.reject(new DataError(key, "network", "offline"))
        : inner.readBinary(key),
  };
  return {
    source,
    reconnect: () => {
      offline = false;
    },
  };
}

describe("catalog load failures", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("with nothing saved, says what went wrong in place of the calendar, and retries", async () => {
    const { user } = await renderShell();
    const flaky = flakySource();
    await act(async () => {
      useCatalog.getState().setReader(createDataReader(flaky.source));
      await useCatalog.getState().loadTerms();
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't reach terpsicle.com to load the course catalog. Check your connection and try again.",
    );
    flaky.reconnect();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Spring 2027")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("with saved data on screen, only notes it quietly in the top bar", async () => {
    await renderShell();
    act(() => useCatalog.setState({ network: "offline" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Offline · showing saved data",
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
