import type { TermId } from "~/core/schema";
import type { HistoryDept } from "~/core/schema/history";

// Offering patterns (docs/decisions.md, "Offering patterns from the
// history"): which courses run every fall and spring, which once a year in a
// fixed season, and which every other year, read from the instructor
// history (DATA.md §3.5). The history has gaps (terms no source has yet), so
// every rate counts only the terms on record: a missing term is unknown,
// never "not offered". Time comes in as `now`, the newest term Testudo
// lists.

export type Season = "fall" | "spring";

export type OfferingPattern =
  | { kind: "every-semester" }
  /** Every fall (or spring), and some of the other. */
  | { kind: "leans"; season: Season }
  /** "Fall only": every fall, (almost) never in spring. */
  | { kind: "once-a-year"; season: Season }
  /** Every other fall (or spring): even or odd calendar years. */
  | { kind: "alternate-years"; season: Season; parity: "even" | "odd" }
  /** Only in summers and winters. */
  | { kind: "summer-or-winter"; seasons: ("summer" | "winter")[] }
  /** Three or more offerings with no fixed season; `lean` from recent years. */
  | { kind: "irregular"; lean: Season | null }
  /** One or two offerings in the window. */
  | { kind: "rare" }
  /** First offered in the last three years: too soon to say. */
  | { kind: "new" }
  /** First on record this school year, or never: nothing to read. */
  | { kind: "no-history" }
  /** Nothing in the last three years on record. */
  | { kind: "discontinued"; last: TermId };

export type OfferingConfidence = "high" | "medium" | "low";

export interface SeasonCount {
  readonly offered: number;
  readonly onRecord: number;
}

export interface OfferingSummary {
  readonly pattern: OfferingPattern;
  readonly confidence: OfferingConfidence;
  /** The newest term on record it ran in, any season; null for none. */
  readonly lastOffered: TermId | null;
  /** Where its span starts: its first fall or spring, or the window's start. */
  readonly since: TermId | null;
  /** Fall and spring terms on record in its span. */
  readonly onRecord: number;
  /** How many of those it ran in. */
  readonly offered: number;
  readonly falls: SeasonCount;
  readonly springs: SeasonCount;
}

/** How far back a pattern looks, in school years. */
export const OFFERING_YEARS = 8;
/** A season it runs in "every" year: at least this share of them. */
const EVERY = 0.75;
/** A season it "never" runs in: at most this share. */
const NEVER = 0.15;
/** Alternate years: the off years' share at most, and the other season's. */
const OFF_YEARS = 0.2;
const OTHER_SEASON = 0.3;
/** Alternate years need this many of each year's parity on record. */
const MIN_PER_PARITY = 3;
/** First offered within this many school years: new. Nothing in them: discontinued. */
const RECENT_YEARS = 3;
/** An irregular course leans to a season this far ahead of the other. */
const LEAN_MARGIN = 0.25;

const year = (term: TermId) => Number(term.slice(0, 4));
const isFall = (term: TermId) => term.endsWith("08");
const isSpring = (term: TermId) => term.endsWith("01");
const isSemester = (term: TermId) => isFall(term) || isSpring(term);

function seasonOf(term: TermId): Season | "summer" | "winter" {
  if (isFall(term)) return "fall";
  if (isSpring(term)) return "spring";
  return term.endsWith("05") ? "summer" : "winter";
}

/** The school year a term is in, by the year its fall starts; a summer goes with the spring before it. */
function schoolYear(term: TermId): number {
  return isFall(term) || term.endsWith("12") ? year(term) : year(term) - 1;
}

const fallOf = (schoolYearStart: number): TermId => `${schoolYearStart}08`;
/** The summer just before a school year: where "this school year" starts for a new course. */
const summerBefore = (schoolYearStart: number): TermId =>
  `${schoolYearStart}05`;

/** The fall or spring after a term. */
function nextSemester(term: TermId): TermId {
  return isSpring(term) || term.endsWith("05")
    ? `${year(term)}08`
    : `${year(term) + 1}01`;
}

/** Falls and springs from `from` (or the next one) through `to`. */
function semesters(from: TermId, to: TermId): TermId[] {
  const out: TermId[] = [];
  for (
    let term = isSemester(from) ? from : nextSemester(from);
    term <= to;
    term = nextSemester(term)
  )
    out.push(term);
  return out;
}

const rate = (c: SeasonCount) =>
  c.onRecord === 0 ? 0 : c.offered / c.onRecord;

function count(
  terms: readonly TermId[],
  offered: ReadonlySet<TermId>,
  keep: (term: TermId) => boolean,
): SeasonCount {
  const kept = terms.filter(keep);
  return {
    offered: kept.filter((t) => offered.has(t)).length,
    onRecord: kept.length,
  };
}

