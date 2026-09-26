// Contact details and ids in free text. Reviews are anonymous and about
// teaching, so any of these in a review is about someone else. Chat has real
// names, and "text me at …" is how study groups form, so a detail the writer
// is plainly sharing about themselves is fine there.

export type ContactKind = "email" | "phone" | "address" | "uid";

export interface FoundContact {
  kind: ContactKind;
  span: [number, number];
  /** The words just before it say it's the writer's own ("text me at"). */
  own: boolean;
}

const EMAIL =
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

// North American numbers: the area code and exchange can't start with 0 or 1,
// which keeps section numbers and UIDs out.
const PHONE =
  /(?<![\w-])(?:\+?1[\s.-]?)?(?:\([2-9]\d{2}\)|[2-9]\d{2})[\s.-]?[2-9]\d{2}[\s.-]?\d{4}(?![\w-])/g;

/** A UMD UID is 9 digits. */
const UID = /(?<![\w.-])\d{9}(?![\w-])/g;

/** Case-insensitive alternation without the `i` flag, which would loosen the capitalized-name rule. */
const anyCase = (word: string) =>
  [...word]
    .map((c) =>
      /[a-z]/i.test(c) ? `[${c.toUpperCase()}${c.toLowerCase()}]` : c,
    )
    .join("");

const STREET_SUFFIXES = [
  "street",
  "st",
  "avenue",
  "ave",
  "road",
  "rd",
  "boulevard",
  "blvd",
  "drive",
  "dr",
  "lane",
  "ln",
  "court",
  "ct",
  "way",
  "place",
  "pl",
  "terrace",
  "ter",
  "parkway",
  "pkwy",
  "circle",
  "cir",
  "highway",
  "hwy",
].map(anyCase);

// A house number, one to three capitalized words, and a street suffix:
// "4321 Knox Rd", "7400 Baltimore Avenue". The capitalized name keeps
// "a 10 minute drive" out.
const ADDRESS = new RegExp(
  `(?<![\\w-])\\d{1,5}\\s+(?:[A-Z][a-z]+\\.?\\s+){1,3}(?:${STREET_SUFFIXES.join("|")})\\b\\.?`,
  "g",
);

// The writer giving out their own details, just before the match.
const OWN_CONTACT =
  /\b(?:(?:text|call|email|e-mail|message|dm|reach|contact)\s+me|my\s+(?:number|cell|phone|email|e-mail)(?:\s+is)?|me\s+at)\b[^.!?\n]{0,12}$/i;
const OWN_ADDRESS =
  /\b(?:my\s+(?:place|apartment|apt|house|dorm)(?:\s+is)?|meet(?:ing)?\s+(?:up\s+)?at|come\s+(?:over\s+)?to|we'?re\s+at)\b[^.!?\n]{0,12}$/i;

function scan(
  text: string,
  pattern: RegExp,
  kind: ContactKind,
  own: RegExp | null,
): FoundContact[] {
  return [...text.matchAll(pattern)].map((match) => ({
    kind,
    span: [match.index, match.index + match[0].length],
    own:
      own?.test(text.slice(Math.max(0, match.index - 40), match.index)) ??
      false,
  }));
}

const overlaps = (a: [number, number], b: [number, number]) =>
  a[0] < b[1] && b[0] < a[1];

export function findContacts(text: string): FoundContact[] {
  const emails = scan(text, EMAIL, "email", OWN_CONTACT);
  const phones = scan(text, PHONE, "phone", OWN_CONTACT);
  // Digits inside a phone number or an email aren't also a UID.
  const uids = scan(text, UID, "uid", null).filter(
    (u) => ![...emails, ...phones].some((c) => overlaps(c.span, u.span)),
  );
  const addresses = scan(text, ADDRESS, "address", OWN_ADDRESS);
  return [...emails, ...phones, ...uids, ...addresses].sort(
    (a, b) => a.span[0] - b.span[0],
  );
}
