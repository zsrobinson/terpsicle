import { queryOptions } from "@tanstack/react-query";
import type { Flags, MeResult } from "~/core/schema";
import { api } from "~/server/fns/api";

// Who's signed in, as the server last said (POST /api/me, docs/AUTH.md):
// one query, the only copy of the answer (docs/decisions.md, "TanStack
// Query for server data"). It isn't read with `useQuery`: the account store
// (./account-store) mirrors it for every account control, so `/` carries no
// query observer. Nothing about it is saved to disk; the store keeps its own
// boot hint (the flags and a signed-in yes or no) in localStorage.

/** The account API, or a test's stand-in. */
export type AccountClient = Pick<typeof api, "me" | "auth" | "account">;

let client: AccountClient = api;

/** Test hook: a fake API client. */
export function setAccountClient(next: AccountClient): void {
  client = next;
}

/** The account API, or a test's stand-in. */
export function accountClient(): AccountClient {
  return client;
}

/** The query's key. */
export const meKey = ["me"] as const;

/**
 * How long to wait before asking /api/me again after each failure: the
 * query's backoff. After the last, it stops until something asks again.
 */
export const ME_RETRY_MS: readonly number[] = [2_000, 8_000, 30_000];

/**
 * Every failure is worth asking again, unlike other `/api` reads
 * (`retryApi`): offline, a busy server, or an older Worker without
 * /api/me, and the page can't tell what to show until it answers.
 */
export function retryMe(failures: number): boolean {
  return failures < ME_RETRY_MS.length;
}

/** The answer for someone signed out, keeping `flags`. */
export function signedOutAnswer(flags: Flags): MeResult {
  return { status: "signed-out", flags };
}

/**
 * Who's signed in. Asked once per page, then again only when something
 * says the account changed (a sign-out, another tab, sync's 401), so it's
 * never stale on its own; it asks even offline, so a page that can't reach
 * the server falls back at once instead of waiting.
 */
export function meQuery() {
  return queryOptions({
    queryKey: meKey,
    queryFn: ({ signal }): Promise<MeResult> => client.me({ signal }),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: retryMe,
    retryDelay: (failures) => ME_RETRY_MS[failures] ?? 0,
    networkMode: "always",
  });
}
