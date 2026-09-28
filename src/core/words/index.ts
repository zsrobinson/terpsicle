// The small phrases every product builds its sentences from: a count with its
// noun, and a list read aloud. One copy, so "3 courses" and "A, B and C"
// read the same in Schedule, Reviews, Chat, Plan and Todo (COHESION §1.2).

/** "1 course", "4 courses", "1,200 reviews"; `many` for nouns that don't just add an s. */
export function countWords(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

/**
 * "A", "A and B", "A, B and C" (no comma before "and"). Past `shown` items,
 * the rest are counted: "A, B, C and 2 more".
 */
export function listWords(
  items: readonly string[],
  shown = Number.POSITIVE_INFINITY,
): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length <= shown)
    return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
  return `${items.slice(0, shown).join(", ")} and ${items.length - shown} more`;
}
