import { instructorNameKey } from "~/core/schema";

// Testudo instructor name → PlanetTerp slug. A wrong rating on the wrong
// person is worse than none, so every rule past an exact or normalized match
// needs course evidence, and a tie between candidates matches nobody.
//
// Rules, in order (measured on 2026-09-25: 3,904 Testudo names, 394 without
// an exact match; see the PR for the spot checks):
// - exact: `instructorNameKey` equality (the original join).
// - alias: the hand-checked map in aliases.json.
// - normalized: equal once accents, apostrophes, punctuation, spacing,
//   parentheticals ("Amber Johnson (ENME)") and suffixes are ignored.
// - nickname: same surname, given names that are nickname forms ("Liz" and
//   "Elizabeth").
// - extra-names: one side has extra middle names, initials or surname parts
//   ("Brittany L Williams", "Evelyn Covington-Moore" and "Evelyn Covington").
// - short-name: one given name starts the other ("Kris", "Kristina").
// - initial: a given-name initial ("N Parker" and "Naomi Parker").

export type MatchRule =
  | "exact"
  | "alias"
  | "normalized"
  | "nickname"
  | "extra-names"
  | "short-name"
  | "initial";

export const MATCH_RULES: readonly MatchRule[] = [
  "exact",
  "alias",
  "normalized",
  "nickname",
  "extra-names",
  "short-name",
  "initial",
];

export interface PlanetTerpPerson {
  slug: string;
  name: string;
  type: "professor" | "ta";
  /** Every course PlanetTerp lists for them, any semester. */
  courses: ReadonlySet<string>;
  reviewCount: number;
}

export interface NameMatch {
  slug: string;
  rule: MatchRule;
}

export interface NameMatcher {
  /** Best slug for a Testudo instructor who teaches `courses`, or null. */
  match(testudoName: string, courses: ReadonlySet<string>): NameMatch | null;
  /** Exact-name lookup, for names that come from PlanetTerp itself (grade rows). */
  exact(name: string, courses: ReadonlySet<string>): string | null;
}

// Groups of names that are forms of one another. Only well-known English
// short forms; anything rarer belongs in aliases.json.
const NICKNAME_GROUPS: readonly (readonly string[])[] = [
  ["abigail", "abby"],
  ["alexander", "alex"],
  ["alexandra", "alex", "alexa", "lexi", "sandra"],
  ["andrew", "andy", "drew"],
  ["anthony", "tony"],
  ["benjamin", "ben"],
  ["charles", "charlie", "chuck"],
  ["christopher", "chris"],
  ["christina", "christine", "chris"],
  ["daniel", "dan", "danny"],
  ["david", "dave"],
  ["deborah", "debbie", "deb"],
  ["edward", "ed", "eddie", "ted"],
  ["elizabeth", "liz", "beth", "betsy", "eliza", "libby"],
  ["gregory", "greg"],
  ["jacob", "jake"],
  ["james", "jim", "jimmy", "jamie"],
  ["jeffrey", "jeff"],
  ["jennifer", "jen", "jenny"],
  ["jonathan", "jon"],
  ["joseph", "joe", "joey"],
  ["katherine", "kathryn", "catherine", "kathy", "cathy", "kate", "katie"],
  ["kenneth", "ken"],
  ["kimberly", "kim"],
  ["lawrence", "larry"],
  ["margaret", "maggie", "meg", "peggy"],
  ["matthew", "matt"],
  ["michael", "mike"],
  ["nathan", "nathaniel", "nate"],
  ["nicholas", "nick"],
  ["pamela", "pam"],
  ["patricia", "pat", "patty", "trish"],
  ["patrick", "pat"],
  ["rebecca", "becca", "becky"],
  ["richard", "rich", "rick"],
  ["robert", "rob", "bob", "bobby"],
  ["samantha", "sam"],
  ["samuel", "sam"],
  ["stephen", "steven", "steve"],
  ["susan", "sue", "suzy"],
  ["theodore", "ted", "theo"],
  ["thomas", "tom", "tommy"],
  ["timothy", "tim"],
  ["victoria", "tori", "vicky"],
  ["william", "will", "bill", "billy", "liam"],
  ["zachary", "zach", "zack"],
];

