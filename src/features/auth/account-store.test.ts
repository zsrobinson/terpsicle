import type { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Flags, MeResult, MeUser } from "~/core/schema";
import { SYNC_RESET_KEY } from "~/features/sync/status";
import { api } from "~/server/fns/api";
import { createTestQueryClient } from "~/state/query/testing";
import {
  type AccountClient,
  FLAGS_OFF,
  setAccountQueryClient,
  setSignOutHooks,
  useAccount,
} from "./account-store";
import { ME_RETRY_MS, meKey, setAccountClient } from "./me-query";

// Who's signed in comes from one query over /api/me (./me-query), which
// the account store mirrors. When /api/me can't answer (a flaky network, a
// busy server), the query asks again with its backoff, and the products
// someone could see a moment ago stay: the family bar keeps its Plan tab,
// and the account button its place. Only a first-ever visit falls back to
// everything off.

const FLAGS_ON: Flags = {
  ...FLAGS_OFF,
  signIn: true,
  chat: "on",
  reviews: "on",
  todo: true,
  plan: true,
};

const testudo: MeUser = {
  id: "testudo",
  name: "Testudo Terrapin",
  email: "testudo@terpmail.umd.edu",
  isAdmin: false,
  createdAt: "2026-10-01T15:00:00.000Z",
};

const signedOut: MeResult = { status: "signed-out", flags: FLAGS_ON };
const signedIn: MeResult = {
  status: "signed-in",
  flags: FLAGS_ON,
  user: testudo,
  pushPublicKey: "push-key",
};

let queryClient: QueryClient;

/** A client whose /api/me answers with each of `answers` in turn. */
function client(...answers: (MeResult | "fail")[]) {
  const me = vi.fn(async () => {
    const next = answers.shift() ?? "fail";
    if (next === "fail") throw new Error("network");
    return next;
  });
  const signOut = vi.fn(async () => ({ status: "signed-out" as const }));
  const remove = vi.fn(async () => ({
    status: "deleting" as const,
    deleteAfter: "2026-10-11T15:00:00.000Z",
  }));
  setAccountClient({
    me,
    auth: { signOut },
    account: { delete: remove },
  } as unknown as AccountClient);
  return { me, signOut, remove };
}

/** The next page: nothing heard yet, a fresh cache, the same localStorage. */
function nextPage() {
  queryClient = createTestQueryClient();
  setAccountQueryClient(queryClient);
  useAccount.setState({
    status: "loading",
    lastKnown: null,
    flags: FLAGS_OFF,
    user: null,
    pushPublicKey: null,
    deleteAfter: null,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  setSignOutHooks(async () => ({
    beforeSignOut: async () => {},
    afterSignOut: async () => {},
  }));
  nextPage();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  setAccountClient(api);
});

describe("the account answer", () => {
  it("is the query's: signed out, with the products that are on", async () => {
    const { me } = client(signedOut);
    await useAccount.getState().load();
    expect(me).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(meKey)).toEqual(signedOut);
    expect(useAccount.getState()).toMatchObject({
      status: "signed-out",
      flags: FLAGS_ON,
      user: null,
      pushPublicKey: null,
    });
  });

  it("is the query's: signed in, with who and the push key", async () => {
    client(signedIn);
    await useAccount.getState().load();
    expect(queryClient.getQueryData(meKey)).toEqual(signedIn);
    expect(useAccount.getState()).toMatchObject({
      status: "signed-in",
      user: testudo,
      pushPublicKey: "push-key",
    });
  });

  it("follows the cache when something else changes it", async () => {
    client(signedOut);
    await useAccount.getState().load();
    queryClient.setQueryData(meKey, signedIn);
    expect(useAccount.getState().status).toBe("signed-in");
    expect(useAccount.getState().user?.id).toBe("testudo");
  });

  it("asks again on every load, as another tab's sign-out does", async () => {
    const { me } = client(signedIn, signedOut);
    await useAccount.getState().load();
    await useAccount.getState().load();
    expect(me).toHaveBeenCalledTimes(2);
    expect(useAccount.getState().status).toBe("signed-out");
  });
});

