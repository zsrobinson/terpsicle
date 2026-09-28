import {
  type ContentHash,
  type DeptCode,
  type InstructorId,
  instructorNameKey,
  type PlanetTerpDept,
  REVIEWS_MANIFEST_KEY,
  type ReviewsDept,
  ReviewsDeptSchema,
  ReviewsManifestSchema,
  reviewsDeptKey,
  type TerpsicleRating,
} from "~/core/schema";
import type { DataSource } from "../data-source";
import { publishedFile, publishedPointer } from "./published";

// Terpsicle reviews' numbers (R2 family `reviews/`, V2 §7.6, DATA.md §5.4),
// for course details: the manifest, then a department's file by its hash.
// A saved manifest is checked once per page; the hourly job is the most
// often they change, so after that it's fresh for an hour. Read them with `useTerpsicleReviews` (~/state/data-hooks).

/** How long the reviews manifest counts as current: the job runs hourly. */
export const REVIEWS_MANIFEST_STALE_MS = 60 * 60 * 1000;

/** `reviews/manifest.json`: which departments have numbers, by hash. */
export function reviewsManifestQuery(source: DataSource | null) {
  return publishedPointer(
    source,
    REVIEWS_MANIFEST_KEY,
    ReviewsManifestSchema,
    "reviews",
    {
      staleTime: REVIEWS_MANIFEST_STALE_MS,
      lists: (manifest) =>
        manifest.departments.map((d) => reviewsDeptKey(d.code, d.hash)),
      fileSchema: () => ReviewsDeptSchema,
    },
  );
}

/** One department's numbers, at the hash its manifest lists (none: nothing to read). */
export function reviewsDeptQuery(
  source: DataSource | null,
  entry: { code: DeptCode; hash: ContentHash } | undefined,
) {
  return publishedFile(
    entry ? source : null,
    entry ? reviewsDeptKey(entry.code, entry.hash) : "reviews/dept/none",
    ReviewsDeptSchema,
    "reviews",
  );
}

/**
 * The instructor a Testudo name means, and their Terpsicle numbers. A name
 * here that points at a PlanetTerp slug is the owner's fix and wins; a
 * minted instructor's name yields to PlanetTerp's own join.
 */
export function terpsicleInstructor(
  reviews: ReviewsDept | null,
  planetTerp: PlanetTerpDept | null,
  name: string,
): { id: InstructorId; numbers: TerpsicleRating | null } | null {
  const key = instructorNameKey(name);
  const ours = reviews?.names[key];
  const theirs = planetTerp?.names[key];
  const id =
    ours && (!ours.startsWith("t~") || !theirs) ? ours : (theirs ?? ours);
  if (!id) return null;
  return { id, numbers: reviews?.instructors[id] ?? null };
}
