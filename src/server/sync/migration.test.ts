// migrations/0010_four_year_sync.sql rebuilds sync_docs to let in the
// `four-year` kind (docs/V3.md §2.4). Every migration has run by the time a
// test starts, so this puts sync_docs back as 0005_sync.sql made it, fills it
// the way production is filled, and runs 0010 again over it.
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { findTestUser } from "~/core/auth";
import { upsertUser } from "../auth/store";
import { testBindings } from "../test-bindings";

const AT = "2026-10-01T15:00:00.000Z";

function migration(prefix: string): string[] {
  const found = testBindings().migrations.find((m) =>
    m.name.startsWith(prefix),
  );
  if (!found) throw new Error(`no migration ${prefix}`);
  return found.queries;
}

const run = (queries: readonly string[]) =>
  env.DB.batch(queries.map((q) => env.DB.prepare(q)));

/** sync_docs as 0005 made it: its own statements, minus sync_heads. */
async function restoreSyncDocsFrom0005(): Promise<void> {
  await env.DB.prepare("DROP TABLE sync_docs").run();
  await run(
    migration("0005_").filter(
      (q) => q.includes("sync_docs") && !q.includes("CREATE TABLE sync_heads"),
    ),
  );
}

const insertDoc = (
  userId: string,
  kind: string,
  docId: string,
  termId: string | null,
  rev: number,
  body: string | null,
) =>
  env.DB.prepare(
    `INSERT INTO sync_docs (user_id, kind, doc_id, term_id, rev, deleted, body, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
  ).bind(userId, kind, docId, termId, rev, body === null ? 1 : 0, body, AT);

const everyRow = async () =>
  (await env.DB.prepare("SELECT * FROM sync_docs ORDER BY user_id, rev").all())
    .results;

const indexes = async () =>
  (
    await env.DB.prepare(
      `SELECT name, sql FROM sqlite_master
       WHERE type = 'index' AND tbl_name = 'sync_docs' AND sql IS NOT NULL
       ORDER BY name`,
    ).all()
  ).results;

beforeEach(async () => {
  await env.DB.batch(
    ["sync_docs", "sync_heads", "sessions", "users"].map((t) =>
      env.DB.prepare(`DELETE FROM ${t}`),
    ),
  );
  for (const id of ["tstudent", "tclassmate"]) {
    const user = findTestUser(id);
    if (!user) throw new Error(`no test user ${id}`);
    await upsertUser(env.DB, user.identity, new Date(AT));
  }
});

describe("0010_four_year_sync", () => {
  it("keeps every row and index through the rebuild", async () => {
    const before0010 = await indexes();
    await restoreSyncDocsFrom0005();
    await env.DB.batch([
      insertDoc("tstudent", "plan", "plan_a_test", "202608", 1, '{"id":"a"}'),
      insertDoc("tstudent", "plan", "plan_b_test", "202608", 2, null),
      insertDoc("tstudent", "settings", "settings", null, 3, '{"blocks":[]}'),
      insertDoc("tclassmate", "plan", "plan_a_test", "202701", 1, '{"é":1}'),
    ]);
    // The old CHECK is what the rebuild exists to change.
    await expect(
      insertDoc("tstudent", "four-year", "fy_1_test", null, 4, "{}").run(),
    ).rejects.toThrow(/CHECK/);
    const rows = await everyRow();
    expect(rows).toHaveLength(4);

    await run(migration("0010_"));

    expect(await everyRow()).toEqual(rows);
    expect(await indexes()).toEqual(before0010);
    expect((await indexes()).map((i) => i.name)).toEqual([
      "sync_docs_since",
      "sync_docs_tombstones",
    ]);
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE name LIKE 'sync_docs%' AND type = 'table'",
    ).all();
    expect(tables.results).toEqual([{ name: "sync_docs" }]);
  });

  it("lets in four-year docs and their tombstones, and nothing else new", async () => {
    await restoreSyncDocsFrom0005();
    await run(migration("0010_"));
    await env.DB.batch([
      insertDoc("tstudent", "four-year", "fy_1_test", null, 1, '{"id":"x"}'),
      insertDoc("tstudent", "four-year", "fy_2_test", null, 2, null),
    ]);
    for (const refused of [
      insertDoc("tstudent", "settings", "settings", null, 3, null),
      insertDoc("tstudent", "todo", "t_1_test", null, 4, "{}"),
      // A deleted flag with a body, or a live doc without one.
      env.DB.prepare(
        `INSERT INTO sync_docs (user_id, kind, doc_id, rev, deleted, body, updated_at)
         VALUES ('tstudent', 'four-year', 'fy_3_test', 5, 1, '{}', ?1)`,
      ).bind(AT),
      env.DB.prepare(
        `INSERT INTO sync_docs (user_id, kind, doc_id, rev, deleted, body, updated_at)
         VALUES ('tstudent', 'four-year', 'fy_3_test', 5, 0, NULL, ?1)`,
      ).bind(AT),
    ])
      await expect(refused.run()).rejects.toThrow(/CHECK/);
    // Revs stay unique per user, as the pull cursor needs.
    await expect(
      insertDoc("tstudent", "plan", "plan_a_test", "202608", 1, "{}").run(),
    ).rejects.toThrow(/UNIQUE/);
  });

  it("still goes with its user", async () => {
    await restoreSyncDocsFrom0005();
    await insertDoc("tstudent", "plan", "plan_a_test", "202608", 1, "{}").run();
    await run(migration("0010_"));
    await insertDoc("tstudent", "four-year", "fy_1_test", null, 2, "{}").run();
    await insertDoc(
      "tclassmate",
      "four-year",
      "fy_1_test",
      null,
      1,
      "{}",
    ).run();
    await env.DB.prepare("DELETE FROM users WHERE id = 'tstudent'").run();
    expect((await everyRow()).map((r) => [r.user_id, r.kind])).toEqual([
      ["tclassmate", "four-year"],
    ]);
    // And a doc can't belong to nobody.
    await expect(
      insertDoc("tnobody", "four-year", "fy_1_test", null, 1, "{}").run(),
    ).rejects.toThrow(/FOREIGN KEY/);
  });
});
