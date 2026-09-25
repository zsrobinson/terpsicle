import type { ContentHash, DeptCode, Manifest } from "../schema";

// Client catalog flow step 3 (DATA §5.1): fetch only what changed.

export type ManifestDiff = {
  /** Departments to fetch: new, or their hash changed, or their file isn't cached. */
  readonly fetch: readonly DeptCode[];
  /** Cached departments the new manifest no longer lists. */
  readonly drop: readonly DeptCode[];
  readonly seats: boolean;
  readonly changes: boolean;
};

export type CachedCatalog = {
  readonly schemaVersion: number;
  /** Department → hash of the chunk we hold. */
  readonly departments: ReadonlyMap<DeptCode, ContentHash>;
  readonly seatsHash: ContentHash | null;
  readonly changesHash: ContentHash | null;
};

/** What the cache holds, as a `CachedCatalog`, from the manifest it was stored with. */
export function cachedCatalogOf(manifest: Manifest): CachedCatalog {
  return {
    schemaVersion: manifest.schemaVersion,
    departments: new Map(manifest.departments.map((d) => [d.code, d.hash])),
    seatsHash: manifest.seats?.hash ?? null,
    changesHash: manifest.changes?.hash ?? null,
  };
}

/**
 * The minimal set of files to fetch to bring `cached` up to `next`. A
 * schema version change refetches everything (DATA §2.3).
 */
export function diffManifest(
  cached: CachedCatalog | null,
  next: Manifest,
): ManifestDiff {
  const fresh = cached === null || cached.schemaVersion !== next.schemaVersion;
  const have = fresh ? new Map<DeptCode, ContentHash>() : cached.departments;
  const listed = new Set(next.departments.map((d) => d.code));
  return {
    fetch: next.departments
      .filter((d) => have.get(d.code) !== d.hash)
      .map((d) => d.code),
    drop: cached
      ? [...cached.departments.keys()].filter((d) => !listed.has(d))
      : [],
    seats:
      next.seats !== null && (fresh || cached.seatsHash !== next.seats.hash),
    changes:
      next.changes !== null &&
      (fresh || cached.changesHash !== next.changes.hash),
  };
}