function confidenceFor(onRecord: number): OfferingConfidence {
  return onRecord >= 10 ? "high" : onRecord >= 6 ? "medium" : "low";
}

const cap = (
  confidence: OfferingConfidence,
  most: OfferingConfidence,
): OfferingConfidence =>
  confidence === "high" && most !== "high" ? most : confidence;

/** Alternate years in `season`, if the record shows them. */
function alternateParity(
  season: Season,
  span: readonly TermId[],
  offered: ReadonlySet<TermId>,
): "even" | "odd" | null {
  const inSeason = span.filter((t) => seasonOf(t) === season);
  const even = count(inSeason, offered, (t) => year(t) % 2 === 0);
  const odd = count(inSeason, offered, (t) => year(t) % 2 === 1);
  if (even.onRecord < MIN_PER_PARITY || odd.onRecord < MIN_PER_PARITY)
    return null;
  if (rate(even) >= EVERY && rate(odd) <= OFF_YEARS) return "even";
  if (rate(odd) >= EVERY && rate(even) <= OFF_YEARS) return "odd";
  return null;
}

/** The season a course with no fixed one has favored lately, if any. */
function leanOf(falls: SeasonCount, springs: SeasonCount): Season | null {
  const f = rate(falls);
  const s = rate(springs);
  if (f - s >= LEAN_MARGIN && f >= 0.5) return "fall";
  if (s - f >= LEAN_MARGIN && s >= 0.5) return "spring";
  return null;
}

/**
 * A course's pattern over the `years` school years up to `now` (the newest
 * term Testudo lists). `offered` is every term on record it ran in, merged
 * with its cross-listings; `recorded` is every term the history covers.
 * Rates count only fall and spring terms on record, from its first offering
 * (or the window's start, if it's older).
 */
export function offeringSummary(input: {
  readonly offered: ReadonlySet<TermId>;
  readonly recorded: ReadonlySet<TermId>;
  readonly now: TermId;
  readonly years?: number;
}): OfferingSummary {
  const { offered, recorded, now } = input;
  const thisYear = schoolYear(now);
  const windowStart = fallOf(thisYear - (input.years ?? OFFERING_YEARS));
  const ran = [...offered].filter((t) => t <= now).sort();
  const first = ran[0] ?? null;
  const lastOffered = ran.at(-1) ?? null;
  const recentStart = fallOf(thisYear - RECENT_YEARS);
  const base = {
    lastOffered,
    since: null,
    onRecord: 0,
    offered: 0,
    falls: { offered: 0, onRecord: 0 },
    springs: { offered: 0, onRecord: 0 },
  };

  if (first === null || lastOffered === null)
    return { ...base, pattern: { kind: "no-history" }, confidence: "low" };

  const onRecord = (from: TermId) =>
    semesters(from, now).filter((t) => recorded.has(t));
  const recentOnRecord = onRecord(recentStart);
  // Gone quiet: nothing in any term on record for three years.
  if (lastOffered < recentStart && recentOnRecord.length > 0) {
    const pattern = { kind: "discontinued", last: lastOffered } as const;
    return {
      ...base,
      pattern,
      confidence: confidenceFor(recentOnRecord.length),
    };
  }

  const inWindow = ran.filter((t) => t >= windowStart);
  const semestersRan = inWindow.filter(isSemester);
  if (semestersRan.length === 0) {
    const others = inWindow.filter((t) => !isSemester(t));
    if (others.length > 0) {
      const seasons = (["summer", "winter"] as const).filter((s) =>
        others.some((t) => seasonOf(t) === s),
      );
      const seen = [...recorded].filter(
        (t) =>
          t >= windowStart &&
          t <= now &&
          seasons.some((s) => seasonOf(t) === s),
      ).length;
      return {
        ...base,
        pattern: { kind: "summer-or-winter", seasons },
        // One summer or winter isn't a pattern yet.
        confidence: others.length < 2 ? "low" : confidenceFor(seen),
      };
    }
  }

  if (first >= summerBefore(thisYear))
    return { ...base, pattern: { kind: "no-history" }, confidence: "low" };

  const since = first > windowStart ? first : windowStart;
  const span = onRecord(since);
  const falls = count(span, offered, isFall);
  const springs = count(span, offered, isSpring);
  const facts = {
    lastOffered,
    since: span[0] ?? null,
    onRecord: span.length,
    offered: falls.offered + springs.offered,
    falls,
    springs,
  };
  const confidence = confidenceFor(span.length);

  if (first >= summerBefore(thisYear - RECENT_YEARS))
    // When it started is a fact; what it'll do isn't known yet.
    return { ...facts, pattern: { kind: "new" }, confidence: "medium" };
  if (facts.offered <= 2)
    return { ...facts, pattern: { kind: "rare" }, confidence };

  const f = rate(falls);
  const s = rate(springs);
  const seasonal = (pattern: OfferingPattern): OfferingSummary => ({
    ...facts,
    pattern,
    confidence,
  });
  if (f >= EVERY && s >= EVERY) return seasonal({ kind: "every-semester" });
  if (f >= EVERY && s <= NEVER)
    return seasonal({ kind: "once-a-year", season: "fall" });
  if (s >= EVERY && f <= NEVER)
    return seasonal({ kind: "once-a-year", season: "spring" });
  if (f >= EVERY) return seasonal({ kind: "leans", season: "fall" });
  if (s >= EVERY) return seasonal({ kind: "leans", season: "spring" });

  for (const season of ["fall", "spring"] as const) {
    const other = season === "fall" ? s : f;
    const parity =
      other <= OTHER_SEASON ? alternateParity(season, span, offered) : null;
    if (parity) {
      // The last two school years are an alternate-year course's latest
      // beat: while one of their terms isn't on record, it could have
      // changed step unseen.
      const gap = semesters(fallOf(thisYear - 2), now).some(
        (t) => t < now && !recorded.has(t),
      );
      return {
        ...facts,
        pattern: { kind: "alternate-years", season, parity },
        confidence: gap ? cap(confidence, "medium") : confidence,
      };
    }
  }

  // Recent years say where a course that moved seasons went.
  const recent = recentOnRecord.filter((t) => t >= since);
  const recentFalls = count(recent, offered, isFall);
  const recentSprings = count(recent, offered, isSpring);
  const lean =
    recentFalls.onRecord > 0 && recentSprings.onRecord > 0
      ? leanOf(recentFalls, recentSprings)
      : leanOf(falls, springs);
  return seasonal({ kind: "irregular", lean });
}

