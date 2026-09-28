/** "A", "A and B", "A, B and C", "A, B, C and 2 more". */
export function listWords(items: readonly string[], shown = 3): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length <= shown)
    return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
  return `${items.slice(0, shown).join(", ")} and ${items.length - shown} more`;
}
