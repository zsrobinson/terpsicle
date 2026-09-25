import {
  type Instructor,
  type InstructorSlug,
  instructorNameKey,
  type PlanetTerpDept,
} from "~/core/schema";

// The join from a Testudo instructor name to PlanetTerp. The department's
// file comes from `useInstructors(dept)` (~/state/data-hooks).

/** The PlanetTerp instructor a Testudo name was joined to, if any. */
export function instructorFor(
  data: PlanetTerpDept | null,
  name: string,
): Instructor | null {
  if (!data) return null;
  const slug: InstructorSlug | undefined = data.names[instructorNameKey(name)];
  return slug ? (data.instructors[slug] ?? null) : null;
}
