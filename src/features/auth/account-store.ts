import { create } from "zustand";
import type { Flags, MeUser } from "~/core/schema";
import { SYNC_RESET_KEY } from "~/features/sync/status";
import { api } from "~/server/fns/api";

// Who's signed in, as the app sees it (docs/AUTH.md). Loaded once per page
// from POST /api/me; every account control reads it. Nothing is stored in
// the browser: the session is an HttpOnly cookie.

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
  authTestMode: false,
};

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

export const useAccount = create<AccountState>()((set, get) => ({
  status: "loading",
  flags: FLAGS_OFF,
  user: null,
  pushPublicKey: null,
  deleteAfter: null,

  load: async () => {
    try {
      const result = await client.me();
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
      // Offline, or an older Worker without /api/me: behave as signed out
      // with sign-in hidden. The scheduler never needs an account.
      set({
        status: "signed-out",
        flags: FLAGS_OFF,
        user: null,
        pushPublicKey: null,
      });
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
