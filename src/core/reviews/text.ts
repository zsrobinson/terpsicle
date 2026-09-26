// Small pure pieces of a review: the key that catches copies, the month
// readers see, and minted instructor ids.

/**
 * What `reviews.text_hash` hashes (V2 §7.3): the words only, so a copy with
 * different case, spacing, punctuation or Unicode forms still matches.
 */
export function reviewTextKey(body: string): string {
  return body
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const MONTH = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
});

/**
 * The month a review was written, as readers see it (V2 §7.5: the date is
 * rounded to the month to blunt timing guesses). America/New_York, so a
 * review written on the evening of October 31 reads as October.
 */
export function createdMonth(iso: string): string {
  const parts = MONTH.formatToParts(new Date(iso));
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  return `${year}-${month}`;
}

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";
/** Characters after `t~` (V2 §7.2): 50 bits. */
const MINTED_LENGTH = 10;
/** Random bytes needed for them. */
export const MINTED_ID_BYTES = 7;

/**
 * An instructor id for a name PlanetTerp doesn't know: `t~` and 10 base32
 * characters. The caller passes the random bytes, so this stays pure.
 */
export function mintedInstructorId(random: Uint8Array): string {
  if (random.length < MINTED_ID_BYTES)
    throw new Error(`mintedInstructorId needs ${MINTED_ID_BYTES} bytes`);
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of random) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5 && out.length < MINTED_LENGTH) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  return `t~${out}`;
}
