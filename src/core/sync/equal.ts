/**
 * Structural equality for JSON data (what docs are made of): same primitives,
 * arrays equal item by item, objects equal key by key in any key order. A key
 * set to `undefined` counts as missing, as it would after `JSON.stringify`.
 */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object") return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
      return false;
    return a.every((item, i) => sameJson(item, b[i]));
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keys = (r: Record<string, unknown>) =>
    Object.keys(r).filter((k) => r[k] !== undefined);
  const ka = keys(ra);
  if (ka.length !== keys(rb).length) return false;
  return ka.every((k) => sameJson(ra[k], rb[k]));
}
