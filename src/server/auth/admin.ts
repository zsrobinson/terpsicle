// Who's an admin (V2.md §4.8): the directory IDs in config/admins.txt, a
// file tracked in git and bundled into the Worker. This is the only check.

import adminsText from "~/config/admins.txt?raw";
import { findTestUser, parseAdmins, TEST_USERS } from "~/core/auth";

/** The raw file, for the test that keeps it valid. */
export const ADMINS_FILE = adminsText;

// Parsed once per isolate; a bad line throws here, at startup.
const ADMINS = parseAdmins(adminsText);

/**
 * Whether `userId` is an admin. In test mode, and only there, the fixture
 * `tadmin` is one too (previews and e2e have no real people to list).
 */
export function isAdmin(
  userId: string,
  options: { authTestMode: boolean },
): boolean {
  return (
    ADMINS.has(userId) ||
    (options.authTestMode && findTestUser(userId)?.isAdmin === true)
  );
}

/**
 * Every admin, for the owner's alerts (V2 §6.7): config/admins.txt, and in
 * test mode the fixture admins too. Only those who have signed in have an
 * account to alert.
 */
export function adminIds(options: { authTestMode: boolean }): string[] {
  const ids = new Set<string>(ADMINS);
  if (options.authTestMode)
    for (const user of TEST_USERS)
      if (user.isAdmin) ids.add(user.identity.directoryId);
  return [...ids];
}
