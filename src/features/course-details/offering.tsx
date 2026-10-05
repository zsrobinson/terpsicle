import { useMemo } from "react";
import { OfferingStrip, stripSpan } from "~/components/offering-strip";
import { termLabel } from "~/core/catalog/terms";
import {
  offeredTermsIn,
  offeringLine,
  offeringRecord,
  offeringStrip,
  offeringSummary,
} from "~/core/history/offering-pattern";
import type { CourseCode, Term, TermId } from "~/core/schema";
import { useCatalog } from "~/state/catalog-store";
import { useOfferingHistory } from "~/state/offerings";
import { WithTooltip } from "~/ui/tooltip";

// "Usually offered" in course details (docs/decisions.md, "Offering
// patterns from the history"): a fact row like Prerequisite and
// Restriction, always there once the history is in, for a course that runs
// every semester too ("Fall and spring"), and plainly "Not enough history
// to tell" when that's the case (the owner, 2026-10-05). Its strip shows
// the eight years at a glance; its tooltip counts them.

/**
 * A course's offering pattern as course details shows it, from its
 * department's history and its cross-listings'; null until that's in.
 * `inTerm` says the term's catalog has it, a fact the history may not
 * have caught up with.
 */
export function useCourseOffering(
  codes: readonly CourseCode[],
  termId: TermId,
  inTerm: boolean,
) {
  const terms = useCatalog((s) => s.terms);
  const key = codes.join(",");
  const stableCodes = useMemo(() => key.split(","), [key]);
  const history = useOfferingHistory(
    useMemo(() => stableCodes.map((c) => c.slice(0, 4)), [stableCodes]),
  );
  return useMemo(() => {
    if (!history || !terms || terms.length === 0) return null;
    const now = terms.reduce((a, t) => (t.id > a ? t.id : a), termId);
    const active = terms.filter((t) => t.status === "active");
    const listed = new Set(active.map((t) => t.id));
    const offered = offeredTermsIn(history.depts, stableCodes);
    const recorded = new Set(history.recorded);
    if (inTerm) {
      offered.add(termId);
      recorded.add(termId);
    }
    const summary = offeringSummary({ offered, recorded, now });
    const line = offeringLine(summary, termId, listed, offered);
    const cells = offeringStrip({ offered, recorded, now });
    const title =
      history.depts
        .get(stableCodes[0]?.slice(0, 4) ?? "")
        ?.courses.find((c) => c.code === stableCodes[0])?.title ?? null;
    /** A later term Testudo lists that has it: where "Open" goes. */
    const listedNext: Term | null =
      line.next && !line.next.likely
        ? (active.find((t) => t.id === line.next?.termId) ?? null)
        : null;
    return {
      line,
      summary,
      cells,
      record: offeringRecord(summary),
      title,
      listedNext,
    };
  }, [history, terms, stableCodes, termId, inTerm]);
}

export type CourseOffering = NonNullable<ReturnType<typeof useCourseOffering>>;

/**
 * "Usually offered  Spring only · Next likely Spring 2028", with the strip
 * under it: the same weight as the other facts.
 */
export function UsuallyOffered({ offering }: { offering: CourseOffering }) {
  const { line, record, cells } = offering;
  const span = stripSpan(cells);
  const tip = [
    record ?? "Too few fall and spring semesters on record to tell.",
    span ? `${span}: filled ran, hollow didn't, dashed isn't on record.` : "",
    "A pattern from past semesters, not a promise.",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <WithTooltip label={tip}>
      <div data-testid="usually-offered">
        <p>
          <span className="font-medium text-fg">Usually offered</span>{" "}
          <span className="text-muted">
            {line.words}
            {line.next
              ? ` · ${line.next.likely ? "Next likely" : "Next"} ${termLabel(line.next.termId)}`
              : null}
          </span>
        </p>
        <OfferingStrip
          className="mt-1 flex"
          cells={cells}
          label={record ?? "When it was offered, fall and spring"}
        />
      </div>
    </WithTooltip>
  );
}
