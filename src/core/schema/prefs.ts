import { z } from "zod";
import { CourseCodeSchema } from "./primitives";

// Prefs that follow the person and belong to products other than Schedule
// (docs/V2.md §5.1): the settings doc's `prefs`, and the `prefs` settings row
// on the device. Local while signed out, the account's once signed in. Each
// product owns its own key; sync carries every key whole, known or not.

/** Settings → AI features → "Show AI summaries". Missing means on. */
export const AiPrefsSchema = z.object({ features: z.boolean() });
export type AiPrefs = z.infer<typeof AiPrefsSchema>;

/** Courses whose chat room rules you've closed with "Got it". */
export const ChatRulesPrefsSchema = z.object({
  seen: z.array(CourseCodeSchema),
});
export type ChatRulesPrefs = z.infer<typeof ChatRulesPrefsSchema>;

/**
 * Loose on purpose: a key this build doesn't know (a newer build's, another
 * product's) passes through untouched, so no build drops what it can't read.
 */
export const SyncedPrefsSchema = z.looseObject({
  ai: AiPrefsSchema.optional(),
  chatRules: ChatRulesPrefsSchema.optional(),
});
export type SyncedPrefs = z.infer<typeof SyncedPrefsSchema>;
