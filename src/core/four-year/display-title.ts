// Transcripts write every title in capitals ("COLLEGE ALGEBRA"). Plan keeps
// that text as the transcript gave it and shows it the way the catalog writes
// its own titles: "College Algebra" (docs/V3.md §2.10).

/** Words a title keeps lowercase, except first or after a colon. Not "a": "IB English A". */
const SMALL = new Set([
  "an",
  "and",
  "as",
  "at",
  "but",
  "by",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "or",
  "the",
  "to",
  "vs",
  "with",
]);

/** Exams, levels and names transcripts abbreviate, which stay in capitals. */
const KEEP = new Set([
  "AP",
  "IB",
  "HL",
  "SL",
  "CLEP",
  "AB",
  "BC",
  "US",
  "USA",
  "UK",
  "EU",
  "UMD",
  "DC",
  "AI",
  "DNA",
  "RNA",
  "HIV",
  "AIDS",
  "STEM",
  "GIS",
  "ESL",
  "LGBT",
  "LGBTQ",
]);

const ROMAN = /^(?:I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)$/;

function caseWord(word: string, first: boolean): string {
  if (KEEP.has(word) || ROMAN.test(word)) return word;
  // No vowel at all ("HL", "MTH"): an abbreviation, not a word.
  if (word.length > 1 && !/[AEIOUY]/.test(word)) return word;
  const lower = word.toLowerCase();
  if (!first && SMALL.has(lower)) return lower;
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * A title for display: all-capitals titles in title case, with exam names
 * (AP, IB), levels (HL), Roman numerals and codes left as they are. A title
 * with any lowercase letter is someone's own casing and stays.
 */
export function displayTitle(title: string): string {
  if (/\p{Ll}/u.test(title)) return title;
  let first = true;
  // Letters (with an apostrophe inside, "WOMEN'S"), or anything else.
  return title.replace(/[\p{Lu}\d]+(?:'[\p{Lu}]+)?|[^\p{Lu}\d]+/gu, (part) => {
    if (!/\p{Lu}/u.test(part)) {
      // A colon starts a new part of the title; a space doesn't.
      if (part.includes(":")) first = true;
      return part;
    }
    const wasFirst = first;
    first = false;
    // Codes and numbers ("CMSC131", "3D", "101") stay as written.
    if (/\d/.test(part)) return part;
    const [word = "", rest] = part.split("'");
    const cased = caseWord(word, wasFirst);
    return rest === undefined ? cased : `${cased}'${rest.toLowerCase()}`;
  });
}
