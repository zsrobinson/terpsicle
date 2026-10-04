import { z } from "zod";
import { CourseCodeSchema } from "./primitives";

// Prefs that follow the person and belong to products other than Schedule
// (docs/V2.md §5.1): the settings doc's `prefs`, and the `prefs` settings row
// on the device. Local while signed out, the account's once signed in. Each
// product owns its own key; sync carries every key whole, known or not.

/** Courses whose chat room rules you've closed with "Got it". */
export const ChatRulesPrefsSchema = z.object({
  seen: z.array(CourseCodeSchema),
});
export type ChatRulesPrefs = z.infer<typeof ChatRulesPrefsSchema>;

/**
 * Home's setup callouts you've closed (`CalloutId`s in ~/core/home). Plain
 * strings, so a callout a newer build adds survives an older one.
 */
export const HomePrefsSchema = z.object({
  dismissed: z.array(z.string().min(1).max(40)).max(20),
});
export type HomePrefs = z.infer<typeof HomePrefsSchema>;

/**
 * Loose on purpose: a key this build doesn't know (a newer build's, another
 * product's) passes through untouched, so no build drops what it can't read.
 * That includes `todo`, where Todo's "Weeks start on" was kept until its
 * weeks became Monday's alone (docs/decisions.md, "Todo is one week"): an
 * account that has it still reads, and it's never read back. The same goes
 * for `ai`, Settings' "Show AI summaries" until Reviews dropped its AI
 * features.
 */
export const SyncedPrefsSchema = z.looseObject({
  chatRules: ChatRulesPrefsSchema.optional(),
  home: HomePrefsSchema.optional(),
});
export type SyncedPrefs = z.infer<typeof SyncedPrefsSchema>;
