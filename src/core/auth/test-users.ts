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

export function findTestUser(id: string): TestUser | undefined {
  return TEST_USERS.find((u) => u.identity.directoryId === id);
}
