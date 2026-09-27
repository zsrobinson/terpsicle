// The deterministic checks that run before any model: cheap, explainable, and
// still working when Workers AI is down. Each finding is a reason with the
// span it matched, so the composer can point at the exact words.
import type {
  ModerationAction,
  ModerationContext,
  ModerationKind,
  ModerationReason,
  ReasonCode,
} from "~/core/schema";
import { findContacts } from "./contact";
import { findIntegrityIssues } from "./integrity";
import { LENGTH_LIMITS } from "./limits";
import { findLinks, isAllowedHost, isCheatingHost } from "./links";
import { findBlockedWords } from "./words";

export interface PrecheckInput {
  kind: ModerationKind;
  text: string;
  context?: Pick<ModerationContext, "activeAssignments">;
}

const rule = (
  code: ModerationReason["code"],
  action: ModerationAction,
  span?: [number, number],
): ModerationReason =>
  span
    ? { code, source: "rules", action, span }
    : { code, source: "rules", action };

type RuleCode =
  | "slur"
  | "blocked-word"
  | "insult"
  | "link"
  | "cheating-site"
  | "email"
  | "phone"
  | "address"
  | "uid"
  | "shares-answers"
  | "asks-for-answers"
  | "code-paste";

/**
 * What each finding does, per kind; null lets it through without a word.
 *
 * Reviews are anonymous and about teaching, so contact details, links and
 * anything like answers wait for a person.
 *
 * Chat is lighter (the owner, 2026-09-27): study groups swap numbers, rooms
 * and links, people vent and ask for help, and pasted code is how you ask
 * about a bug. Only slurs and blocked words act. Answer lists and
 * answer-sharing sites only flag: nothing holds, the author may see a
 * one-time nudge (`answersHint`), and the room rules ask kindly. A UID is
 * still held unless it's the writer's own: it's the one detail that's
 * private on its face.
 */
const ACTIONS: Readonly<
  Record<ModerationKind, Readonly<Record<RuleCode, ModerationAction | null>>>
> = {
  review: {
    slur: "remove",
    "blocked-word": "hold",
    insult: "flag",
    link: "hold",
    "cheating-site": "hold",
    email: "hold",
    phone: "hold",
    address: "hold",
    uid: "hold",
    "shares-answers": "hold",
    "asks-for-answers": "flag",
    "code-paste": "hold",
  },
  chat: {
    slur: "remove",
    "blocked-word": "hold",
    insult: null,
    link: null,
    "cheating-site": "flag",
    email: null,
    phone: null,
    address: null,
    uid: "hold",
    "shares-answers": "flag",
    "asks-for-answers": null,
    "code-paste": null,
  },
};

export function precheck({
  kind,
  text,
  context,
}: PrecheckInput): ModerationReason[] {
  const trimmed = text.trim();
  const limits = LENGTH_LIMITS[kind];
  if (trimmed.length === 0) return [rule("empty", "remove")];
  if (trimmed.length > limits.max) return [rule("too-long", "remove")];
  if (trimmed.length < limits.min) return [rule("too-short", "remove")];

  const actions = ACTIONS[kind];
  const reasons: ModerationReason[] = [];
  const add = (code: RuleCode, span: [number, number]) => {
    const action = actions[code];
    if (action) reasons.push(rule(code, action, span));
  };

  for (const word of findBlockedWords(text)) add(word.tier, word.span);

  for (const link of findLinks(text)) {
    if (isCheatingHost(link.host)) add("cheating-site", link.span);
    else if (!isAllowedHost(link.host)) add("link", link.span);
  }

  for (const contact of findContacts(text)) {
    // In chat, people share their own details to form study groups.
    if (kind === "chat" && contact.own) continue;
    add(contact.kind, contact.span);
  }

  // The weak patterns only ever ask the model to read it (reviews).
  for (const issue of findIntegrityIssues(text, {
    activeAssignments: context?.activeAssignments ?? false,
  }))
    add(issue.code, issue.span);

  return reasons;
}

/** What makes the chat composer's one-time nudge about graded answers. */
const ANSWER_CODES: ReadonlySet<ReasonCode> = new Set([
  "shares-answers",
  "cheating-site",
]);

/**
 * Whether a chat draft looks like it shares answers to graded work (an
 * answer list, "here are the answers", an answer-sharing site). The
 * composer nudges its author once; the message still sends.
 */
export function answersHint(text: string): boolean {
  return precheck({ kind: "chat", text }).some((r) => ANSWER_CODES.has(r.code));
}

// Whole messages that can't break a rule, so chat publishes them without
// asking a model: the most common short replies, and messages with no
// letters or digits at all (emoji, "?", "!!"). Kept deliberately short;
// anything else is read as usual.
const TRIVIAL_REPLIES: ReadonlySet<string> = new Set([
  "ok",
  "okay",
  "k",
  "kk",
  "yes",
  "yeah",
  "yep",
  "yup",
  "no",
  "nope",
  "same",
  "same here",
  "me too",
  "thanks",
  "thank you",
  "thx",
  "ty",
  "tysm",
  "np",
  "lol",
  "lmao",
  "haha",
  "nice",
  "cool",
  "got it",
  "sounds good",
  "agreed",
  "+1",
  "bump",
]);

/**
 * A chat message too small to need a model: one of the common short
 * replies, or no letters or digits at all. Saves both model calls on the
 * busiest kind of message.
 */
export function isTrivialChat(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  if (!/[\p{L}\p{N}]/u.test(trimmed)) return trimmed.length <= 12;
  const words = trimmed
    .toLowerCase()
    .replace(/[.!?,~]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return TRIVIAL_REPLIES.has(words);
}
