// POST /api/admin/grades and /api/admin/grades/save (V2 §10): the Grade
// data page. Which semesters' grades aren't in PlanetTerp's data yet (the
// PlanetTerp manifest's `gradesThrough`, against today), and the owner's
// note on each semester's Public Information Act request (`grade_requests`,
// migrations/0020_reviews_public.sql).
import { semestersMissingGrades } from "~/core/grades/requests";
import {
  PLANETTERP_MANIFEST_KEY,
  PlanetTerpManifestSchema,
  type TermId,
} from "~/core/schema";
import type {
  AdminGradeSaveInput,
  AdminGradeSemester,
  AdminGrades,
} from "~/core/schema/admin";

async function gradesThrough(bucket: R2Bucket): Promise<TermId | null> {
  const object = await bucket.get(PLANETTERP_MANIFEST_KEY);
  if (!object) return null;
  const manifest = PlanetTerpManifestSchema.safeParse(await object.json());
  return manifest.success ? manifest.data.gradesThrough : null;
}

export async function adminGrades(
  env: { DB: D1Database; DATA: R2Bucket },
  now: Date,
): Promise<AdminGrades> {
  const through = await gradesThrough(env.DATA);
  const missing = semestersMissingGrades(
    through,
    now.toISOString().slice(0, 10),
  );
  const notes = new Map<string, { sent_on: string | null; note: string }>();
  if (missing.length > 0) {
    const { results } = await env.DB.prepare(
      `SELECT term_id, sent_on, note FROM grade_requests
       WHERE term_id IN (${missing.map(() => "?").join(", ")})`,
    )
      .bind(...missing)
      .all<{ term_id: string; sent_on: string | null; note: string }>();
    for (const r of results) notes.set(r.term_id, r);
  }
  return {
    gradesThrough: through,
    missing: missing.map((termId) => ({
      termId,
      sentOn: notes.get(termId)?.sent_on ?? null,
      note: notes.get(termId)?.note ?? "",
    })),
  };
}

export async function saveGradeRequest(
  env: { DB: D1Database },
  input: AdminGradeSaveInput,
  now: Date,
): Promise<{ saved: AdminGradeSemester }> {
  await env.DB.prepare(
    `INSERT INTO grade_requests (term_id, sent_on, note, updated_at)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT (term_id) DO UPDATE SET
       sent_on = excluded.sent_on, note = excluded.note,
       updated_at = excluded.updated_at`,
  )
    .bind(input.termId, input.sentOn, input.note, now.toISOString())
    .run();
  return { saved: input };
}
