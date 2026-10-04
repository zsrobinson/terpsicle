// Types only from TanStack Query: a value import here (a module every
// product's chunks share) splits its core out of `/`'s entry chunk.
import type { QueryCacheNotifyEvent, QueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import {
  type Flags,
  FlagsSchema,
  type MeResult,
  type MeUser,
} from "~/core/schema";
import { SYNC_RESET_KEY } from "~/features/sync/status";
import { accountClient, meKey, meQuery, signedOutAnswer } from "./me-query";

export { type AccountClient, setAccountClient } from "./me-query";

// Who's signed in, as the app sees it (docs/AUTH.md); every account control
// reads it. The answer is one query over POST /api/me (./me-query), asked
// once per page by AccountBoot and retried by the query; this store
// mirrors it, so its readers never need a query observer (`/` loads none).
// Nothing is stored in the browser about who you are: the session is an
// HttpOnly cookie. Each answer leaves a boot hint for the next page: the
// product flags (`FLAGS_KEY`), so a failed check doesn't hide products,
// and whether this browser was last signed in (`SIGNED_IN_KEY`, a yes or
// no), so a page can draw the right state while /api/me answers instead
// of flashing the signed-out one (owner, 2026-09-30).

export type AccountStatus = "loading" | "signed-out" | "signed-in";

export interface AccountState {
  status: AccountStatus;
  /**
   * While `status` is "loading": what this browser last saw, "signed-in" or
   * "signed-out", or null when it's never known (and in the server's
   * render, which is always anonymous).
   */
  lastKnown: Exclude<AccountStatus, "loading"> | null;
  /** Off until /api/me answers, so nothing flashes where sign-in is off. */
  flags: Flags;
  user: MeUser | null;
  /** The key to subscribe to web push with, while push works here. */
  pushPublicKey: string | null;
  /** When this browser's just-deleted account goes (for the settings page). */
  deleteAfter: string | null;

  /**
   * Asks /api/me again (the query refetches, whatever it holds). Resolves
   * once the store has something to draw: the answer, or the first
   * failure while the query keeps retrying.
   */
  load: () => Promise<void>;
  /**
   * Ends the session. Plans stay on the device unless `removeLocal` (a
   * shared computer), which first makes sure the account has every change
   * and throws `UnsavedChangesError` (from ~/features/sync) if it can't.
   */
  signOut: (options?: { removeLocal?: boolean }) => Promise<void>;
  /** Schedules deletion and signs out; returns when the account goes. */
  deleteAccount: () => Promise<string>;
}

/** Everything off: until /api/me answers, or when it can't. */
export const FLAGS_OFF: Flags = {
  signIn: false,
  chat: "off",
  reviews: "off",
  seatAlerts: false,
  push: false,
  todo: false,
  plan: false,
  authTestMode: false,
};

/**
 * The flags /api/me last gave this browser. A page shows them while it asks
 * again, and keeps them when it can't get an answer: turning every product
 * off on a flaky connection hid Plan's tab and the account button.
 */
const FLAGS_KEY = "terpsicle:flags";

function rememberedFlags(): Flags | null {
  try {
    const parsed = FlagsSchema.safeParse(
      JSON.parse(localStorage.getItem(FLAGS_KEY) ?? "null"),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Whether this browser was last signed in: "1" or "0", nothing about who. */
const SIGNED_IN_KEY = "terpsicle:signed-in";

function rememberedStatus(): AccountState["lastKnown"] {
  try {
    const value = localStorage.getItem(SIGNED_IN_KEY);
    return value === "1" ? "signed-in" : value === "0" ? "signed-out" : null;
  } catch {
    return null;
  }
}

function rememberStatus(status: Exclude<AccountStatus, "loading">): void {
  try {
    localStorage.setItem(SIGNED_IN_KEY, status === "signed-in" ? "1" : "0");
  } catch {
    // Storage blocked: the next page waits for /api/me, as it always has.
  }
}

function rememberFlags(flags: Flags): void {
  try {
    localStorage.setItem(FLAGS_KEY, JSON.stringify(flags));
  } catch {
    // Storage blocked: the next page asks /api/me again, as it always does.
  }
}

/** "Sign out and remove plans from this device" is for a shared computer (V2.md §4.7). */
export const REMOVE_TOOLTIP =
  "For a shared computer: signs out and clears your plans from this browser. They stay on your account.";

/** Why a sign-out didn't go through, in words for the person. */
export function signOutFailure(error: unknown): string {
  return error instanceof Error && error.name === "UnsavedChangesError"
    ? "Your latest changes haven't reached your account yet, so nothing was removed. Try again once you're online."
    : "Couldn't sign out. Check your connection and try again.";
}

/**
 * This browser's push endpoint, so signing out stops its notifications
 * (V2.md §4.7). Never waits on a service worker that isn't there.
 */
async function pushEndpoint(): Promise<string | undefined> {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
      return undefined;
    const registration = await navigator.serviceWorker.getRegistration("/");
    return (
      (await registration?.pushManager?.getSubscription())?.endpoint ??
      undefined
    );
  } catch {
    return undefined;
  }
}

/** Plan sync's part of signing out (~/features/sync/sign-out). */
export interface SignOutHooks {
  beforeSignOut: (o: {
    removeLocal: boolean;
    userId: string | null;
  }) => Promise<void>;
  afterSignOut: (o: { removeLocal: boolean }) => Promise<void>;
}

// Loaded only when someone signs out: it brings IndexedDB and the engine.
let signOutHooks = (): Promise<SignOutHooks> =>
  import("~/features/sync/sign-out");

/** Test hook: plan sync's sign-out steps. */
export function setSignOutHooks(next: () => Promise<SignOutHooks>): void {
  signOutHooks = next;
}

// ---------- the query's answer, mirrored ----------

let queryClient: QueryClient | null = null;
let stopMirroring = (): void => {};

/** The store's fields for an answer from /api/me. */
function answerState(answer: MeResult): Partial<AccountState> {
  return answer.status === "signed-in"
    ? {
        status: "signed-in",
        flags: answer.flags,
        user: answer.user,
        pushPublicKey: answer.pushPublicKey,
      }
    : {
        status: "signed-out",
        flags: answer.flags,
        user: null,
        pushPublicKey: null,
      };
}

/** An answer arrived (asked for, or set by a sign-out): draw it, and hint the next page. */
function mirrorAnswer(answer: MeResult): void {
  rememberFlags(answer.flags);
  rememberStatus(answer.status);
  useAccount.setState(answerState(answer));
}

/**
 * An ask failed and the query is trying again. Offline, a busy server, or
 * an older Worker without /api/me: someone already known stays as they
 * were; otherwise it's signed out with the products last seen here
 * (everything off on a first visit: the scheduler never needs an account).
 */
function mirrorFailure(answer: MeResult | undefined): void {
  if (useAccount.getState().status !== "loading") return;
  useAccount.setState(
    answer
      ? answerState(answer)
      : {
          status: "signed-out",
          flags: rememberedFlags() ?? FLAGS_OFF,
          user: null,
          pushPublicKey: null,
        },
  );
}

/** What happened to the answer's query, when the event is about it. */
function meEvent(event: QueryCacheNotifyEvent) {
  if (event.type !== "updated" || event.query.queryKey[0] !== meKey[0])
    return null;
  const { type } = event.action;
  return {
    answer: event.query.state.data as MeResult | undefined,
    answered: type === "success",
    failed: type === "failed" || type === "error",
  };
}

/**
 * Which query client holds the answer: the page's, which AccountBoot hands
 * over before it first asks (a test hands its own). The store follows
 * that client's answer from then on.
 */
export function setAccountQueryClient(next: QueryClient): void {
  if (next === queryClient) return;
  stopMirroring();
  queryClient = next;
  stopMirroring = next.getQueryCache().subscribe((event) => {
    const me = meEvent(event);
    if (me?.answered && me.answer) mirrorAnswer(me.answer);
    else if (me?.failed) mirrorFailure(me.answer);
  });
  const known = next.getQueryData<MeResult>(meKey);
  if (known) useAccount.setState(answerState(known));
}

/** Resolves at the answer's next failure; `stop` stops listening. */
function nextFailure(client: QueryClient) {
  let stop = (): void => {};
  const failed = new Promise<void>((resolve) => {
    stop = client.getQueryCache().subscribe((event) => {
      if (meEvent(event)?.failed) resolve();
    });
  });
  return { failed, stop };
}

/** The answer is now signed out, keeping the products that are on. */
function forgetWho(): void {
  const answer = signedOutAnswer(useAccount.getState().flags);
  // The cache's subscription draws it; with no client yet, draw it here.
  if (queryClient) queryClient.setQueryData(meKey, answer);
  else mirrorAnswer(answer);
}

export const useAccount = create<AccountState>()((set, get) => ({
  status: "loading",
  lastKnown: null,
  flags: FLAGS_OFF,
  user: null,
  pushPublicKey: null,
  deleteAfter: null,

  load: async () => {
    // AccountBoot hands the page's client over before it first asks.
    const client = queryClient;
    if (!client) return;
    // What this browser last saw, while /api/me answers (after the first
    // render, so the server's page and the browser's agree).
    if (get().status === "loading") {
      // Both or neither: a status without the flags that went with it
      // can't say whether Reviews is on.
      const known = rememberedFlags();
      set(
        known
          ? { flags: known, lastKnown: rememberedStatus() }
          : { lastKnown: null },
      );
    }
    const { failed, stop } = nextFailure(client);
    // Always asks: a load means something says the account changed.
    const answered = client.query({ ...meQuery(), staleTime: 0 }).then(
      () => {},
      () => {},
    );
    await Promise.race([answered, failed]);
    stop();
  },

  signOut: async (options) => {
    const removeLocal = options?.removeLocal ?? false;
    const userId = get().user?.id ?? null;
    // Removing needs the sync steps first; a plain sign-out doesn't wait on
    // loading them (or fail when that fails offline).
    const hooks = removeLocal ? await signOutHooks() : null;
    await hooks?.beforeSignOut({ removeLocal, userId });
    const endpoint = await pushEndpoint();
    await accountClient().auth.signOut({
      removeLocal,
      ...(endpoint ? { pushEndpoint: endpoint } : {}),
    });
    try {
      // The next engine start forgets this account's sync state even if
      // the step below never runs.
      localStorage.setItem(SYNC_RESET_KEY, "1");
    } catch {
      // Storage blocked: afterSignOut clears it directly.
    }
    forgetWho();
    const after = hooks ?? (await signOutHooks().catch(() => null));
    await after?.afterSignOut({ removeLocal }).catch(console.error);
  },

  deleteAccount: async () => {
    const result = await accountClient().account.delete();
    set({ deleteAfter: result.deleteAfter });
    forgetWho();
    return result.deleteAfter;
  },
}));
