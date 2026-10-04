import { MutationObserver, type QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestQueryClient } from "~/state/query/testing";
import { refetchWhenRunSettles } from "./settle-run";

// A run of optimistic changes asks for the server's copy once, after its
// last change has settled, however the changes' ends fall.

/** A promise that waits until `open()`. */
function gate() {
  let open: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

/** Lets every timer due now run. */
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));

let client: QueryClient;
const refetch = vi.fn();

beforeEach(() => {
  client = createTestQueryClient();
  refetch.mockReset();
});

/** A change under `key` that ends when `until` settles. */
function change(key: readonly string[], until: Promise<void>) {
  return new MutationObserver(client, {
    mutationKey: key,
    mutationFn: () => until,
    onSettled: (_data, _error, _variables, _context, { client }) =>
      refetchWhenRunSettles(client, key, refetch),
  }).mutate();
}

describe("refetchWhenRunSettles", () => {
  it("asks once when two changes settle in the same tick", async () => {
    const answer = gate();
    const both = Promise.all([
      change(["list"], answer.promise),
      change(["list"], answer.promise),
    ]);
    answer.open();
    await both;
    await vi.waitFor(() => expect(refetch).toHaveBeenCalled());
    await nextTask();
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("waits for a change still on its way", async () => {
    const first = gate();
    const second = gate();
    const one = change(["list"], first.promise);
    const two = change(["list"], second.promise);
    first.open();
    await one;
    await nextTask();
    expect(refetch).not.toHaveBeenCalled();
    second.open();
    await two;
    await vi.waitFor(() => expect(refetch).toHaveBeenCalledOnce());
  });

  it("counts each key's run apart", async () => {
    const answer = gate();
    const otherRefetch = vi.fn();
    const other = new MutationObserver(client, {
      mutationKey: ["other"],
      mutationFn: () => answer.promise,
      onSettled: (_data, _error, _variables, _context, { client }) =>
        refetchWhenRunSettles(client, ["other"], otherRefetch),
    }).mutate();
    const list = change(["list"], answer.promise);
    answer.open();
    await Promise.all([other, list]);
    await vi.waitFor(() => expect(refetch).toHaveBeenCalledOnce());
    expect(otherRefetch).toHaveBeenCalledOnce();
  });

  it("asks again for a later run", async () => {
    await change(["list"], Promise.resolve());
    await vi.waitFor(() => expect(refetch).toHaveBeenCalledOnce());
    await change(["list"], Promise.resolve());
    await vi.waitFor(() => expect(refetch).toHaveBeenCalledTimes(2));
  });
});
