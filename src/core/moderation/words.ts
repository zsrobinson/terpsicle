// A small blocklist. Llama Guard catches hate in context; this list catches
// the unambiguous words without a model call, and catches them when the
// model is down. Two tiers:
// - SLURS are removed outright: there is no honest use in a review or a
//   class chat.
// - BLOCKED words are held for a person: they're slurs too, but have
//   reclaimed or non-slur uses ("a chink in the armor") that a person should
//   judge.
// - INSULTS only flag: "that quiz was so stupid" is fine, "she's so stupid"
//   isn't, and only reading it in context tells them apart. In chat, a flag
//   is what asks the policy model to read a message at all.
// The lists are base64 so the source doesn't read as a list of slurs; they
// decode at load. Matching is per whole word, after undoing common disguises
// (leetspeak, separators, stretched letters), and never inside other words,
// so "Niger", "spice" and "raccoon" are fine.

const decode = (b64: string) => atob(b64).split(",");

export const SLURS: readonly string[] = decode(
  "bmlnZ2VyLGZhZ2dvdCxmYWcsa2lrZSxzcGljLHdldGJhY2ssdHJhbm55LGdvb2sscmFnaGVhZCx0b3dlbGhlYWQsYmVhbmVyLHBha2k=",
);

export const BLOCKED_WORDS: readonly string[] = decode(
  "bmlnZ2EsY2hpbmsscmV0YXJkLHJldGFyZGVkLGR5a2UsY29vbixreXM=",
);

/** Everyday insults, in plain text: mild enough to read. */
export const INSULTS: readonly string[] = [
  "idiot",
  "idiotic",
  "moron",
  "stupid",
  "dumb",
  "dumbass",
  "loser",
  "ugly",
  "pathetic",
  "clown",
  "embarrassing",
  "worthless",
];

export type WordTier = "slur" | "blocked-word" | "insult";

export interface WordMatch {
  tier: WordTier;
  span: [number, number];
}

const LEET: Readonly<Record<string, string>> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
  "!": "i",
  "|": "i",
};

/** A word as it would be spelled without disguises: "N.1.G" → "nig". */
export function normalizeWord(token: string): string {
  return token
    .normalize("NFKC")
    .toLowerCase()
    .replace(/^[._*'!-]+|[._*'!?-]+$/g, "")
    .replace(/[0-9@$!|]/g, (c) => LEET[c] ?? c)
    .replace(/[._*'-]/g, "");
}

/**
 * "gg" in a term matches two or more g's, "e" one or more, so stretched
 * spellings match, and a plural or possessive is allowed. A term with a
 * double letter never matches the single-letter word ("Niger").
 */
function termPattern(term: string): RegExp {
  const runs = term.match(/(.)\1*/g) ?? [];
  const body = runs.map((run) => `${run[0]}{${run.length},}`).join("");
  return new RegExp(`^${body}s?$`);
}

const PATTERNS: ReadonlyArray<{ tier: WordTier; pattern: RegExp }> = [
  ...SLURS.map((t) => ({ tier: "slur" as const, pattern: termPattern(t) })),
  ...BLOCKED_WORDS.map((t) => ({
    tier: "blocked-word" as const,
    pattern: termPattern(t),
  })),
  ...INSULTS.map((t) => ({ tier: "insult" as const, pattern: termPattern(t) })),
];

// Letters, digits and the characters people use to disguise a word.
const TOKEN = /[\p{L}\p{N}@$!|*_.'-]+/gu;

export function findBlockedWords(text: string): WordMatch[] {
  const found: WordMatch[] = [];
  for (const match of text.matchAll(TOKEN)) {
    const word = normalizeWord(match[0]);
    if (!word) continue;
    const hit = PATTERNS.find((p) => p.pattern.test(word));
    if (hit)
      found.push({
        tier: hit.tier,
        span: [match.index, match.index + match[0].length],
      });
  }
  return found;
}
