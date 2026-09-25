import { z } from "zod";
import { GenItemSchema, MustHavesSchema, RankBySchema } from "./generate";
import { UiPrefsSchema } from "./local";
import { TermIdSchema } from "./primitives";
import { TravelSettingsSchema } from "./travel";

// Rows of the `settings` table (DATA.md §5), one per key.

/**
 * What the person has typed into Generate, so leaving the tab (or the app)
 * doesn't lose it. Results aren't kept: they're cheap to recompute and the
 * catalog may have moved on.
 */
export const GenerateDraftSchema = z.object({
  items: z.array(GenItemSchema),
  mustHaves: MustHavesSchema,
  rankBy: RankBySchema,
});
export type GenerateDraft = z.infer<typeof GenerateDraftSchema>;

/** One draft per term: each term has its own courses. */
export const GenerateDraftsSchema = z.record(TermIdSchema, GenerateDraftSchema);
export type GenerateDrafts = z.infer<typeof GenerateDraftsSchema>;

export const SettingsRowSchema = z.discriminatedUnion("key", [
  z.object({ key: z.literal("ui"), value: UiPrefsSchema }),
  z.object({ key: z.literal("travel"), value: TravelSettingsSchema }),
  z.object({ key: z.literal("generate"), value: GenerateDraftsSchema }),
]);
export type SettingsRow = z.infer<typeof SettingsRowSchema>;
