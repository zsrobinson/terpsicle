import type { CourseCode, SyncedPrefs } from "../schema";

// The other products' synced prefs (`SyncedPrefs`, docs/V2.md §5.1), read and
// changed. Each change returns the same object when nothing changed, so a
// save that changes nothing writes nothing.

/**
 * The browser's localStorage copy of the `prefs` settings row, which every
 * page reads (~/features/prefs/synced-prefs).
 */
export const PREFS_STORAGE_KEY = "terpsicle:prefs";

/**
 * The most courses whose room rules are remembered: a few years of courses.
 * Past it, the oldest go, and their rules would show once more.
 */
export const CHAT_RULES_SEEN_MAX = 200;

/** Whether you've closed `courseCode`'s room rules with "Got it". */
export function chatRulesSeen(
  prefs: SyncedPrefs,
  courseCode: CourseCode,
): boolean {
  return prefs.chatRules?.seen.includes(courseCode) ?? false;
}

/** The prefs with these courses' room rules seen, newest last. */
export function withChatRulesSeen(
  prefs: SyncedPrefs,
  courseCodes: readonly CourseCode[],
): SyncedPrefs {
  const seen = prefs.chatRules?.seen ?? [];
  const added = [...new Set(courseCodes)].filter((c) => !seen.includes(c));
  if (added.length === 0) return prefs;
  return {
    ...prefs,
    chatRules: { seen: [...seen, ...added].slice(-CHAT_RULES_SEEN_MAX) },
  };
}
