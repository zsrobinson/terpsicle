// Reads the published catalog (R2) to check that a watched section exists,
// and to name it in emails.
import {
  type Course,
  DeptChunkSchema,
  deptChunkKey,
  ManifestSchema,
  manifestKey,
  parseSectionKey,
  type Section,
  TERMS_KEY,
  type Term,
  TermsFileSchema,
} from "~/core/schema";

export interface WatchedSection {
  term: Term;
  course: Course;
  section: Section;
}

async function readJson(bucket: R2Bucket, key: string): Promise<unknown> {
  const object = await bucket.get(key);
  return object ? object.json() : null;
}

/** Loads catalog pieces once per call site (a cron run looks up many sections). */
export function catalogReader(bucket: R2Bucket) {
  const cache = new Map<string, Promise<unknown>>();
  const read = (key: string) => {
    let value = cache.get(key);
    if (!value) {
      value = readJson(bucket, key);
      cache.set(key, value);
    }
    return value;
  };

  return async function findSection(
    termId: string,
    sectionKey: string,
  ): Promise<WatchedSection | null> {
    const parsedKey = parseSectionKey(sectionKey);
    if (!parsedKey) return null;
    const terms = TermsFileSchema.safeParse(await read(TERMS_KEY));
    const term = terms.success
      ? terms.data.terms.find((t) => t.id === termId)
      : undefined;
    if (!term) return null;
    const manifest = ManifestSchema.safeParse(await read(manifestKey(termId)));
    const dept = parsedKey.courseCode.slice(0, 4);
    const entry = manifest.success
      ? manifest.data.departments.find((d) => d.code === dept)
      : undefined;
    if (!entry) return null;
    const chunk = DeptChunkSchema.safeParse(
      await read(deptChunkKey(termId, dept, entry.hash)),
    );
    const course = chunk.success
      ? chunk.data.courses.find((c) => c.code === parsedKey.courseCode)
      : undefined;
    const section = course?.sections.find(
      (s) => s.code === parsedKey.sectionCode,
    );
    return course && section ? { term, course, section } : null;
  };
}