/** What the pattern alone says about a term: likely, unlikely or unknown. */
function patternLikelihood(
  summary: OfferingSummary,
  termId: TermId,
): "likely" | "unlikely" | "unknown" {
  if (summary.confidence === "low") return "unknown";
  const { pattern } = summary;
  const season = seasonOf(termId);
  if (pattern.kind === "summer-or-winter") {
    if (season === "fall" || season === "spring") return "unlikely";
    return pattern.seasons.includes(season) ? "likely" : "unknown";
  }
  if (season === "summer" || season === "winter") return "unknown";
  switch (pattern.kind) {
    case "every-semester":
      return "likely";
    case "leans":
      return season === pattern.season ? "likely" : "unknown";
    case "once-a-year":
      return season === pattern.season ? "likely" : "unlikely";
    case "alternate-years": {
      const parity = year(termId) % 2 === 0 ? "even" : "odd";
      return season === pattern.season && parity === pattern.parity
        ? "likely"
        : "unlikely";
    }
    case "discontinued":
      return "unlikely";
    default:
      return "unknown";
  }
}

/**
 * Will it likely run in `termId`? A term Testudo lists answers for itself
 * ("yes" or "no", from `offered`); any other term, from the pattern.
 */
export function offeredLikelihood(
  summary: OfferingSummary,
  termId: TermId,
  listed: ReadonlySet<TermId>,
  offered: ReadonlySet<TermId>,
): "yes" | "no" | "likely" | "unlikely" | "unknown" {
  if (listed.has(termId)) return offered.has(termId) ? "yes" : "no";
  return patternLikelihood(summary, termId);
}

/** How far ahead `nextLikelyTerm` looks, in falls and springs. */
const LOOK_AHEAD = 8;

/** The first fall or spring after `after` the pattern says it likely runs in, or null. */
export function nextLikelyTerm(
  summary: OfferingSummary,
  after: TermId,
): TermId | null {
  let term = nextSemester(after);
  for (let i = 0; i < LOOK_AHEAD; i++, term = nextSemester(term))
    if (patternLikelihood(summary, term) === "likely") return term;
  return null;
}

/**
 * When it runs next after `after`: a later term Testudo lists that has it
 * (`likely: false`, a fact), else the pattern's next likely term past the
 * listed ones. Null when neither knows.
 */
export function nextOffering(
  summary: OfferingSummary,
  after: TermId,
  listed: ReadonlySet<TermId>,
  offered: ReadonlySet<TermId>,
): { termId: TermId; likely: boolean } | null {
  const later = [...listed].filter((t) => t > after).sort();
  const listedNext = later.find((t) => offered.has(t));
  if (listedNext) return { termId: listedNext, likely: false };
  const termId = nextLikelyTerm(summary, later.at(-1) ?? after);
  return termId ? { termId, likely: true } : null;
}

const SEASON_WORD = { fall: "Fall", spring: "Spring" } as const;