describe("when /api/me can't answer", () => {
  it("asks again with the query's backoff, and takes the answer when it comes", async () => {
    const { me } = client("fail", "fail", signedOut);
    await useAccount.getState().load();
    // The page draws at once: signed out, everything off on a first visit.
    expect(useAccount.getState().status).toBe("signed-out");
    expect(useAccount.getState().flags.plan).toBe(false);
    expect(me).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync((ME_RETRY_MS[0] ?? 0) - 1);
    expect(me).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(me).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(ME_RETRY_MS[1] ?? 0);
    expect(me).toHaveBeenCalledTimes(3);
    expect(useAccount.getState().flags).toEqual(FLAGS_ON);
    expect(queryClient.getQueryData(meKey)).toEqual(signedOut);
  });

  it("stops after the last retry, until something asks again", async () => {
    const { me } = client("fail", "fail", "fail", "fail", signedOut);
    await useAccount.getState().load();
    await vi.advanceTimersByTimeAsync(
      ME_RETRY_MS.reduce((sum, ms) => sum + ms, 0),
    );
    expect(me).toHaveBeenCalledTimes(ME_RETRY_MS.length + 1);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(me).toHaveBeenCalledTimes(ME_RETRY_MS.length + 1);

    await useAccount.getState().load();
    expect(me).toHaveBeenCalledTimes(ME_RETRY_MS.length + 2);
    expect(useAccount.getState().flags).toEqual(FLAGS_ON);
  });

  it("keeps the products this browser last saw", async () => {
    client(signedOut);
    await useAccount.getState().load();
    expect(useAccount.getState().flags.plan).toBe(true);

    nextPage();
    client("fail");
    await useAccount.getState().load();
    expect(useAccount.getState().status).toBe("signed-out");
    expect(useAccount.getState().flags).toEqual(FLAGS_ON);
  });

  it("falls back to everything off only on a first-ever visit", async () => {
    client("fail");
    await useAccount.getState().load();
    expect(useAccount.getState().flags).toEqual(FLAGS_OFF);
    expect(useAccount.getState().status).toBe("signed-out");
  });

  it("keeps someone signed in when a later check fails", async () => {
    client(signedIn);
    await useAccount.getState().load();
    client("fail");
    await useAccount.getState().load();
    expect(useAccount.getState().status).toBe("signed-in");
    expect(useAccount.getState().user?.id).toBe("testudo");
    expect(queryClient.getQueryData(meKey)).toEqual(signedIn);
  });
});

describe("the boot hint", () => {
  it("is written from each answer: the flags and a yes or no, nothing about who", async () => {
    client(signedIn);
    await useAccount.getState().load();
    expect(localStorage.getItem("terpsicle:signed-in")).toBe("1");
    expect(JSON.parse(localStorage.getItem("terpsicle:flags") ?? "")).toEqual(
      FLAGS_ON,
    );
    expect(JSON.stringify({ ...localStorage })).not.toContain("testudo");
  });

  it("draws the last state at once, before /api/me answers", async () => {
    client(signedIn);
    await useAccount.getState().load();
    nextPage();
    let answer: (result: MeResult) => void = () => {};
    setAccountClient({
      me: () =>
        new Promise<MeResult>((resolve) => {
          answer = resolve;
        }),
    } as unknown as AccountClient);
    const loading = useAccount.getState().load();
    expect(useAccount.getState()).toMatchObject({
      status: "loading",
      lastKnown: "signed-in",
      flags: FLAGS_ON,
    });
    answer(signedOut);
    await loading;
    expect(useAccount.getState().status).toBe("signed-out");
  });

  it("is nothing without the flags that went with it", async () => {
    localStorage.setItem("terpsicle:signed-in", "1");
    setAccountClient({
      me: () => new Promise<MeResult>(() => {}),
    } as unknown as AccountClient);
    void useAccount.getState().load();
    expect(useAccount.getState().lastKnown).toBeNull();
    expect(useAccount.getState().flags).toEqual(FLAGS_OFF);
  });
});

describe("signing out", () => {
  it("clears who it was from the cache, and remembers signed out", async () => {
    const { signOut } = client(signedIn);
    await useAccount.getState().load();
    await useAccount.getState().signOut();
    expect(signOut).toHaveBeenCalledWith({ removeLocal: false });
    expect(queryClient.getQueryData(meKey)).toEqual(signedOut);
    expect(useAccount.getState()).toMatchObject({
      status: "signed-out",
      flags: FLAGS_ON,
      user: null,
      pushPublicKey: null,
    });
    expect(localStorage.getItem("terpsicle:signed-in")).toBe("0");
    expect(localStorage.getItem(SYNC_RESET_KEY)).toBe("1");
  });

  it("does the same when the account is deleted", async () => {
    client(signedIn);
    await useAccount.getState().load();
    await expect(useAccount.getState().deleteAccount()).resolves.toBe(
      "2026-10-11T15:00:00.000Z",
    );
    expect(queryClient.getQueryData(meKey)).toEqual(signedOut);
    expect(useAccount.getState()).toMatchObject({
      status: "signed-out",
      user: null,
      deleteAfter: "2026-10-11T15:00:00.000Z",
    });
    expect(localStorage.getItem("terpsicle:signed-in")).toBe("0");
  });
});
