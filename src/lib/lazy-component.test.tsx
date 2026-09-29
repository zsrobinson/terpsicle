import { act, render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { describe, expect, it, vi } from "vitest";
import { lazyComponent } from "./lazy-component";

const Real = ({ name }: { name: string }) => <p>Hello, {name}</p>;
const Fallback = ({ name }: { name: string }) => <p>No code for {name}</p>;

/** A chunk that arrives, or doesn't, when the test says. */
function chunk() {
  let settle = { arrive: () => {}, fail: () => {} };
  const load = vi.fn(
    () =>
      new Promise<typeof Real>((resolve, reject) => {
        settle = {
          arrive: () => resolve(Real),
          fail: () => reject(new TypeError("Failed to fetch")),
        };
      }),
  );
  return { load, arrive: () => settle.arrive(), fail: () => settle.fail() };
}

const show = (Lazy: (p: { name: string }) => React.ReactNode) =>
  render(
    <Suspense fallback={<p>Loading</p>}>
      <Lazy name="Terp" />
    </Suspense>,
  );

describe("lazyComponent", () => {
  it("suspends until its code is here, then renders it", async () => {
    const c = chunk();
    const Lazy = lazyComponent(c.load, Fallback);
    show(Lazy);
    expect(screen.getByText("Loading")).toBeInTheDocument();
    await act(async () => c.arrive());
    expect(await screen.findByText("Hello, Terp")).toBeInTheDocument();
  });

  it("shows the fallback when the code doesn't arrive, never an error", async () => {
    const c = chunk();
    const Lazy = lazyComponent(c.load, Fallback);
    show(Lazy);
    await act(async () => c.fail());
    expect(await screen.findByText("No code for Terp")).toBeInTheDocument();
  });

  it("asks again once back online, and swaps the fallback for the real thing", async () => {
    const c = chunk();
    const Lazy = lazyComponent(c.load, Fallback);
    show(Lazy);
    await act(async () => c.fail());
    await screen.findByText("No code for Terp");
    // The fallback's mount asked once more; that fails too.
    await act(async () => c.fail());
    const calls = c.load.mock.calls.length;
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(c.load.mock.calls.length).toBe(calls + 1);
    await act(async () => c.arrive());
    expect(await screen.findByText("Hello, Terp")).toBeInTheDocument();
  });

  it("never sticks on a failure: the next preload fetches again", async () => {
    const c = chunk();
    const Lazy = lazyComponent(c.load, Fallback);
    const first = Lazy.preload();
    c.fail();
    await first;
    const second = Lazy.preload();
    expect(c.load).toHaveBeenCalledTimes(2);
    c.arrive();
    await second;
    // Here now: no more fetching.
    await Lazy.preload();
    expect(c.load).toHaveBeenCalledTimes(2);
  });
});
