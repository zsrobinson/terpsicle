import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Flags, MeResult } from "~/core/schema";
import { api } from "~/server/fns/api";
import {
  type AccountClient,
  FLAGS_OFF,
  ME_RETRY_MS,
  setAccountClient,
  useAccount,
} from "./account-store";

// When /api/me can't answer (a flaky network, a busy server), the products
// someone could see a moment ago stay: the family bar keeps its Plan tab,
// and the account button its place. Only a first-ever visit falls back to
// everything off, and /api/me is asked again.

const FLAGS_ON: Flags = {
  ...FLAGS_OFF,
  signIn: true,
  chat: "on",
  reviews: "on",
  todo: true,
  plan: true,
};

const signedOut: MeResult = { status: "signed-out", flags: FLAGS_ON };

/** A client whose /api/me answers with each of `answers` in turn. */
function client(...answers: (MeResult | "fail")[]) {
  const me = vi.fn(async () => {
    const next = answers.shift() ?? "fail";
    if (next === "fail") throw new Error("network");
    return next;
  });
  setAccountClient({ me } as unknown as AccountClient);
  return me;
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  useAccount.setState({
    status: "loading",
    flags: FLAGS_OFF,
    user: null,
    pushPublicKey: null,
  });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  setAccountClient(api);
});

describe("when /api/me can't answer", () => {
  it("keeps the products this browser last saw", async () => {
    client(signedOut);
    await useAccount.getState().load();
    expect(useAccount.getState().flags.plan).toBe(true);

    // The next page, on a bad connection.
    useAccount.setState({ status: "loading", flags: FLAGS_OFF });
    client("fail");
    await useAccount.getState().load();
    expect(useAccount.getState().flags).toEqual(FLAGS_ON);
  });

  it("shows them at once, before /api/me answers", async () => {
    client(signedOut);
    await useAccount.getState().load();
    useAccount.setState({ status: "loading", flags: FLAGS_OFF });
    let answer: (result: MeResult) => void = () => {};
    setAccountClient({
      me: () =>
        new Promise<MeResult>((resolve) => {
          answer = resolve;
        }),
    } as unknown as AccountClient);
    const loading = useAccount.getState().load();
    expect(useAccount.getState().flags.plan).toBe(true);
    expect(useAccount.getState().status).toBe("loading");
    answer(signedOut);
    await loading;
  });

  it("falls back to everything off only on a first-ever visit", async () => {
    client("fail");
    await useAccount.getState().load();
    expect(useAccount.getState().flags).toEqual(FLAGS_OFF);
    expect(useAccount.getState().status).toBe("signed-out");
  });

  it("asks again, and takes the answer when it comes", async () => {
    const me = client("fail", "fail", signedOut);
    await useAccount.getState().load();
    expect(useAccount.getState().flags.plan).toBe(false);
    await vi.advanceTimersByTimeAsync(ME_RETRY_MS[0] ?? 0);
    await vi.advanceTimersByTimeAsync(ME_RETRY_MS[1] ?? 0);
    expect(me).toHaveBeenCalledTimes(3);
    expect(useAccount.getState().flags).toEqual(FLAGS_ON);
  });

  it("keeps someone signed in when a later check fails", async () => {
    client({
      status: "signed-in",
      flags: FLAGS_ON,
      user: {
        id: "testudo",
        name: "Testudo Terrapin",
        email: "testudo@terpmail.umd.edu",
        isAdmin: false,
        createdAt: "2026-10-01T15:00:00.000Z",
      },
      pushPublicKey: null,
    });
    await useAccount.getState().load();
    client("fail");
    await useAccount.getState().load();
    expect(useAccount.getState().status).toBe("signed-in");
    expect(useAccount.getState().user?.id).toBe("testudo");
  });
});
