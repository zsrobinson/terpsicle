import type { ReactNode } from "react";
import { MessageText } from "~/app/message-text";
import { PanelNote } from "~/app/panel";
import { displayTitle } from "~/core/four-year/display-title";
import type { LocalId } from "~/core/schema";
import type { FourYearCreditEntry } from "~/core/schema/four-year";
import { CreditInfoForm } from "./course-details-form";
import { useModel } from "./model";

// AP, exam or transfer credit with no UMD course, open in the sidebar
// (`?credit=<entry id>`): what the transcript says, and what it counts as
// (V3 §2.10). The sidebar puts one Back over it, like a course's drill-in.

/** "AP credit", "Exam credit", "Transfer credit". Older docs didn't say which. */
export function creditKind(entry: Pick<FourYearCreditEntry, "via">): string {
  switch (entry.via) {
    case "ap":
      return "AP credit";
    case "exam":
      return "Exam credit";
    case "transfer":
      return "Transfer credit";
    default:
      return "AP or transfer credit";
  }
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="font-medium text-muted text-xs">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function CreditPanel({ entryId }: { entryId: LocalId }) {
  const { doc, problems } = useModel();
  const entry = doc.entries.find(
    (e): e is FourYearCreditEntry => e.kind === "credit" && e.id === entryId,
  );
  if (!entry)
    return (
      <PanelNote>That credit isn't in this four-year plan anymore.</PanelNote>
    );
  const mine = problems.filter((p) =>
    p.subjects.some((s) => s.kind === "entry" && s.entryId === entry.id),
  );
  const credits = `${entry.credits} ${entry.credits === 1 ? "credit" : "credits"}`;
  return (
    <div className="space-y-3 px-4 py-3">
      <div>
        <h2 className="font-semibold text-lg">{displayTitle(entry.title)}</h2>
        <p className="text-muted text-sm">
          {creditKind(entry)} · {credits}
        </p>
      </div>
      <dl className="space-y-3">
        <Fact label="On your transcript">
          {entry.equivalentPattern ? (
            <>
              Testudo lists it as{" "}
              <span className="ident">{entry.equivalentPattern}</span>, a level
              of a department rather than one course.
            </>
          ) : (
            "Testudo lists it with no UMD course."
          )}
        </Fact>
        {mine.length > 0 ? (
          <Fact label="Worth knowing">
            <ul className="space-y-1">
              {mine.map((p) => (
                <li key={p.id} className="text-sm">
                  <MessageText message={p.title} />
                </li>
              ))}
            </ul>
          </Fact>
        ) : null}
      </dl>
      <CreditInfoForm
        // Undo, or a save from another tab, starts the form over.
        key={JSON.stringify([entry.countsAs, entry.credits, entry.genEds])}
        entry={entry}
      />
    </div>
  );
}
