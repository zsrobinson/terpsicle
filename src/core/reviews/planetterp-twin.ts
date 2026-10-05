import {
  type InstructorId,
  PLANETTERP_HOME,
  planetTerpCourseUrl,
  planetTerpUrl,
} from "../schema";
import {
  courseFromSlug,
  instructorIdCandidates,
  resolveInstructorSlug,
} from "./slugs";

// Where one of our Reviews addresses goes while our pages are off
// (docs/decisions.md, "Reviews link out to PlanetTerp"): its twin on
// PlanetTerp. /reviews/kruskal → /professor/kruskal, /reviews/cmsc351 →
// /course/CMSC351, the old /reviews/instructors/… and /reviews/courses/…
// addresses the same way, a history page (someone PlanetTerp doesn't know,
// `?course=CMSC351`) to its course, and the rest to PlanetTerp's front page.
// /reviews/mine stays ours: an author can still see and delete theirs.

/** Our own Reviews pages that keep rendering while the others go. */
const KEPT = new Set(["/reviews/mine"]);

/**
 * The PlanetTerp address for a path of ours, or null when it isn't a
 * Reviews page or stays ours. `known` says whether PlanetTerp's index has an
 * instructor id; null when the index can't be read, so an address's likeliest
 * reading stands.
 */
export function planetTerpTwin(
  pathname: string,
  search: URLSearchParams,
  known: ((id: InstructorId) => boolean) | null,
): string | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path !== "/reviews" && !path.startsWith("/reviews/")) return null;
  if (KEPT.has(path)) return null;
  const parts = path.split("/").slice(2).map(decode);
  const [first, second] = parts;
  if (first === undefined || first === null) return PLANETTERP_HOME;
  if (parts.length === 2 && first === "courses" && second) {
    const code = courseFromSlug(second);
    return code ? planetTerpCourseUrl(code) : PLANETTERP_HOME;
  }
  if (parts.length === 2 && first === "instructors" && second)
    return instructorTwin(second, search, known);
  // What our reviews may say (/reviews/policy) has no twin.
  if (parts.length !== 1 || first === "policy") return PLANETTERP_HOME;
  const code = courseFromSlug(first);
  if (code) return planetTerpCourseUrl(code);
  return instructorTwin(first, search, known);
}

function instructorTwin(
  slug: string,
  search: URLSearchParams,
  known: ((id: InstructorId) => boolean) | null,
): string {
  const lower = slug.toLowerCase();
  const id = known
    ? resolveInstructorSlug(lower, known)
    : (instructorIdCandidates(lower)[0] ?? null);
  if (id) return planetTerpUrl(id);
  // Someone PlanetTerp doesn't know (a history page, a minted id): the
  // course the address was opened from, when it names one.
  const course = courseFromSlug(search.get("course") ?? "");
  return course ? planetTerpCourseUrl(course) : PLANETTERP_HOME;
}

function decode(part: string): string | null {
  try {
    return decodeURIComponent(part);
  } catch {
    return null;
  }
}
