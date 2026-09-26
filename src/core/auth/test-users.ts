import type { Identity } from "../schema";

/**
 * The people test mode signs in as (V2.md §4.6): on PR previews, `pnpm
 * dev:mock` and e2e, never on terpsicle.com. Here rather than in
 * src/fixtures because the Worker serves them; `~/fixtures` re-exports them
 * as `TEST_USERS` for tests.
 */
export interface TestUser {
  identity: Identity;
  /** Test mode's admin, in place of config/admins.txt. */
  isAdmin: boolean;
}

const testUser = (
  directoryId: string,
  name: string,
  isAdmin = false,
): TestUser => ({
  identity: {
    directoryId,
    email: `${directoryId}@terpmail.umd.edu`,
    hd: "terpmail.umd.edu",
    name,
    pictureUrl: null,
    sub: null,
  },
  isAdmin,
});

export const TEST_USERS: readonly TestUser[] = [
  testUser("tstudent", "Test Student"),
  testUser("tclassmate", "Test Classmate"),
  testUser("tadmin", "Test Admin", true),
];

/**
 * Throwaway people for end-to-end tests (`e2e` and up to 13 more letters or
 * digits), so parallel tests never share an account's synced plans. Test mode
 * only, like the rest; `/auth/test` doesn't list them.
 */
export const E2E_USER_PATTERN = /^e2e[a-z0-9]{1,13}$/;

export function findTestUser(id: string): TestUser | undefined {
  const listed = TEST_USERS.find((u) => u.identity.directoryId === id);
  if (listed) return listed;
  return E2E_USER_PATTERN.test(id) ? testUser(id, "E2E Tester") : undefined;
}
