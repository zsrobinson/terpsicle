import { z } from "zod";
import { GenEdCodeSchema } from "./primitives";

// Wildcards: "any course from this set" (the Generate tab now, the four-year
// planner next). Matching and words are in src/core/catalog/wildcard.ts.

/**
 * A department and a course number with its last one, two or three digits
 * as X: "CMSC4XX" (any CMSC 400-level), "CMSC42X", "ARTTXXX" (any ARTT).
 * X only fills the end, so "CMSC4X1" isn't one, and all three places are
 * needed, so neither is "CMSC4X".
 */
export const WildcardPatternSchema = z
  .string()
  .regex(
    /^[A-Z]{4}(?:\d\dX|\dXX|XXX)$/,
    "Expected a pattern like CMSC4XX or ARTTXXX",
  );
export type WildcardPattern = z.infer<typeof WildcardPatternSchema>;

/** The stored form: a course-number pattern, or any course with a gen-ed. */
export const WildcardSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pattern"), pattern: WildcardPatternSchema }),
  z.object({ kind: z.literal("gen-ed"), code: GenEdCodeSchema }),
]);
export type Wildcard = z.infer<typeof WildcardSchema>;

/**
 * A wildcard's stable id: its pattern ("CMSC4XX"), or "gen-ed:DSHS". Never
 * a course code (those have three digits), so the two can share a list.
 */
export const WildcardIdSchema = z
  .string()
  .regex(
    /^(?:[A-Z]{4}(?:\d\dX|\dXX|XXX)|gen-ed:[A-Z]{4})$/,
    "Expected a wildcard id like CMSC4XX or gen-ed:DSHS",
  );
export type WildcardId = z.infer<typeof WildcardIdSchema>;