const NICKNAMES = new Map<string, Set<string>>();
for (const group of NICKNAME_GROUPS) {
  for (const name of group) {
    const set = NICKNAMES.get(name) ?? new Set<string>();
    for (const other of group) if (other !== name) set.add(other);
    NICKNAMES.set(name, set);
  }
}

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);

/**
 * Lowercase ASCII name parts: accents folded, apostrophes dropped ("O’Brien"
 * is "obrien"), hyphens and periods split, parentheticals and generational
 * suffixes removed.
 */
export function nameTokens(name: string): string[] {
  const tokens = name
    .replace(/\([^)]*\)/g, " ")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['‘’`]/g, "")
    .replace(/[^a-z]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  while (tokens.length > 2 && SUFFIXES.has(tokens[tokens.length - 1] ?? ""))
    tokens.pop();
  return tokens;
}

export type GivenNameRelation = "same" | "nickname" | "prefix" | "initial";

/** How two given names relate, best first; null when they can't be one person's. */
export function givenNameRelation(
  a: string,
  b: string,
): GivenNameRelation | null {
  if (a === b) return "same";
  if (NICKNAMES.get(a)?.has(b)) return "nickname";
  if (a.length === 1 || b.length === 1) return a[0] === b[0] ? "initial" : null;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  // Three letters at least: "Kris"/"Kristina", never "Al"/"Alice".
  if (short.length >= 3 && long.startsWith(short)) return "prefix";
  return null;
}

/** "same" when the parts after the given name are equal; "sub" when one side's are a proper subsequence of the other's. */
function otherNamesRelation(
  a: readonly string[],
  b: readonly string[],
): "same" | "sub" | null {
  if (a.length === 0 || b.length === 0) return null;
  if (a.length === b.length)
    return a.every((t, i) => t === b[i]) ? "same" : null;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  let i = 0;
  for (const token of long) if (token === short[i]) i++;
  return i === short.length ? "sub" : null;
}

const deptOf = (course: string) => course.slice(0, 4);

/** A course at most this many PlanetTerp people have taught is specific evidence on its own. */
const RARE_COURSE_TEACHERS = 3;

interface Evidence {
  /** Courses both lists share. */
  shared: number;
  /** One of the shared courses is rare on PlanetTerp. */
  rare: boolean;
  /** At least half of the candidate's courses are in departments the instructor teaches in. */
  focused: boolean;
}

/**
 * Two shared courses, or one that's rare or from a candidate who mostly
 * teaches in the instructor's departments. One shared course alone isn't
 * enough: PlanetTerp merges people by name, so a slug can carry a stray
 * course of someone else's.
 */
const strong = (e: Evidence) =>
  e.shared >= 2 || (e.shared >= 1 && (e.rare || e.focused));

interface Indexed extends PlanetTerpPerson {
  tokens: string[];
}

export function createNameMatcher(
  professors: readonly PlanetTerpPerson[],
  options: {
    /** instructorNameKey(Testudo name) → slug, from aliases.json. */
    aliases?: ReadonlyMap<string, string>;
    /** Every Testudo name being joined: a candidate who is exactly someone else there is that person. */
    testudoNames?: Iterable<string>;
  } = {},
): NameMatcher {
  const bySlug = new Map<string, Indexed>();
  const byKey = new Map<string, Indexed[]>();
  const byCompact = new Map<string, Indexed[]>();
  const bySurnameToken = new Map<string, Indexed[]>();
  const surnameCount = new Map<string, number>();
  const push = <K, V>(map: Map<K, V[]>, key: K, value: V) => {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
  };
  for (const p of professors) {
    const person: Indexed = { ...p, tokens: nameTokens(p.name) };
    bySlug.set(p.slug, person);
    push(byKey, instructorNameKey(p.name), person);
    if (person.tokens.length === 0) continue;
    push(byCompact, person.tokens.join(""), person);
    const rest = person.tokens.slice(1);
    for (const token of new Set(rest)) push(bySurnameToken, token, person);
    const surname = rest.join(" ");
    surnameCount.set(surname, (surnameCount.get(surname) ?? 0) + 1);
  }
  const teachers = new Map<string, number>();
  for (const p of professors)
    for (const c of p.courses) teachers.set(c, (teachers.get(c) ?? 0) + 1);

  const evidenceFor = (
    courses: ReadonlySet<string>,
    person: PlanetTerpPerson,
  ): Evidence => {
    let shared = 0;
    let rare = false;
    for (const c of courses) {
      if (!person.courses.has(c)) continue;
      shared++;
      if ((teachers.get(c) ?? 0) <= RARE_COURSE_TEACHERS) rare = true;
    }
    const depts = new Set([...courses].map(deptOf));
    let inDept = 0;
    for (const c of person.courses) if (depts.has(deptOf(c))) inDept++;
    return {
      shared,
      rare,
      focused: person.courses.size > 0 && inDept * 2 >= person.courses.size,
    };
  };
  const otherTestudo = new Set(
    [...(options.testudoNames ?? [])].map(instructorNameKey),
  );
  const aliases = options.aliases ?? new Map<string, string>();

  // Same-name slugs: the one who taught one of the same courses, then a
  // professor over a TA, then the one with more reviews.
  const pickAmong = (
    people: readonly Indexed[],
    courses: ReadonlySet<string>,
  ): string | null => {
    if (people.length <= 1) return people[0]?.slug ?? null;
    const score = (p: Indexed) => [
      [...courses].some((c) => p.courses.has(c)) ? 1 : 0,
      p.type === "professor" ? 1 : 0,
      p.reviewCount,
    ];
    return (
      [...people].sort((a, b) => compareDesc(score(a), score(b)))[0]?.slug ??
      null
    );
  };

  const exact = (name: string, courses: ReadonlySet<string>) =>
    pickAmong(byKey.get(instructorNameKey(name)) ?? [], courses);

  const GIVEN_RANK: Record<GivenNameRelation, number> = {
    same: 3,
    nickname: 2,
    prefix: 1,
    initial: 0,
  };

  const fuzzy = (
    tokens: readonly string[],
    courses: ReadonlySet<string>,
  ): NameMatch | null => {
    const [given, ...rest] = tokens;
    if (!given || rest.length === 0) return null;
    const candidates = new Set<Indexed>();
    for (const token of rest)
      for (const p of bySurnameToken.get(token) ?? []) candidates.add(p);
    const qualified: { p: Indexed; rule: MatchRule; rank: number[] }[] = [];
    for (const p of candidates) {
      // Someone teaching under exactly this name is a different person.
      if (otherTestudo.has(instructorNameKey(p.name))) continue;
      const [pGiven, ...pRest] = p.tokens;
      if (!pGiven) continue;
      const g = givenNameRelation(given, pGiven);
      const r = otherNamesRelation(rest, pRest);
      if (!g || !r) continue;
      const e = evidenceFor(courses, p);
      let rule: MatchRule | null = null;
      if (g === "prefix") rule = e.shared >= 2 ? "short-name" : null;
      else if (g === "initial") rule = strong(e) ? "initial" : null;
      else if (r === "sub") rule = strong(e) ? "extra-names" : null;
      else if (g === "nickname") {
        // With no shared course, a department match is enough only for a
        // surname nobody else on PlanetTerp has ("Steve"/"Steven Anlage").
        const unique = surnameCount.get(pRest.join(" ")) === 1;
        rule = strong(e) || (e.focused && unique) ? "nickname" : null;
      }
      if (rule)
        qualified.push({
          p,
          rule,
          rank: [GIVEN_RANK[g], r === "same" ? 1 : 0, e.shared],
        });
    }
    qualified.sort((a, b) => compareDesc(a.rank, b.rank));
    const [best, next] = qualified;
    if (!best) return null;
    if (next && compareDesc(best.rank, next.rank) === 0) return null;
    return { slug: best.p.slug, rule: best.rule };
  };

  return {
    exact,
    match(testudoName, courses) {
      const slug = exact(testudoName, courses);
      if (slug) return { slug, rule: "exact" };
      const alias = aliases.get(instructorNameKey(testudoName));
      if (alias && bySlug.has(alias)) return { slug: alias, rule: "alias" };
      const tokens = nameTokens(testudoName);
      if (tokens.length === 0) return null;
      const normalized = pickAmong(
        byCompact.get(tokens.join("")) ?? [],
        courses,
      );
      if (normalized) return { slug: normalized, rule: "normalized" };
      return fuzzy(tokens, courses);
    },
  };
}

/** Sorts score tuples highest first. */
function compareDesc(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (b[i] ?? 0) - (a[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
