import { pickTerm, termIdFromLabel, termLabel } from "../catalog/terms";
import type { Term, TermId } from "../schema";

// Terms as the MCP server takes and gives them (docs/MCP.md): an agent may
// write an id (YYYYMM), "Fall 2027" or "fall 2027", and gets both the id
// and the name back.

/** A term id from what an agent typed: an id (YYYYMM) or a name (`Fall 2027`); null for anything else. */
export function readTermInput(input: string): TermId | null {
  const text = input.trim();
  if (/^\d{4}(01|05|08|12)$/.test(text)) return text;
  return termIdFromLabel(text);
}

/** `{id, name}`: how every tool names a term. */
export function termRef(termId: TermId): { id: TermId; name: string } {
  return { id: termId, name: termLabel(termId) };
}

/** The term a tool uses when none is given: the newest active fall or spring, as the scheduler opens. */
export function defaultTerm(terms: readonly Term[]): Term | null {
  return pickTerm(terms, null) ?? null;
}

/** The newest term Testudo lists: where offering patterns' window ends. */
export function newestTerm(terms: readonly Term[]): TermId | null {
  let newest: TermId | null = null;
  for (const t of terms) if (newest === null || t.id > newest) newest = t.id;
  return newest;
}

/** The `count` falls and springs after `after`, in order. */
export function semestersAfter(after: TermId, count: number): TermId[] {
  const out: TermId[] = [];
  let year = Number(after.slice(0, 4));
  let fall = !after.endsWith("08") && !after.endsWith("12");
  // Spring and summer go on to that year's fall; fall and winter to the next spring.
  while (out.length < count) {
    if (fall) out.push(`${year}08`);
    else {
      year += 1;
      out.push(`${year}01`);
    }
    fall = !fall;
  }
  return out;
}
