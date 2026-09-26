// Which instructor a review is about (V2 §7.2, §7.4). The id doesn't depend
// on PlanetTerp: it's their slug when the name join knows the instructor (so
// summaries and links keep working), else one we mint. The Testudo name is
// joined once per department and remembered in instructor_names.
import { MINTED_ID_BYTES, mintedInstructorId } from "~/core/reviews";
import {
  type DeptCode,
  type InstructorId,
  type InstructorRow,
  instructorNameKey,
  type PlanetTerpDept,
} from "~/core/schema";
import { readPlanetTerpDept } from "../planetterp";
import {
  ensurePlanetTerpInstructor,
  getInstructor,
  getInstructorName,
  mintInstructor,
  setInstructorName,
} from "./store";

export interface InstructorQuery {
  /** The id the page sent, if any. Trusted only if we know it. */
  instructorId: InstructorId | null;
  /** The Testudo name on the page. */
  reviewedName: string;
  dept: DeptCode;
}

/**
 * Finds (or mints) the instructor, in this order:
 * 1. the given id, if it's in the registry or the department's PlanetTerp file;
 * 2. the owner's manual correction for this name and department;
 * 3. the PlanetTerp `names` map (ingest's join, DATA.md §4.1);
 * 4. the name as first joined here (planetterp or minted);
 * 5. a new minted id.
 * V2 §7.4 lists 1, 3, 4, 5; a manual correction (2) outranks PlanetTerp's
 * join, since fixing a wrong join is the point of it.
 */
export async function resolveInstructor(
  env: { DB: D1Database; DATA: R2Bucket },
  query: InstructorQuery,
  now: Date,
): Promise<InstructorRow> {
  const db = env.DB;
  let planetTerp: Promise<PlanetTerpDept | null> | undefined;
  const planetTerpFile = () => {
    planetTerp ??= readPlanetTerpDept(env.DATA, query.dept);
    return planetTerp;
  };

  if (query.instructorId !== null) {
    const known = await getInstructor(db, query.instructorId);
    if (known) return known;
    if ((await planetTerpFile())?.instructors[query.instructorId]) {
      const added = await ensurePlanetTerpInstructor(
        db,
        query.instructorId,
        query.reviewedName,
        now,
      );
      if (added) return added;
    }
  }

  const nameKey = instructorNameKey(query.reviewedName);
  const named = await getInstructorName(db, nameKey, query.dept);
  const namedInstructor = async () =>
    named ? getInstructor(db, named.instructor_id) : null;
  if (named?.rule === "manual") {
    const manual = await namedInstructor();
    if (manual) return manual;
  }

  const slug = (await planetTerpFile())?.names[nameKey];
  if (slug) {
    const found = await ensurePlanetTerpInstructor(
      db,
      slug,
      query.reviewedName,
      now,
    );
    if (found) {
      if (named?.instructor_id !== slug)
        await setInstructorName(db, {
          nameKey,
          dept: query.dept,
          instructorId: slug,
          rule: "planetterp",
          now,
        });
      return found;
    }
  }

  const earlier = await namedInstructor();
  if (earlier) return earlier;

  return mintInstructor(db, {
    id: mintedInstructorId(
      crypto.getRandomValues(new Uint8Array(MINTED_ID_BYTES)),
    ),
    name: query.reviewedName,
    nameKey,
    dept: query.dept,
    now,
  });
}
