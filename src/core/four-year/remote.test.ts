import { describe, expect, it } from "vitest";
import { aFourYear, aFourYearEntry } from "~/fixtures";
import { createHistory, pushHistory } from "../plans/history";
import type { FourYearState } from "./reducer";
import { rebaseFourYearHistory, withRemoteDocs } from "./remote";

// Docs from the account in Plan's store: applied to every step of undo, so
// undo never brings back what they replaced (V3 §2.4, the scheduler's rule).

const a = aFourYear({ id: "fouryear_a_0001", name: "My plan" });
const b = aFourYear({ id: "fouryear_b_0001", name: "CS major" });
const withEntry = (doc: typeof a) => ({
  ...doc,
  entries: [aFourYearEntry({ id: "entry_cmsc131", code: "CMSC131" })],
});

describe("withRemoteDocs", () => {
  it("replaces, adds and removes docs, keeping the state when nothing changes", () => {
    const state: FourYearState = { docs: [a] };
    const renamed = { ...a, name: "Econ" };
    expect(withRemoteDocs(state, [[a.id, renamed]]).docs).toEqual([renamed]);
    expect(withRemoteDocs(state, [[b.id, b]]).docs).toEqual([a, b]);
    expect(withRemoteDocs(state, [[a.id, null]]).docs).toEqual([]);
    expect(withRemoteDocs(state, [[a.id, { ...a }]])).toBe(state);
    expect(withRemoteDocs(state, [[b.id, null]])).toBe(state);
  });
});

describe("rebaseFourYearHistory", () => {
  it("applies the change to every step and drops steps it made empty", () => {
    // The person renamed A here; then the account's version of A arrived.
    const s0: FourYearState = { docs: [a, b] };
    const s1: FourYearState = { docs: [{ ...a, name: "Mine" }, b] };
    const s2: FourYearState = { docs: [{ ...a, name: "Mine" }, withEntry(b)] };
    const history = pushHistory(pushHistory(createHistory(s0), s1), s2);
    const fromAccount = { ...a, name: "Theirs" };
    const moved: [FourYearState, FourYearState][] = [];
    const next = rebaseFourYearHistory(
      history,
      [[a.id, fromAccount]],
      (from, to) => moved.push([from, to]),
    );
    expect(next.present.docs).toEqual([fromAccount, withEntry(b)]);
    // Undo still takes back the entry, but never brings back either name.
    expect(next.past.map((s) => s.docs)).toEqual([[fromAccount, b]]);
    expect(moved.length).toBe(3);
  });

  it("drops redo steps that no longer change anything", () => {
    const s0: FourYearState = { docs: [a] };
    const s1: FourYearState = { docs: [withEntry(a)] };
    const history = { past: [], present: s0, future: [s1] };
    const next = rebaseFourYearHistory(history, [[a.id, withEntry(a)]]);
    expect(next.present.docs).toEqual([withEntry(a)]);
    expect(next.future).toEqual([]);
  });

  it("returns the same history when the change is already there", () => {
    const history = createHistory<FourYearState>({ docs: [a] });
    expect(rebaseFourYearHistory(history, [[a.id, { ...a }]])).toBe(history);
  });
});
