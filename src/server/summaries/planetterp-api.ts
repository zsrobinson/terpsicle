// Reviews live from PlanetTerp: the fallback when the PlanetTerp job's
// private copy (`_jobs/planetterp/reviews/`, DATA.md §2.6) is missing or
// behind the instructor's review count.
import { z } from "zod";
import type { PromptReview } from "./prompt";

const PLANETTERP = "https://planetterp.com/api/v1";
const USER_AGENT = "Terpsicle/2 (+https://terpsicle.com)";

// PlanetTerp's shape (RESEARCH.md §5.5), tolerant of junk in free-text fields.
const ProfessorWithReviewsSchema = z.object({
  name: z.string(),
  slug: z.string(),
  reviews: z
    .array(
      z.object({
        course: z.string().nullable().catch(null),
        review: z.string().catch(""),
        rating: z.number().int().min(1).max(5).catch(3),
        created: z.string(),
      }),
    )
    .catch([]),
});

export interface PlanetTerpProfessor {
  name: string;
  slug: string;
  reviews: PromptReview[];
}

/**
 * The professor with this name and their reviews, or null when PlanetTerp
 * doesn't know the name. Throws on network or server errors.
 */
export async function fetchPlanetTerpReviews(
  fetcher: typeof fetch,
  name: string,
): Promise<PlanetTerpProfessor | null> {
  const url = `${PLANETTERP}/professor?name=${encodeURIComponent(name)}&reviews=true`;
  const response = await fetcher(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (response.status === 400 || response.status === 404) return null;
  if (!response.ok) throw new Error(`PlanetTerp answered ${response.status}`);
  const parsed = ProfessorWithReviewsSchema.safeParse(await response.json());
  if (!parsed.success)
    throw new Error("PlanetTerp's professor response changed shape");
  return {
    name: parsed.data.name,
    slug: parsed.data.slug,
    reviews: parsed.data.reviews.map((r) => ({
      course: r.course,
      text: r.review,
      rating: r.rating,
      created: r.created,
    })),
  };
}
