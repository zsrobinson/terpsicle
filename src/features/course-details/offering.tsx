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
import type { Course, TermId } from "~/core/schema";
import { useCatalog } from "~/state/catalog-store";
import { useOfferingHistory } from "~/state/offerings";
import { WithTooltip } from "~/ui/tooltip";

// "Usually offered" in course details (docs/decisions.md, "Offering
// patterns from the history", the report's variant A): one line under the
// title when the course keeps to a season, and its strip with the other
// facts. A course that runs every fall and spring says nothing: the line
// only appears when it's news.

/** The course's offering pattern as course details shows it; null when it isn't news. */
export function useCourseOffering(course: Course, termId: TermId) {
  const terms = useCatalog((s) => s.terms);
  const codes = useMemo(
    () => [course.code, ...course.crossListings],
    [course.code, course.crossListings],
  );
  const history = useOfferingHistory(
    useMemo(() => codes.map((c) => c.slice(0, 4)), [codes]),
  );
  return useMemo(() => {
    if (!history || !terms || terms.length === 0) return null;
    const now = terms.reduce((a, t) => (t.id > a ? t.id : a), termId);
    const listed = new Set(
      terms.filter((t) => t.status === "active").map((t) => t.id),
    );
    // This term's catalog has it, whether or not the history has caught up.
    const offered = offeredTermsIn(history.depts, codes).add(termId);
    const recorded = new Set([...history.recorded, termId]);
    const summary = offeringSummary({ offered, recorded, now });
    const line = offeringLine(summary, termId, listed, offered);
    if (!line) return null;
    const cells = offeringStrip({ offered, recorded, now });
    return { line, summary, cells, record: offeringRecord(summary) };
  }, [history, terms, codes, termId]);
}

export type CourseOffering = NonNullable<ReturnType<typeof useCourseOffering>>;

/** "Usually offered: Every other fall · Next likely: Fall 2028". */
export function OfferingLine({ offering }: { offering: CourseOffering }) {
  const { line, record } = offering;
  return (
    <WithTooltip
      label={`${record ? `${record} ` : ""}A pattern from past semesters, not a promise.`}
    >
      <p className="mt-1 text-sm text-muted" data-testid="usually-offered">
        Usually offered:{" "}
        <span className="font-medium text-fg">{line.words}</span>
        {line.next ? (
          <>
            {" · "}
            {line.next.likely ? "Next likely" : "Next"}:{" "}
            <span className="font-medium text-fg">
              {termLabel(line.next.termId)}
            </span>
          </>
        ) : null}
      </p>
    </WithTooltip>
  );
}

/** "Offered  ▯▮▯▮…  Fall 2018 to Spring 2027 · in 5 of the 16 terms on record". */
export function OfferingFact({ offering }: { offering: CourseOffering }) {
  const { cells, record } = offering;
  const onRecord = cells.filter((c) => c.state !== "not-on-record").length;
  const ran = cells.filter((c) => c.state === "offered").length;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1">
      <span className="font-medium text-fg">Offered</span>
      <OfferingStrip
        cells={cells}
        label={record ?? "When it was offered, fall and spring"}
      />
      <span className="text-muted text-xs">
        {stripSpan(cells)} · in {ran} of the {onRecord} terms on record
      </span>
    </div>
  );
}
