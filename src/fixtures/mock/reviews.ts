// Mock Terpsicle reviews' numbers: what the reviews-publish job reads from
// D1 (published reviews' instructor, course, rating and time; the name rows),
// for invented instructors. No review text: the published files never carry
// it. `buildReviewsDepts` turns these into the mock bucket's `reviews/`.
import {
  mintedInstructorId,
  type PublishedReviewFact,
  type ReviewNameFact,
} from "~/core/reviews";
import { instructorNameKey } from "~/core/schema";
import { FIXTURE_NOW, fixtureTermId } from "../builders";
import { hashString, randomInt, seededRandom } from "../random";
import { mockCatalog } from "./catalog";
import { mockInstructorSlugs } from "./planetterp";

/** Instructors with Terpsicle reviews, and how many each has. */
const REVIEWED: Readonly<Record<string, number>> = {
  "Kemi Adeyemi": 13,
  "Rana Haddad": 4,
  "Jada Abernathy": 9,
  "Grace Kowalczyk": 2,
  "Keiko Ashdown": 6,
};

/** Unmatched names (no PlanetTerp slug) that get a minted id and reviews. */
const MINTED_COUNT = 2;

/** Every Testudo name teaching in the active term, with the courses they teach. */
function teaching(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const chunk of mockCatalog[fixtureTermId] ?? [])
    for (const course of chunk.courses)
      for (const section of course.sections)
        for (const name of section.instructors) {
          const list = out.get(name) ?? [];
          if (!list.includes(course.code)) list.push(course.code);
          out.set(name, list);
        }
  return out;
}

function mintedFor(name: string): string {
  const rand = seededRandom(`minted:${name}`);
  return mintedInstructorId(
    Uint8Array.from({ length: 7 }, () => randomInt(rand, 0, 255)),
  );
}

function build() {
  const courses = teaching();
  const reviews: PublishedReviewFact[] = [];
  const names: ReviewNameFact[] = [];
  const add = (name: string, id: string, count: number) => {
    const taught = courses.get(name) ?? [];
    const rand = seededRandom(`reviews:${name}`);
    for (let i = 0; i < count; i++) {
      const course = taught[i % taught.length];
      if (!course) return;
      // Terpsicle reviews start in fall 2026, after PlanetTerp's stopped.
      const daysBack = randomInt(rand, 1, 60);
      reviews.push({
        instructorId: id,
        course,
        rating: randomInt(rand, 2, 5),
        publishedAt: new Date(
          Date.parse(FIXTURE_NOW) - daysBack * 86_400_000,
        ).toISOString(),
      });
    }
  };
  for (const [name, count] of Object.entries(REVIEWED)) {
    const slug = mockInstructorSlugs.get(name);
    if (slug) add(name, slug, count);
  }
  const unmatched = [...courses.keys()]
    .filter((name) => !mockInstructorSlugs.has(name))
    .sort((a, b) => hashString(a) - hashString(b))
    .slice(0, MINTED_COUNT);
  for (const name of unmatched) {
    const id = mintedFor(name);
    add(name, id, 3);
    const course = courses.get(name)?.[0];
    if (course)
      names.push({
        nameKey: instructorNameKey(name),
        dept: course.slice(0, 4),
        instructorId: id,
        rule: "minted",
      });
  }
  return { reviews, names, minted: unmatched };
}

const built = build();

/** Published mock reviews, as the job reads them from D1 (no text). */
export const mockPublishedReviews: readonly PublishedReviewFact[] =
  built.reviews;
/** Mock `instructor_names` rows for minted instructors. */
export const mockReviewNames: readonly ReviewNameFact[] = built.names;
/** Testudo names PlanetTerp doesn't know that have Terpsicle reviews. */
export const mockMintedNames: readonly string[] = built.minted;
