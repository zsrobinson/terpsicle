import type { Term, TermId } from "../schema";

/**
 * The term to open (SPEC §3.0): the last one the person picked, if it still
 * exists; else the newest active fall or spring (the one people register
 * for); else the newest active term; else the newest term at all.
 */
export function pickTerm(
  terms: readonly Term[],
  lastTermId: TermId | null,
): Term | undefined {
  const remembered = lastTermId
    ? terms.find((t) => t.id === lastTermId)
    : undefined;
  if (remembered) return remembered;
  const newestFirst = [...terms].sort((a, b) => b.id.localeCompare(a.id));
  return (
    newestFirst.find(
      (t) =>
        t.status === "active" && (t.season === "fall" || t.season === "spring"),
    ) ??
    newestFirst.find((t) => t.status === "active") ??
    newestFirst[0]
  );
}
