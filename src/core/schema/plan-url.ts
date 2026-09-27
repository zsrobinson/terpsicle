import { z } from "zod";
// Only primitives: the route tree carries this schema to every page.
import {
  CourseCodeSchema,
  GenEdCodeSchema,
  LocalIdSchema,
  TermIdSchema,
} from "./primitives";

// Terpsicle Plan's search params (`/plan?…`, docs/V3.md §1.1): the side
// panel's tab, the semester picked, and what's open in the panel, so Back,
// reload and a copied link land on the same view. A bad value is dropped,
// never an error. The router reads a numeric `?semester=` as a number, so each
// param takes text, numbers and booleans back as text.

const Text = z.union([z.string(), z.number(), z.boolean()]).transform(String);

function param<T extends z.ZodType<unknown, string>>(schema: T) {
  return Text.pipe(schema).optional().catch(undefined);
}

/** The side panel's tabs. Templates joins with its PR (V3 §11). */
export const PlanTabSchema = z.enum(["gened", "problems", "search", "import"]);
export type PlanTab = z.infer<typeof PlanTabSchema>;

export const PlanSearchSchema = z.object({
  /** The side panel's tab; GenEd when absent. */
  tab: param(PlanTabSchema),
  /** The semester picked: where "Add" puts a course, and the phone's page. */
  semester: param(z.union([TermIdSchema, z.literal("before")])),
  /** A course open in the side panel. */
  course: param(CourseCodeSchema),
  /** Search narrowed to the courses that can replace this placeholder block. */
  wildcard: param(LocalIdSchema),
  /** Search narrowed to one GenEd ("Find a course"). */
  gened: param(GenEdCodeSchema),
  /** What's typed in Search; written with `replace` as you type. */
  q: param(z.string().max(100)),
});
export type PlanSearch = z.infer<typeof PlanSearchSchema>;
