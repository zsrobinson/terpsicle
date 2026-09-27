import type { ChatAuthor } from "../schema";

// @-mentions (V2.md §6.1, §8.6). A message names a classmate with "@" and
// their name as Chat shows it; the composer's autocomplete writes the full
// name. Names resolve only against the room's members, so a mention can't
// reach someone who can't read the room. Nothing about a mention is stored
// in the message: the object resolves them each time it's published.

/** Mentions that notify, per message (V2.md §8.4). */
export const CHAT_MENTIONS_MAX = 5;

export type Mentionable = Pick<ChatAuthor, "directoryId" | "name">;

const WORD = /[\p{L}\p{N}_]/u;
const fold = (s: string) => s.toLocaleLowerCase("en-US");

/** Whether an "@" at `i` starts a mention: not inside a word or an email address. */
function startsMention(text: string, i: number): boolean {
  const before = text[i - 1];
  return before === undefined || !(WORD.test(before) || before === ".");
}

/** The member `rest` starts with: a full name, else a first name only one member has. */
function memberAt(
  rest: string,
  members: readonly Mentionable[],
): Mentionable | null {
  const lower = fold(rest);
  let best: Mentionable | null = null;
  for (const m of members) {
    const name = fold(m.name.trim());
    if (!name || !lower.startsWith(name)) continue;
    const after = rest[name.length];
    if (after !== undefined && WORD.test(after)) continue;
    if (!best || name.length > best.name.trim().length) best = m;
  }
  if (best) return best;
  // "@Omar's notes" names Omar.
  const first = /^[\p{L}\p{N}'’-]+/u.exec(rest)?.[0]?.replace(/['’]s?$/u, "");
  if (!first) return null;
  const same = members.filter(
    (m) => fold(m.name.trim().split(/\s+/)[0] ?? "") === fold(first),
  );
  return same.length === 1 ? (same[0] ?? null) : null;
}

/**
 * Who a message mentions, in order of first mention: "@Hannah Lee", or
 * "@Hannah" when only one member is called Hannah. At most
 * `CHAT_MENTIONS_MAX`, never the author, each person once.
 */
export function findMentions(
  text: string,
  members: readonly Mentionable[],
  author: string,
): string[] {
  const found: string[] = [];
  for (let i = text.indexOf("@"); i >= 0; i = text.indexOf("@", i + 1)) {
    if (!startsMention(text, i)) continue;
    const who = memberAt(text.slice(i + 1), members);
    if (!who || who.directoryId === author || found.includes(who.directoryId))
      continue;
    found.push(who.directoryId);
    if (found.length === CHAT_MENTIONS_MAX) break;
  }
  return found;
}

// ---------- the composer's autocomplete ----------

/** The "@…" being typed: where its "@" is, and what follows it up to the caret. */
export type MentionDraft = { readonly start: number; readonly query: string };

/** Longest query the autocomplete keeps up with (a long name and a bit). */
const QUERY_MAX = 40;

/**
 * The mention being typed just before the caret, or null: an "@" that
 * starts a mention, then up to 40 characters of a name (letters, spaces,
 * apostrophes, hyphens), not starting with a space.
 */
export function mentionDraft(text: string, caret: number): MentionDraft | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0 || !startsMention(text, at)) return null;
  const query = before.slice(at + 1);
  if (
    query.length > QUERY_MAX ||
    !/^(?:[\p{L}\p{N}'’.-][\p{L}\p{N}'’. -]*)?$/u.test(query)
  )
    return null;
  return { start: at, query };
}

/** Members whose name, or a word of it, starts with the query; by name. */
export function mentionMatches<M extends Mentionable>(
  members: readonly M[],
  query: string,
  limit = 6,
): M[] {
  const q = fold(query.trim());
  return members
    .filter((m) => {
      const name = fold(m.name);
      return (
        name.startsWith(q) || name.split(/\s+/).some((w) => w.startsWith(q))
      );
    })
    .slice(0, limit);
}

/** The draft with "@Name " in place of the typed "@…", and where the caret goes. */
export function insertMention(
  text: string,
  draft: MentionDraft,
  caret: number,
  name: string,
): { text: string; caret: number } {
  const mention = `@${name} `;
  const rest = text.slice(caret).replace(/^ /, "");
  return {
    text: text.slice(0, draft.start) + mention + rest,
    caret: draft.start + mention.length,
  };
}
