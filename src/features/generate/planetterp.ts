import type { DeptCode, PlanetTerpDept } from "~/core/schema";
import type { DataReader } from "~/state/data-source";

// PlanetTerp's per-department files (DATA §4.1), for ranking by rating and
// GPA. Loaded once per department per data source. A department that fails
// to load is simply unrated: ranking treats it as neutral, so Generate still
// works without PlanetTerp.

type Loaded = {
  manifest: ReturnType<DataReader["planetTerpManifest"]>;
  depts: Map<DeptCode, Promise<PlanetTerpDept | null>>;
};

const byReader = new WeakMap<DataReader, Loaded>();

export async function planetTerpDepts(
  reader: DataReader,
  depts: readonly DeptCode[],
): Promise<PlanetTerpDept[]> {
  let loaded = byReader.get(reader);
  if (!loaded) {
    const manifest = reader.planetTerpManifest();
    // Each department reports its own failure; this only keeps an unused
    // rejection from being reported as unhandled.
    manifest.catch(() => {});
    loaded = { manifest, depts: new Map() };
    byReader.set(reader, loaded);
  }
  const { manifest, depts: cache } = loaded;
  const files = await Promise.all(
    [...new Set(depts)].map((dept) => {
      let file = cache.get(dept);
      if (!file) {
        file = manifest
          .then((m) => {
            const entry = m.departments.find((d) => d.code === dept);
            return entry ? reader.planetTerpDept(dept, entry.hash) : null;
          })
          .catch((error: unknown) => {
            console.warn(error);
            return null;
          });
        cache.set(dept, file);
      }
      return file;
    }),
  );
  return files.filter((f): f is PlanetTerpDept => f !== null);
}
