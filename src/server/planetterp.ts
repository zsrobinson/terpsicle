// The published PlanetTerp files, read from the Worker: review summaries use
// an instructor's counts, and Reviews joins Testudo names to slugs with the
// department's `names` map (DATA.md §4.1).
import {
  type DeptCode,
  PLANETTERP_MANIFEST_KEY,
  type PlanetTerpDept,
  PlanetTerpDeptSchema,
  PlanetTerpManifestSchema,
  planetTerpDeptKey,
} from "~/core/schema";

/** The department's current PlanetTerp file, or null when there's none (or it doesn't parse). */
export async function readPlanetTerpDept(
  bucket: R2Bucket,
  dept: DeptCode,
): Promise<PlanetTerpDept | null> {
  const manifestObject = await bucket.get(PLANETTERP_MANIFEST_KEY);
  if (!manifestObject) return null;
  const manifest = PlanetTerpManifestSchema.safeParse(
    await manifestObject.json(),
  );
  const entry = manifest.success
    ? manifest.data.departments.find((d) => d.code === dept)
    : undefined;
  if (!entry) return null;
  const deptObject = await bucket.get(planetTerpDeptKey(dept, entry.hash));
  if (!deptObject) return null;
  const file = PlanetTerpDeptSchema.safeParse(await deptObject.json());
  return file.success ? file.data : null;
}
