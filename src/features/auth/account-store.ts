import { create } from "zustand";
import { type Flags, FlagsSchema, type MeUser } from "~/core/schema";
import { SYNC_RESET_KEY } from "~/features/sync/status";
import { api } from "~/server/fns/api";

// Who's signed in, as the app sees it (docs/AUTH.md). Loaded once per page
// from POST /api/me; every account control reads it. Nothing is stored in
// the browser about who you are: the session is an HttpOnly cookie. Only
// the product flags are remembered (`FLAGS_KEY`), so a failed check
// doesn't hide products.

export type AccountStatus = "loading" | "signed-out" | "signed-in";

export interface AccountState {
  status: AccountStatus;
  /** Off until /api/me answers, so nothing flashes where sign-in is off. */
  flags: Flags;
  user: MeUser | null;
  /** The key to subscribe to web push with, while push works here. */
  pushPublicKey: string | null;
  /** When this browser's just-deleted account goes (for the settings page). */
  deleteAfter: string | null;

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

export type AccountClient = Pick<typeof api, "me" | "auth" | "account">;

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

function rememberFlags(flags: Flags): void {
  try {
    localStorage.setItem(FLAGS_KEY, JSON.stringify(flags));
  } catch {
    // Storage blocked: the next page asks /api/me again, as it always does.
  }
}

/** How long to wait before asking /api/me again after each failure. */
export const ME_RETRY_MS: readonly number[] = [2_000, 8_000, 30_000];

let client: AccountClient = api;

/** Test hook: a fake API client. */
export function setAccountClient(next: AccountClient): void {
  client = next;
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

let retryTimer: ReturnType<typeof setTimeout> | undefined;
let failures = 0;
// A retry keeps counting; any other ask (a new page, a sign-in) starts over.
let retrying = false;

export const useAccount = create<AccountState>()((set, get) => ({
  status: "loading",
  flags: FLAGS_OFF,
  user: null,
  pushPublicKey: null,
  deleteAfter: null,

  load: async () => {
    clearTimeout(retryTimer);
    if (!retrying) failures = 0;
    retrying = false;
    // What this browser last saw, while /api/me answers (after the first
    // render, so the server's page and the browser's agree).
    const known = rememberedFlags();
    if (known && get().status === "loading") set({ flags: known });
    try {
      const result = await client.me();
      failures = 0;
      rememberFlags(result.flags);
      set(
        result.status === "signed-in"
          ? {
              status: "signed-in",
              flags: result.flags,
              user: result.user,
              pushPublicKey: result.pushPublicKey,
            }
          : {
              status: "signed-out",
              flags: result.flags,
              user: null,
              pushPublicKey: null,
            },
      );
    } catch {
      // Offline, a busy server, or an older Worker without /api/me. Someone
      // already known stays as they were; otherwise it's signed out with
      // the products last seen here (everything off on a first visit: the
      // scheduler never needs an account). Then ask again, a few times.
      if (get().status === "loading")
        set({
          status: "signed-out",
          flags: known ?? FLAGS_OFF,
          user: null,
          pushPublicKey: null,
        });
      const wait = ME_RETRY_MS[failures++];
      if (wait !== undefined)
        retryTimer = setTimeout(() => {
          retrying = true;
          void get().load();
        }, wait);
    }
  },

  signOut: async (options) => {
    const removeLocal = options?.removeLocal ?? false;
    const userId = get().user?.id ?? null;
    // Removing needs the sync steps first; a plain sign-out doesn't wait on
    // loading them (or fail when that fails offline).
    const hooks = removeLocal ? await signOutHooks() : null;
    await hooks?.beforeSignOut({ removeLocal, userId });
    const endpoint = await pushEndpoint();
    await client.auth.signOut({
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
    set({ status: "signed-out", user: null, pushPublicKey: null });
    const after = hooks ?? (await signOutHooks().catch(() => null));
    await after?.afterSignOut({ removeLocal }).catch(console.error);
  },

  deleteAccount: async () => {
    const result = await client.account.delete();
    set({
      status: "signed-out",
      user: null,
      pushPublicKey: null,
      deleteAfter: result.deleteAfter,
    });
    return result.deleteAfter;
  },
}));
