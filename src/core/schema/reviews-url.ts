import { z } from "zod";
import { searchParam } from "./schedule-url";

// Terpsicle Reviews' search params. As with the scheduler's, a bad value is
// dropped, never an error, and text the router reads as a number (`?q=351`)
// comes back as text.

/** `/reviews?q=`: the search's text (a department's code browses it). */
export const ReviewsHomeSearchSchema = z.object({
  q: searchParam(z.string().max(200)),
});
export type ReviewsHomeSearch = z.infer<typeof ReviewsHomeSearchSchema>;

/**
 * `/reviews/$slug`, an instructor's or a course's page:
 * - `course`: an instructor's page narrowed to one course. Checked as a
 *   course code by the loader, which ignores anything else.
 * - `write`: opens the review form, "1" on an instructor's page, or who
 *   taught you on a course's ("Review your instructors" links here).
 */
export const ReviewsPageSearchSchema = z.object({
  course: searchParam(z.string().max(12)),
  write: searchParam(z.string().max(120)),
});
export type ReviewsPageSearch = z.infer<typeof ReviewsPageSearchSchema>;