/**
 * The pattern in a few plain words, for "Usually offered: …": "Spring only",
 * "Every other fall", "Every fall, some springs". Null when there's no
 * pattern to tell (every semester, new, no history, discontinued).
 */
export function offeringWords(pattern: OfferingPattern): string | null {
  switch (pattern.kind) {
    case "leans":
      return pattern.season === "fall"
        ? "Every fall, some springs"
        : "Every spring, some falls";
    case "once-a-year":
      return `${SEASON_WORD[pattern.season]} only`;
    case "alternate-years":
      return `Every other ${pattern.season}`;
    case "summer-or-winter":
      return pattern.seasons.length === 1
        ? `${pattern.seasons[0] === "summer" ? "Summer" : "Winter"} only`
        : "Summer and winter only";
    case "irregular":
      return pattern.lean ? `Mostly ${pattern.lean}` : "No fixed season";
    case "rare":
      return "Rarely";
    default:
      return null;
  }
}

/**
 * The words worth showing beside a course: a season it keeps to, when the
 * record backs it. Null for every-semester courses and for ones with no
 * season to tell (rare, irregular with no lean, special topics), so the
 * line only appears when it's news.
 */
export function offeringNews(summary: OfferingSummary): string | null {
  if (summary.confidence === "low") return null;
  const { pattern } = summary;
  if (pattern.kind === "irregular" && pattern.lean === null) return null;
  if (
    pattern.kind === "leans" ||
    pattern.kind === "once-a-year" ||
    pattern.kind === "alternate-years" ||
    pattern.kind === "summer-or-winter" ||
    pattern.kind === "irregular"
  )
    return offeringWords(pattern);
  return null;
}

/** "7 of the 8 springs", "no fall". */
function seasonShare(count: SeasonCount, season: Season): string {
  if (count.offered === 0) return `no ${season}`;
  return `${count.offered} of the ${count.onRecord} ${season}s`;
}

/**
 * What the record shows, its own season first: "Offered in 7 of the 8
 * springs on record since 2019, and in no fall." Null with no span to count.
 */
export function offeringRecord(summary: OfferingSummary): string | null {
  if (!summary.since || summary.onRecord === 0) return null;
  const { pattern } = summary;
  const first: Season =
    pattern.kind === "leans" ||
    pattern.kind === "once-a-year" ||
    pattern.kind === "alternate-years"
      ? pattern.season
      : pattern.kind === "irregular" && pattern.lean
        ? pattern.lean
        : summary.springs.offered > summary.falls.offered
          ? "spring"
          : "fall";
  const [mine, other, otherSeason] =
    first === "fall"
      ? [summary.falls, summary.springs, "spring" as const]
      : [summary.springs, summary.falls, "fall" as const];
  return `Offered in ${seasonShare(mine, first)} on record since ${year(summary.since)}, and in ${seasonShare(other, otherSeason)}.`;
}

/**
 * The line beside a course: its pattern's words and when it runs next
 * after `after` ("Every other fall", Fall 2028, likely). Null when the
 * pattern isn't news (`offeringNews`).
 */
export function offeringLine(
  summary: OfferingSummary,
  after: TermId,
  listed: ReadonlySet<TermId>,
  offered: ReadonlySet<TermId>,
): { words: string; next: { termId: TermId; likely: boolean } | null } | null {
  const words = offeringNews(summary);
  if (!words) return null;
  return { words, next: nextOffering(summary, after, listed, offered) };
}

export type StripCell = {
  readonly termId: TermId;
  readonly state: "offered" | "not-offered" | "not-on-record";
};

/** The window's falls and springs, oldest first, each offered, not, or not on record. */
export function offeringStrip(input: {
  readonly offered: ReadonlySet<TermId>;
  readonly recorded: ReadonlySet<TermId>;
  readonly now: TermId;
  readonly years?: number;
}): StripCell[] {
  const { offered, recorded, now } = input;
  const start = fallOf(schoolYear(now) - (input.years ?? OFFERING_YEARS));
  return semesters(start, now).map((termId) => ({
    termId,
    state: offered.has(termId)
      ? "offered"
      : recorded.has(termId)
        ? "not-offered"
        : "not-on-record",
  }));
}

/**
 * Every term on record in which any of `codes` ran (a course and its
 * cross-listings: PlanetTerp files a cross-listed course under one code),
 * from their departments' history files. A department not given is skipped.
 */
export function offeredTermsIn(
  depts: ReadonlyMap<string, HistoryDept>,
  codes: readonly string[],
): Set<TermId> {
  const out = new Set<TermId>();
  for (const code of codes) {
    const course = depts
      .get(code.slice(0, 4))
      ?.courses.find((c) => c.code === code);
    for (const offering of course?.offerings ?? []) out.add(offering.termId);
  }
  return out;
}
