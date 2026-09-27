// Chat's spam guard: one person posting the same thing in many rooms, or
// flooding many rooms at once (the owner, 2026-09-27: "spamming something
// in a million different course channels"). Each course is its own Durable
// Object, so the Worker keeps a short log in D1 (`chat_send_hashes`): who,
// which room, when, and a fingerprint of the words, never the words. These
// are the pure rules over that log.
import type { CrossRoomRule } from "~/core/schema";

const MINUTE = 60_000;

export const CROSS_ROOM = {
  /** The same or a near-same text in this many different rooms… */
  repeatRooms: 3,
  /** …within this long holds it. */
  repeatWindowMs: 60 * MINUTE,
  /** More than this many messages… */
  floodMessages: 12,
  /** …across more than this many rooms… */
  floodRooms: 4,
  /** …within this long holds it. */
  floodWindowMs: 10 * MINUTE,
  /**
   * Normalized texts shorter than this never count as repeats: "thanks!"
   * or "same" in three rooms is just talking.
   */
  minRepeatChars: 20,
  /** Fingerprints at most this many bits apart (of 64) are near-same. */
  nearBits: 10,
  /** Rows older than the longest window are pruned by the cron. */
  keepMs: 60 * MINUTE,
} as const;

/** One message (or edit) as the log keeps it. */
export interface CrossRoomSend {
  room: string;
  /** `textFingerprint` of its text; null when it's too short to compare. */
  fingerprint: string | null;
  /** Milliseconds since the epoch. */
  at: number;
}

/**
 * Lowercase letters and digits, one space between words: case, accents,
 * punctuation and spacing don't make a message different.
 */
export function normalizeForSpam(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** 32-bit FNV-1a from a given start, so two starts make 64 bits. */
function fnv1a(text: string, basis: number): number {
  let hash = basis;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const SHINGLE = 4;

/**
 * A 64-bit SimHash of the normalized text's 4-character shingles, as 16 hex
 * characters: small edits (a course code added, a word swapped) move only
 * a few bits, so near-same texts land close together. Null for texts too
 * short to call a repeat. It can't be turned back into the words.
 */
export function textFingerprint(text: string): string | null {
  const normalized = normalizeForSpam(text);
  if (normalized.length < CROSS_ROOM.minRepeatChars) return null;
  const weights = new Array<number>(64).fill(0);
  for (let i = 0; i + SHINGLE <= normalized.length; i++) {
    const shingle = normalized.slice(i, i + SHINGLE);
    const halves = [fnv1a(shingle, 0x811c9dc5), fnv1a(shingle, 0x050c5d1f)];
    for (let bit = 0; bit < 64; bit++) {
      const half = halves[bit >> 5] ?? 0;
      weights[bit] = (weights[bit] ?? 0) + ((half >>> (bit & 31)) & 1 ? 1 : -1);
    }
  }
  let hex = "";
  for (let nibble = 15; nibble >= 0; nibble--) {
    let value = 0;
    for (let b = 3; b >= 0; b--)
      value = (value << 1) | ((weights[nibble * 4 + b] ?? 0) > 0 ? 1 : 0);
    hex += value.toString(16);
  }
  return hex;
}

/** How many of the 64 bits differ between two fingerprints. */
export function fingerprintDistance(a: string, b: string): number {
  let distance = 0;
  for (let i = 0; i < 16; i++) {
    let x = Number.parseInt(a[i] ?? "0", 16) ^ Number.parseInt(b[i] ?? "0", 16);
    while (x) {
      distance += x & 1;
      x >>= 1;
    }
  }
  return distance;
}

/**
 * Whether this message trips the guard, given the same person's earlier
 * sends (any rooms, any order). `repeat`: the same or a near-same text in
 * `repeatRooms` or more rooms within the hour, this one included. `flood`:
 * more than `floodMessages` messages across more than `floodRooms` rooms
 * in ten minutes, this one included. Null when neither.
 */
export function crossRoomRule(
  current: CrossRoomSend,
  earlier: readonly CrossRoomSend[],
  now: number,
): CrossRoomRule | null {
  const fingerprint = current.fingerprint;
  if (fingerprint) {
    const rooms = new Set([current.room]);
    for (const send of earlier)
      if (
        send.fingerprint &&
        now - send.at <= CROSS_ROOM.repeatWindowMs &&
        fingerprintDistance(fingerprint, send.fingerprint) <=
          CROSS_ROOM.nearBits
      )
        rooms.add(send.room);
    if (rooms.size >= CROSS_ROOM.repeatRooms) return "repeat";
  }
  const recent = earlier.filter(
    (send) => now - send.at <= CROSS_ROOM.floodWindowMs,
  );
  const rooms = new Set([current.room, ...recent.map((send) => send.room)]);
  if (
    recent.length + 1 > CROSS_ROOM.floodMessages &&
    rooms.size > CROSS_ROOM.floodRooms
  )
    return "flood";
  return null;
}
