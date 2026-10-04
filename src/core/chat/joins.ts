import type { ChatAuthor } from "../schema";
import { campusDay } from "./talk-words";

// Joins in a room's timeline, the way GroupMe shows them (the owner,
// 2026-09-29: "a small status thing like groupme when someone joins the
// room, grouped up so it doesn't clog things up"): everyone who joined
// between two messages on one day is one quiet line, "Alex, Sam and 3
// others joined", instead of a list of people.

export type Join = { readonly author: ChatAuthor; readonly at: string };

export type JoinGroup = {
  /** The message the line sits just before; null for after the last one. */
  readonly before: string | null;
  readonly people: readonly ChatAuthor[];
  /** The last of its joins, for its tooltip and its key. */
  readonly at: string;
};

/**
 * The joins between `messages` (oldest first), one group per gap between
 * two messages per campus day. Joins before the first message shown are
 * dropped while older messages are still to load (`complete` false): they
 * belong with those.
 */
export function joinGroups(
  joins: readonly Join[],
  messages: readonly { readonly id: string; readonly createdAt: string }[],
  { complete }: { complete: boolean },
): JoinGroup[] {
  const sorted = [...joins].sort((a, b) => a.at.localeCompare(b.at));
  const first = messages[0];
  const groups: {
    before: string | null;
    day: string;
    people: ChatAuthor[];
    at: string;
  }[] = [];
  let m = 0;
  for (const join of sorted) {
    if (!complete && first && join.at < first.createdAt) continue;
    while (m < messages.length && (messages[m]?.createdAt ?? "") <= join.at)
      m++;
    const before = messages[m]?.id ?? null;
    const day = campusDay(join.at);
    const last = groups.at(-1);
    if (last && last.before === before && last.day === day) {
      if (!last.people.some((p) => p.directoryId === join.author.directoryId))
        last.people.push(join.author);
      last.at = join.at;
    } else groups.push({ before, day, people: [join.author], at: join.at });
  }
  return groups.map(({ before, people, at }) => ({ before, people, at }));
}

/** "Alex joined", "Alex and Sam joined", "Alex, Sam and 3 others joined"; you're "You". */
export function joinWords(
  people: readonly ChatAuthor[],
  you: string | null = null,
): string {
  // You come first: "You and Alex joined".
  const ordered = [
    ...people.filter((p) => p.directoryId === you),
    ...people.filter((p) => p.directoryId !== you),
  ];
  const names = ordered.map((p) =>
    p.directoryId === you ? "You" : (p.name.trim().split(/\s+/)[0] ?? p.name),
  );
  const [a, b, c] = names;
  if (a === undefined) return "";
  if (b === undefined) return `${a} joined`;
  if (c === undefined) return `${a} and ${b} joined`;
  if (names.length === 3) return `${a}, ${b} and ${c} joined`;
  return `${a}, ${b} and ${names.length - 2} others joined`;
}
