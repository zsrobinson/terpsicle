import { z } from "zod";
import {
  ContentHashSchema,
  DeptCodeSchema,
  IsoDateTimeSchema,
} from "./primitives";
import { InstructorIdSchema } from "./reviews";
import { SCHEMA_VERSIONS } from "./versions";

// Terpsicle reviews' published numbers (R2 family `reviews/`, docs/V2.md
// §7.6, DATA.md §4.6): per department, each instructor's rating and count
// from published Terpsicle reviews, so course details can combine them with
// PlanetTerp's. Review text is never here: hashed files are immutable for a
// year, and taking a review down must be instant. Text comes only from
// reviews/list.

const reviewsVersion = z.literal(SCHEMA_VERSIONS.reviews);

/** `YYYY-MM`, America/New_York: the month readers see (V2 §7.5). */
export const ReviewMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Expected a month like 2026-10");

export const TerpsicleRatingSchema = z.object({
  /** Mean of the published ratings, 1–5, to two decimals. */
  rating: z.number().min(1).max(5),
  reviewCount: z.number().int().min(1),
  /**
   * The month of the newest published review. A month, not a time: an exact
   * time would undo the rounding readers see (V2 §7.5).
   */
  latestReviewMonth: ReviewMonthSchema,
});
export type TerpsicleRating = z.infer<typeof TerpsicleRatingSchema>;

/**
 * `reviews/dept/<DEPT>.<hash>.json`. An instructor is listed in every
 * department they have a published review in (or a name in `names`), each
 * time with their numbers across all courses, as PlanetTerp's files do.
 * Keys are sorted; no timestamps (DATA.md §2.2).
 */
export const ReviewsDeptSchema = z.object({
  schemaVersion: reviewsVersion,
  dept: DeptCodeSchema,
  /** Instructor id (a PlanetTerp slug, or a minted `t~` id) → numbers. */
  instructors: z.record(InstructorIdSchema, TerpsicleRatingSchema),
  /**
   * `instructorNameKey(testudoName)` → instructor id, for names PlanetTerp's
   * join doesn't cover: minted instructors with published reviews, and the
   * owner's corrections (`manual`). A minted id yields to PlanetTerp's own
   * join; a PlanetTerp slug here is the owner's fix and beats it.
   */
  names: z.record(z.string().min(1), InstructorIdSchema),
});
export type ReviewsDept = z.infer<typeof ReviewsDeptSchema>;

/** `reviews/manifest.json`, no-cache. */
export const ReviewsManifestSchema = z.object({
  schemaVersion: reviewsVersion,
  /** When the published numbers last changed. */
  generatedAt: IsoDateTimeSchema,
  /** Sorted by code; only departments with something in them. */
  departments: z.array(
    z.object({ code: DeptCodeSchema, hash: ContentHashSchema }),
  ),
});
export type ReviewsManifest = z.infer<typeof ReviewsManifestSchema>;
