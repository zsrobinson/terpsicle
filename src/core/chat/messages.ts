import { needsRetry } from "../moderation/decide";
import type {
  ChatMessageId,
  HeldReason,
  Moderation,
  ModerationDecision,
  ModerationReason,
  ReasonCode,
} from "../schema";

// Message ids, and what a moderation decision means for a chat message
// (V2.md §8.4, docs/MODERATION.md).

/**
 * Sends (and edits) per person per course (V2.md §8.4): a burst limit and a
 * daily one. Past either, the object answers `slow-down` with how long to
 * wait.
 */
export const CHAT_SEND_LIMITS = [
  { count: 10, seconds: 30 },
  { count: 500, seconds: 86_400 },
] as const;

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * A ULID: 10 characters of milliseconds, then 16 of randomness (the first
 * 10 bytes of `random`), in Crockford base 32. Ids sort by time, so they
 * read well in logs; order within a room is its `seq`.
 */
export function chatMessageId(now: number, random: Uint8Array): ChatMessageId {
  let time = "";
  for (let t = Math.floor(now), i = 0; i < 10; i++, t = Math.floor(t / 32))
    time = (CROCKFORD[t % 32] ?? "0") + time;
  let bits = 0;
  let value = 0;
  let rest = "";
  for (const byte of random.subarray(0, 10)) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      rest += CROCKFORD[(value >> bits) & 31] ?? "0";
    }
  }
  return time + rest.padEnd(16, "0");
}

/** Reasons that mean answers to graded work (MODERATION.md §3 and §5). */
const GRADED_WORK: ReadonlySet<ReasonCode> = new Set([
  "shares-answers",
  "asks-for-answers",
  "code-paste",
  "cheating-site",
  "academic-integrity",
]);

/**
 * What a decision from `moderate()` (or a later one, through the handler)
 * makes a message:
 * - `publish`: visible to the room;
 * - `hold` only because a check couldn't run (the model, the daily cap):
 *   still `checking`, since the moderation cron screens it again within
 *   minutes;
 * - any other `hold`: held for a person, as `graded-work` when that's why;
 * - `remove`: removed.
 */
export function chatModeration(
  decision: ModerationDecision,
  reasons: readonly ModerationReason[],
): Moderation {
  if (decision === "publish") return { state: "visible" };
  if (decision === "remove") return { state: "removed" };
  if (needsRetry(reasons)) return { state: "held", reason: "checking" };
  const blocking = reasons.filter((r) => r.action !== "flag");
  const reason: HeldReason = blocking.some((r) => GRADED_WORK.has(r.code))
    ? "graded-work"
    : "flagged";
  return { state: "held", reason };
}
