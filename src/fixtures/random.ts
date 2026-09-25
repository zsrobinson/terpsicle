// Deterministic pseudo-randomness for mock data: the same seed always gives
// the same numbers, so fixtures never change between runs or machines.

/** FNV-1a, 32-bit: a stable number for any string. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: a small seeded generator returning floats in [0, 1). */
export function seededRandom(seed: string | number): () => number {
  let a = typeof seed === "number" ? seed >>> 0 : hashString(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An integer in [min, max], inclusive. */
export function randomInt(rand: () => number, min: number, max: number) {
  return min + Math.floor(rand() * (max - min + 1));
}
