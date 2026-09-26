import { z } from "zod";
import { BlockLabelSchema, CourseColorSchema, PlanNameSchema } from "./local";
import {
  CourseCodeSchema,
  DaysSchema,
  ENDS_AFTER_START,
  endsAfterStart,
  MinutesSchema,
  parseSectionKey,
  SectionKeySchema,
  TermIdSchema,
} from "./primitives";
import { SHARE_PAYLOAD_VERSION } from "./versions";

// The JSON inside a share link: `/schedule?plan=<base64url(deflate-raw(JSON))>`. Codec lives in core/share.

export const SharedBlockSchema = z
  .object({
    label: BlockLabelSchema,
    days: DaysSchema.min(1),
    start: MinutesSchema,
    end: MinutesSchema,
  })
  .refine(endsAfterStart, ENDS_AFTER_START);
export type SharedBlock = z.infer<typeof SharedBlockSchema>;

function oneSectionPerCourse(p: {
  sections: readonly string[];
  saved?: readonly string[] | undefined;
}): boolean {
  const courses = p.sections.map((k) => parseSectionKey(k)?.courseCode ?? k);
  const all = [...courses, ...(p.saved ?? [])];
  return new Set(all).size === all.length;
}

/**
 * Only what's needed to rebuild the plan: no ids, snapshots or timestamps.
 * Opening a link reads it read-only; "Save a copy" makes a new plan in `termId`
 * with fresh snapshots from the current catalog.
 */
export const SharePayloadSchema = z
  .object({
    v: z.literal(SHARE_PAYLOAD_VERSION),
    termId: TermIdSchema,
    name: PlanNameSchema.optional(),
    /** Placed sections, in the plan's course order. */
    sections: z.array(SectionKeySchema).max(40),
    /** Saved-for-later courses. */
    saved: z.array(CourseCodeSchema).max(40).optional(),
    /** The sharer's blocks, shown in the shared view only; "Save a copy" doesn't import them. */
    blocks: z.array(SharedBlockSchema).max(40).optional(),
    /** The sharer's colors for these courses, used in the shared view only (colors are the viewer's own prefs). */
    colors: z.record(CourseCodeSchema, CourseColorSchema).optional(),
  })
  .refine(oneSectionPerCourse, {
    message: "A course appears twice",
    path: ["sections"],
  });
export type SharePayload = z.infer<typeof SharePayloadSchema>;
