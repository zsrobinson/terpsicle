import { act, screen, within } from "@testing-library/react";
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

    const words =
      "Couldn't reach terpsicle.com to load the course catalog. Check your connection and try again.";
    // The kit's inline error: a quiet status, never an alert.
    expect(screen.getByText(words).closest("[role=status]")).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    flaky.reconnect();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Spring 2027")).toBeInTheDocument();
    expect(screen.queryByText(words)).toBeNull();
  });

  it("offers Reload when this tab is older than the catalog's format", async () => {
    const reload = vi
      .spyOn(window.location, "reload")
      .mockImplementation(() => {});
    const { user } = await renderShell();
    act(() =>
      useCatalog.setState({
        terms: null,
        appStale: true,
        termsError:
          "Terpsicle has been updated since this page opened. Reload to load the course catalog.",
      }),
    );
    expect(
      screen.getByText(/Terpsicle has been updated since this page opened/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalledOnce();
    reload.mockRestore();
  });

  it("with saved data on screen, only notes it quietly in the top bar", async () => {
    await renderShell();
    act(() => useCatalog.setState({ network: "offline" }));

    // The bar's own status; loading skeletons are statuses too.
    expect(
      within(screen.getByRole("banner")).getByRole("status"),
    ).toHaveTextContent("Offline · showing saved data");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
