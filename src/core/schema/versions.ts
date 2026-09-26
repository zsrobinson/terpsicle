import { z } from "zod";

/** Families of published files; each has its own schema version. */
export const SchemaFamilySchema = z.enum([
  "catalog",
  "planetterp",
  "geo",
  "calendar",
  "summaries",
  "courses",
]);
export type SchemaFamily = z.infer<typeof SchemaFamilySchema>;

/**
 * One version per family of published files. Bump a family only for a
 * breaking change (a field removed, renamed or retyped, or a meaning changed);
 * additive optional fields don't bump, because readers strip unknown keys.
 * A bump makes clients drop their cache for that family and refetch.
 * See docs/DATA.md §2.3.
 */
export const SCHEMA_VERSIONS = {
  catalog: 1,
  planetterp: 1,
  geo: 1,
  calendar: 1,
  summaries: 1,
  courses: 1,
} as const satisfies Record<SchemaFamily, number>;

/**
 * Read this before the full schema: a client that finds a newer version than
 * its own is stale and reloads; one that finds an older version keeps its cache.
 */
export const WireEnvelopeSchema = z.object({
  schemaVersion: z.number().int().positive(),
});
export type WireEnvelope = z.infer<typeof WireEnvelopeSchema>;

/** Version of the routes binary layout (its header, not `SCHEMA_VERSIONS.geo`). */
export const ROUTES_BINARY_VERSION = 1;

/** Share-link payload version (`v` field). */
export const SHARE_PAYLOAD_VERSION = 1;

/** Dexie database. Bump with an upgrade function whenever a table's shape changes. */
export const LOCAL_DB_NAME = "terpsicle";
export const LOCAL_DB_VERSION = 1;
