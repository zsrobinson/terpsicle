import { z } from "zod";
import { searchParam } from "./schedule-url";

// Terpsicle Reviews' search params. As with the scheduler's, a bad value is
// dropped, never an error, and text the router reads as a number (`?q=351`)
// comes back as text.

/** `/reviews?q=`: the course search's text (a department's code browses it). */
export const ReviewsHomeSearchSchema = z.object({
  q: searchParam(z.string().max(200)),
});
export type ReviewsHomeSearch = z.infer<typeof ReviewsHomeSearchSchema>;

/**
 * `/reviews/instructors/$id?course=`: one course's view. Checked as a course
 * code by the loader, which ignores anything else.
 */
export const InstructorSearchSchema = z.object({
  course: searchParam(z.string().max(12)),
});
export type InstructorSearch = z.infer<typeof InstructorSearchSchema>;
