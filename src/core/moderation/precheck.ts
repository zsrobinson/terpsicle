// The deterministic checks that run before any model: cheap, explainable, and
// still working when Workers AI is down. Each finding is a reason with the
// span it matched, so the composer can point at the exact words.
import type {
  ModerationAction,
  ModerationContext,
  ModerationKind,
  ModerationReason,
} from "~/core/schema";
import { findContacts } from "./contact";
import { findIntegrityIssues } from "./integrity";
import { LENGTH_LIMITS } from "./limits";
import { findLinks, isAllowedHost, isCheatingHost } from "./links";
import { findBlockedWords, type WordTier } from "./words";

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

const WORD_ACTIONS: Readonly<Record<WordTier, ModerationAction>> = {
  slur: "remove",
  "blocked-word": "hold",
  insult: "flag",
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

  const reasons: ModerationReason[] = [];

  for (const word of findBlockedWords(text))
    reasons.push(rule(word.tier, WORD_ACTIONS[word.tier], word.span));

  for (const link of findLinks(text)) {
    if (isCheatingHost(link.host))
      reasons.push(rule("cheating-site", "hold", link.span));
    else if (!isAllowedHost(link.host))
      // Reviews have no reason to link out. In chat a link is often a study
      // doc or a club page, so the policy model reads it.
      reasons.push(
        rule("link", kind === "review" ? "hold" : "flag", link.span),
      );
  }

  for (const contact of findContacts(text)) {
    // In chat, people share their own number to form study groups.
    if (kind === "chat" && contact.own) continue;
    reasons.push(rule(contact.kind, "hold", contact.span));
  }

  for (const issue of findIntegrityIssues(text, {
    activeAssignments: context?.activeAssignments ?? false,
  }))
    reasons.push(rule(issue.code, issue.strong ? "hold" : "flag", issue.span));

  return reasons;
}
