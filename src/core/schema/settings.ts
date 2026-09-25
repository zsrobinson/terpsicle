import { z } from "zod";
import {
  GenCourseSchema,
  GenItemSchema,
  MustHavesSchema,
  RankBySchema,
} from "./generate";
import { UiPrefsSchema } from "./local";
import { TermIdSchema } from "./primitives";
import { TravelSettingsSchema } from "./travel";

// Rows of the `settings` table (DATA.md §5), one per key.

/**
 * A Generate form item: a `GenItem`, except that a "pick N" group may be
 * half-built (fewer than two courses, or N above the count) while the person
 * is still filling it in. The form turns it into a valid item on each run.
 */
export const GenerateDraftItemSchema = z.union([
  GenItemSchema,
  z.object({
    kind: z.literal("pick"),
    id: z.string().min(1),
    count: z.number().int().min(1),
    courses: z.array(GenCourseSchema),
  }),
]);
export type GenerateDraftItem = z.infer<typeof GenerateDraftItemSchema>;

/**
 * What the person has typed into Generate, so leaving the tab (or the app)
 * doesn't lose it. Results aren't kept: they're cheap to recompute and the
 * catalog may have moved on.
 */
export const GenerateDraftSchema = z.object({
  items: z.array(GenerateDraftItemSchema),
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
