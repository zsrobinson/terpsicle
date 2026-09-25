import {
  SCHEMA_VERSIONS,
  SEASON_BY_MONTH_CODE,
  type Term,
  TermIdSchema,
  type TermsFile,
} from "~/core/schema";
import type { RawTerm } from "./parse-index";

// terms.json: every term ever seen, newest first. In Testudo's dropdown on
// this run → active; dropped off → archived (SPEC §3.0, DATA.md §3.1).

function yearOf(id: string, name: string): number {
  const fromName = /\b(\d{4})\b/.exec(name)?.[1];
  if (fromName) return Number(fromName);
  // Winter's id carries the previous calendar year; its label the next.
  const year = Number(id.slice(0, 4));
  return id.endsWith("12") ? year + 1 : year;
}

export function mergeTerms(
  previous: TermsFile | null,
  dropdown: readonly RawTerm[],
  now: Date,
): TermsFile {
  const at = now.toISOString();
  const byId = new Map<string, Term>();
  for (const term of previous?.terms ?? []) {
    byId.set(term.id, { ...term, status: "archived" });
  }
  for (const raw of dropdown) {
    const id = raw.id.trim();
    if (!TermIdSchema.safeParse(id).success) continue;
    const monthCode = id.slice(4) as keyof typeof SEASON_BY_MONTH_CODE;
    const prior = byId.get(id);
    byId.set(id, {
      id,
      name: raw.name || prior?.name || id,
      season: SEASON_BY_MONTH_CODE[monthCode],
      year: yearOf(id, raw.name),
      status: "active",
      firstSeen: prior?.firstSeen ?? at,
      lastSeen: at,
    });
  }
  const terms = [...byId.values()].sort((a, b) => (a.id < b.id ? 1 : -1));
  return { schemaVersion: SCHEMA_VERSIONS.catalog, generatedAt: at, terms };
}

export function activeTermIds(file: TermsFile): string[] {
  return file.terms.filter((t) => t.status === "active").map((t) => t.id);
}
