import type { IsoDate, SyncedPrefs, TermId } from "../schema";

// Home's setup callouts (docs/V3.md §1.5; the owner, 2026-09-28: "a good
// way to drive adoption of those other features if we'd then have a
// callout to set them up from there"). For a product you haven't set up,
// one quiet card in the place its part of Home would be, saying what you'd
// get there. At most two at once, the most useful first; each one you
// close stays closed, on every device once you're signed in (a synced
// pref). Pure: the page gathers the facts and the date.

/** The callouts Home can show, one per thing to set up. */
export type CalloutId =
  /** Todo: no ELMS calendar connected. */
  | "todo"
  /** Chat: nothing in any of your class chats yet. */
  | "chat"
  /** Schedule: no plan for the term you register for next. */
  | "next-term"
  /** Plan: no four-year plan. */
  | "plan"
  /** Signed out: what signing in adds (Todo and Chat need an account). */
  | "sign-in";

/** What Home knows about what's set up. `null`: not known yet, so no callout. */
export type CalloutFacts = {
  signedIn: boolean;
  /** Signing in is on here. */
  signInOn: boolean;
  /** Todo is on, and signed in: whether an ELMS calendar is connected. */
  todo: { connected: boolean | null } | null;
  /** Chat is on, and signed in: whether any of your rooms has a message. */
  chat: { active: boolean | null } | null;
  /** Plan is on: whether there's a four-year plan here. */
  plan: { hasPlan: boolean } | null;
  /** The term you register for next, and whether it has a plan with courses. */
  nextTerm: { termId: TermId; planned: boolean } | null;
  /** The term in session, if any. */
  now: TermId | null;
};

/** At most this many callouts at once. */
export const CALLOUTS_MAX = 2;

/**
 * Whether `today` is when UMD students plan `next`: from October for a
 * spring (its schedule's out and registration opens late in the month),
 * from March for a fall (registration is in April).
 */
export function inRegistrationSeason(today: IsoDate, next: TermId): boolean {
  const month = Number(today.slice(5, 7));
  if (next.endsWith("01")) return month >= 10;
  if (next.endsWith("08")) return month >= 3 && month <= 8;
  return false;
}

/**
 * Which callouts to show, most useful first, at most `max`. Registration
 * season puts the next term's plan first; in a term, ELMS's deadlines come
 * next, since they matter every week; then Chat; the four-year plan, a
 * few times a year, last. Signed out, one callout for signing in stands
 * for Todo and Chat. Anything you've closed is left out.
 */
export function chooseCallouts(
  facts: CalloutFacts,
  dismissed: ReadonlySet<string>,
  today: IsoDate,
  max: number = CALLOUTS_MAX,
): CalloutId[] {
  const scored: [CalloutId, number][] = [];
  const next = facts.nextTerm;
  if (next && !next.planned)
    scored.push([
      "next-term",
      inRegistrationSeason(today, next.termId) ? 100 : 50,
    ]);
  if (facts.signedIn) {
    if (facts.todo?.connected === false)
      scored.push(["todo", facts.now ? 90 : 40]);
    if (facts.chat?.active === false && facts.now) scored.push(["chat", 60]);
  } else if (facts.signInOn) {
    scored.push(["sign-in", 80]);
  }
  if (facts.plan && !facts.plan.hasPlan) scored.push(["plan", 30]);
  return scored
    .filter(([id]) => !dismissed.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([id]) => id);
}

/** Longest list of closed callouts kept: a few ids, room for later ones. */
export const DISMISSED_CALLOUTS_MAX = 20;

/** The callouts you've closed. */
export function dismissedCallouts(prefs: SyncedPrefs): ReadonlySet<string> {
  return new Set(prefs.home?.dismissed ?? []);
}

/** The prefs with a callout closed (or open again, for Undo); the same object when nothing changes. */
export function withCalloutDismissed(
  prefs: SyncedPrefs,
  id: CalloutId,
  dismissed: boolean,
): SyncedPrefs {
  const had = prefs.home?.dismissed ?? [];
  if (had.includes(id) === dismissed) return prefs;
  const next = dismissed
    ? [...had, id].slice(-DISMISSED_CALLOUTS_MAX)
    : had.filter((d) => d !== id);
  return { ...prefs, home: { ...prefs.home, dismissed: next } };
}
