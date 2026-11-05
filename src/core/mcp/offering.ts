import { termLabel } from "../catalog/terms";
import {
  type OfferingSummary,
  offeredLikelihood,
  offeredTermsIn,
  offeringLine,
  offeringRecord,
  offeringStrip,
  offeringSummary,
  offeringText,
} from "../history/offering-pattern";
import type { CourseCode, DeptCode, TermId } from "../schema";
import type { HistoryDept } from "../schema/history";
import { termRef } from "./terms";

// When a course runs, for an agent (docs/MCP.md): the same offering
// pattern course details shows ("Usually offered", docs/decisions.md
// "Offering patterns from the history"), read the way Plan reads it
// (src/core/four-year/offerings.ts): the instructor history merged with the
// terms Testudo lists, a course merged with its cross-listings, and a term
// no source has counted as unknown, never as "not offered".

export type OfferingInput = {
  /** The course and its cross-listings: the codes its record is under. */
  readonly codes: readonly CourseCode[];
  /** The history's department files for those codes. */
  readonly history: ReadonlyMap<DeptCode, HistoryDept>;
  /** Every term the history covers. */
  readonly historyTerms: ReadonlySet<TermId>;
  /** Per code, the terms the course index saw it in (Testudo's own catalogs). */
  readonly indexOffered: ReadonlyMap<CourseCode, readonly TermId[]>;
  /** Terms Testudo lists now: their catalogs are facts, not patterns. */
  readonly listed: ReadonlySet<TermId>;
  /** The newest term Testudo lists. */
  readonly now: TermId;
};

export type CourseOfferingFacts = {
  readonly summary: OfferingSummary;
  readonly offered: ReadonlySet<TermId>;
  readonly recorded: ReadonlySet<TermId>;
  readonly listed: ReadonlySet<TermId>;
  readonly now: TermId;
};

export function courseOfferingFacts(input: OfferingInput): CourseOfferingFacts {
  const offered = offeredTermsIn(input.history, input.codes);
  for (const code of input.codes)
    for (const term of input.indexOffered.get(code) ?? []) offered.add(term);
  const recorded = new Set([...input.historyTerms, ...input.listed]);
  return {
    summary: offeringSummary({ offered, recorded, now: input.now }),
    offered,
    recorded,
    listed: input.listed,
    now: input.now,
  };
}

export type Likelihood = "yes" | "no" | "likely" | "unlikely" | "unknown";

/** What each answer means, for tool descriptions and answers alike. */
export const LIKELIHOOD_MEANING: Readonly<Record<Likelihood, string>> = {
  yes: "Testudo lists the term and the course is in it",
  no: "Testudo lists the term and the course isn't in it",
  likely: "the term isn't listed yet, and the pattern says it runs then",
  unlikely:
    "the term isn't listed yet, and the pattern says it doesn't run then",
  unknown: "the term isn't listed yet, and the record can't say",
};

export function likelihood(
  facts: CourseOfferingFacts,
  termId: TermId,
): Likelihood {
  return offeredLikelihood(facts.summary, termId, facts.listed, facts.offered);
}

export type OfferingView = {
  /** "Fall and spring", "Spring only", "Every other fall", "Not since Spring 2021", "Not enough history to tell". */
  usually: string;
  pattern: string;
  confidence: "high" | "medium" | "low";
  /** "Offered in 8 of 8 falls on record since 2018, and in 2 of 8 springs." Null with too little on record. */
  record: string | null;
  lastOffered: { id: TermId; name: string } | null;
  /** The next term it runs after `after`: `scheduled` when Testudo lists it there, `likely` from the pattern. */
  next: { id: TermId; name: string; certainty: "scheduled" | "likely" } | null;
  /** The last eight school years' falls and springs, newest first. */
  recent: {
    offered: string[];
    notOffered: string[];
    /** Terms no source has: unknown, not "not offered". */
    notOnRecord: string[];
  };
};

/** Pattern kinds in words an agent can branch on: "alternate-years (fall, even years)". */
function patternWords(summary: OfferingSummary): string {
  const p = summary.pattern;
  switch (p.kind) {
    case "leans":
    case "once-a-year":
      return `${p.kind} (${p.season})`;
    case "alternate-years":
      return `alternate-years (${p.season}, ${p.parity} years)`;
    case "summer-or-winter":
      return `summer-or-winter (${p.seasons.join(", ")})`;
    case "irregular":
      return p.lean ? `irregular (leans ${p.lean})` : "irregular";
    case "discontinued":
      return `discontinued (last ${termLabel(p.last)})`;
    default:
      return p.kind;
  }
}

export function offeringView(
  facts: CourseOfferingFacts,
  after: TermId,
): OfferingView {
  const { summary } = facts;
  const line = offeringLine(summary, after, facts.listed, facts.offered);
  const cells = offeringStrip({
    offered: facts.offered,
    recorded: facts.recorded,
    now: facts.now,
  }).reverse();
  const names = (state: (typeof cells)[number]["state"]) =>
    cells.filter((c) => c.state === state).map((c) => termLabel(c.termId));
  return {
    usually: offeringText(summary),
    pattern: patternWords(summary),
    confidence: summary.confidence,
    record: offeringRecord(summary),
    lastOffered: summary.lastOffered ? termRef(summary.lastOffered) : null,
    next: line.next
      ? {
          ...termRef(line.next.termId),
          certainty: line.next.likely ? "likely" : "scheduled",
        }
      : null,
    recent: {
      offered: names("offered"),
      notOffered: names("not-offered"),
      notOnRecord: names("not-on-record"),
    },
  };
}
