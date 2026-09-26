import { create } from "zustand";
import type { Flags, MeUser } from "~/core/schema";
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
  /** When this browser's just-deleted account goes (for the settings page). */
  deleteAfter: string | null;

  load: () => Promise<void>;
  signOut: () => Promise<void>;
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
  authTestMode: false,
};

let client: AccountClient = api;

/** Test hook: a fake API client. */
export function setAccountClient(next: AccountClient): void {
  client = next;
}

export const useAccount = create<AccountState>()((set) => ({
  status: "loading",
  flags: FLAGS_OFF,
  user: null,
  deleteAfter: null,

  load: async () => {
    try {
      const result = await client.me();
      set(
        result.status === "signed-in"
          ? { status: "signed-in", flags: result.flags, user: result.user }
          : { status: "signed-out", flags: result.flags, user: null },
      );
    } catch {
      // Offline, or an older Worker without /api/me: behave as signed out
      // with sign-in hidden. The scheduler never needs an account.
      set({ status: "signed-out", flags: FLAGS_OFF, user: null });
    }
  },

  signOut: async () => {
    await client.auth.signOut({ removeLocal: false });
    set({ status: "signed-out", user: null });
  },

  deleteAccount: async () => {
    const result = await client.account.delete();
    set({ status: "signed-out", user: null, deleteAfter: result.deleteAfter });
    return result.deleteAfter;
  },
}));
