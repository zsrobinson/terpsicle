import { describe, expect, it } from "vitest";
import { SignInErrorSchema } from "../schema";
import { parseAdmins } from "./admins";
import { signInErrorMessage } from "./messages";
import {
  DELETION_GRACE_MS,
  deleteAfter,
  REPLACED_GRACE_MS,
  replacedExpiresAt,
  SESSION_REFRESH_AFTER_MS,
  SESSION_TTL_MS,
  sessionExpiresAt,
  sessionState,
} from "./session";
import { findTestUser, TEST_USERS } from "./test-users";

const T0 = new Date("2026-10-01T12:00:00.000Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

describe("sessionState", () => {
  const fresh = { lastSeenAt: T0, expiresAt: sessionExpiresAt(T0) };

  it("is valid until a day has passed since it was last refreshed", () => {
    expect(sessionExpiresAt(T0)).toEqual(at(SESSION_TTL_MS));
    expect(sessionState(fresh, T0)).toBe("valid");
    expect(sessionState(fresh, at(SESSION_REFRESH_AFTER_MS - 1))).toBe("valid");
    expect(sessionState(fresh, at(SESSION_REFRESH_AFTER_MS))).toBe("refresh");
  });

  it("expires at expiresAt exactly", () => {
    expect(sessionState(fresh, at(SESSION_TTL_MS - 1))).toBe("refresh");
    expect(sessionState(fresh, at(SESSION_TTL_MS))).toBe("expired");
  });

  it("gives a replaced token a minute, never more than it had", () => {
    const now = at(SESSION_REFRESH_AFTER_MS);
    const replaced = replacedExpiresAt(fresh.expiresAt, now);
    expect(replaced).toEqual(at(SESSION_REFRESH_AFTER_MS + REPLACED_GRACE_MS));
    expect(sessionState({ lastSeenAt: now, expiresAt: replaced }, now)).toBe(
      "valid",
    );
    const almostGone = at(SESSION_TTL_MS - 1000);
    expect(replacedExpiresAt(fresh.expiresAt, almostGone)).toEqual(
      fresh.expiresAt,
    );
  });
});

describe("deleteAfter", () => {
  it("gives a week's grace", () => {
    expect(deleteAfter(T0)).toEqual(at(DELETION_GRACE_MS));
    expect(DELETION_GRACE_MS).toBe(7 * 24 * 3600 * 1000);
  });
});

describe("parseAdmins", () => {
  it("reads one directory ID per line, with blanks and # comments", () => {
    const ids = parseAdmins(
      "# Terpsicle's admins\n\n  Robinson  \nterp2 # the second\r\n",
    );
    expect([...ids]).toEqual(["robinson", "terp2"]);
  });

  it("throws on a line that isn't a directory ID, naming it", () => {
    expect(() => parseAdmins("ok1\nrobinson@umd.edu\n")).toThrow(
      'config/admins.txt line 2: "robinson@umd.edu" isn\'t a directory ID',
    );
    expect(() => parseAdmins("x")).toThrow(/line 1/);
  });

  it("is empty for an empty file", () => {
    expect(parseAdmins("\n# nobody yet\n").size).toBe(0);
  });
});

describe("TEST_USERS", () => {
  it("are the three V2.md §4.6 fixtures, with tadmin the admin", () => {
    expect(TEST_USERS.map((u) => u.identity.directoryId)).toEqual([
      "tstudent",
      "tclassmate",
      "tadmin",
    ]);
    expect(
      TEST_USERS.filter((u) => u.isAdmin).map((u) => u.identity.name),
    ).toEqual(["Test Admin"]);
    expect(findTestUser("tstudent")?.identity.email).toBe(
      "tstudent@terpmail.umd.edu",
    );
    expect(findTestUser("robinson")).toBeUndefined();
  });

  it("makes throwaway e2e people, never admins, and nobody else", () => {
    expect(findTestUser("e2eab12cd")).toEqual({
      identity: expect.objectContaining({
        directoryId: "e2eab12cd",
        email: "e2eab12cd@terpmail.umd.edu",
      }),
      isAdmin: false,
    });
    expect(findTestUser("e2e")).toBeUndefined();
    expect(findTestUser("e2eUPPER")).toBeUndefined();
    expect(findTestUser("xe2eab")).toBeUndefined();
  });
});

describe("signInErrorMessage", () => {
  it("has specific words for every reason", () => {
    for (const reason of SignInErrorSchema.options) {
      expect(signInErrorMessage(reason)).toMatch(/\.$/);
    }
    expect(signInErrorMessage("personal-account")).toBe(
      "That's a personal Google account. Choose your @terpmail.umd.edu or @umd.edu account.",
    );
  });
});
