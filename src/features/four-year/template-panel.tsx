import { cn } from "cn";
import { ExternalLink } from "lucide-react";
import { useId } from "react";
import { wildcardLabel } from "~/core/catalog/wildcard";
import {
  templateCredits,
  templateFit,
  templateFitSentence,
} from "~/core/four-year/templates";
import { fourYearTermLabel, semesterIds } from "~/core/four-year/terms";
import type {
  FourYearTemplate,
  FourYearTemplateEntry,
} from "~/core/schema/four-year";
import { Button } from "~/ui/button";
import { Card } from "~/ui/card";
import { InlineError } from "~/ui/inline-error";
import { RowSkeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { applyTemplate, newDocFromTemplate, setFirstTerm } from "./actions";
import { FirstTermSelect } from "./first-term-select";
import { useModel, usePlanNav } from "./model";
import { useTemplates } from "./template-files";
import { PlanView } from "./views";
import { showBoard } from "./workbench-store";

// The Samples tab (`?tab=templates`, docs/V3.md §2.11): a major's courses
// laid out semester by semester, credited to where they come from. Adding
// one fills the plan's empty semesters from its first, and never moves,
// replaces or removes anything already there; Undo takes it back whole.

/** A block in the preview: a course code, or a dashed placeholder like the board's. */
function Chip({ entry }: { entry: FourYearTemplateEntry }) {
  if (entry.kind === "course")
    return (
      <li className="ident border border-hairline-strong bg-panel px-1 text-xs">
        {entry.code}
      </li>
    );
  const words =
    entry.wildcard.kind === "pattern"
      ? entry.wildcard.pattern
      : wildcardLabel(entry.wildcard);
  return (
    <li className="ident border border-hairline-strong border-dashed px-1 text-muted text-xs">
      {words}
    </li>
  );
}

function StartsIn() {
  const { doc, today } = useModel();
  return (
    <FirstTermSelect
      label="Your plan starts in"
      tooltip="Sample plans count semesters from here"
      value={doc.firstTermId}
      today={today}
      onChange={(term) => setFirstTerm(doc, term)}
    />
  );
}

function TemplateCard({ template }: { template: FourYearTemplate }) {
  const { doc } = useModel();
  const nav = usePlanNav();
  const headingId = useId();
  const terms = semesterIds(doc.firstTermId);
  const fit = templateFit(doc, template);
  const kept = new Set<string>(fit.keeps);
  const credits = templateCredits(template);
  const add = () => {
    if (!applyTemplate(doc, template)) return;
    // The semesters are the result: show them, from the top on a phone.
    nav.go({ tab: undefined });
    showBoard();
  };
  return (
    <Card role="region" aria-labelledby={headingId} className="gap-3">
      <div className="space-y-0.5">
        <h3 id={headingId} className="font-semibold">
          {template.name}
        </h3>
        <p className="tnum text-muted text-xs">
          {template.semesters.length} semesters · {credits} credits ·{" "}
          {template.year}
        </p>
      </div>
      <p className="text-sm">{template.summary}</p>
      <ol aria-label={`${template.name} by semester`} className="space-y-2">
        {template.semesters.map((semester) => {
          const term = terms[semester.index];
          if (term === undefined) return null;
          const has = kept.has(term);
          return (
            <li key={semester.index} className={cn(has && "opacity-60")}>
              <p className="tnum flex justify-between gap-2 text-muted text-xs">
                <span className="font-medium text-fg">
                  {fourYearTermLabel(term)}
                </span>
                <span>
                  {has ? "Has courses, stays as is" : `${semester.credits} cr`}
                </span>
              </p>
              <ul className="mt-1 flex flex-wrap gap-1">
                {semester.entries.map((entry, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a semester can list the same placeholder twice
                  <Chip key={i} entry={entry} />
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
      <p role="status" className="text-muted text-sm">
        {templateFitSentence(fit)}
      </p>
      <div className="space-y-2">
        <WithTooltip
          label={
            fit.fills.length === 0
              ? "Every semester it covers already has courses"
              : "Fill your empty semesters. Undo takes it back."
          }
        >
          <Button
            className="w-full"
            disabled={fit.fills.length === 0}
            onClick={add}
          >
            Add to {doc.name}
          </Button>
        </WithTooltip>
        {doc.entries.length > 0 ? (
          <WithTooltip
            label={`A new four-year plan with just this sample, starting in ${fourYearTermLabel(doc.firstTermId)}`}
          >
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                newDocFromTemplate(template, doc.firstTermId);
                nav.go({ tab: undefined });
                showBoard();
              }}
            >
              Start a new plan from it
            </Button>
          </WithTooltip>
        ) : null}
      </div>
      <p className="text-muted text-xs">
        {template.credit}{" "}
        <WithTooltip label={`The ${template.department}'s page, in a new tab`}>
          <a
            href={template.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 text-fg underline underline-offset-2"
          >
            See the source
            <ExternalLink aria-hidden="true" className="size-3" />
          </a>
        </WithTooltip>
      </p>
    </Card>
  );
}

export function TemplatePanel() {
  const state = useTemplates();
  return (
    <div className="space-y-3 px-4 py-3">
      <div className="space-y-1">
        <h2 className="font-medium">Start from a sample plan</h2>
        <p className="text-muted text-sm">
          A sample plan lays out a major's courses semester by semester. Adding
          one fills your empty semesters and leaves the rest as they are.
        </p>
      </div>
      <StartsIn />
      {state.phase === "loading" ? (
        <RowSkeleton rows={4} inset={false} label="Loading the sample plans" />
      ) : state.phase === "failed" ? (
        <InlineError
          message="The sample plans didn't load. Check your connection, then try again."
          onRetry={state.chunk ? () => window.location.reload() : state.retry}
          retryTooltip="Load the sample plans again"
        />
      ) : (
        state.templates.map((t) => <TemplateCard key={t.id} template={t} />)
      )}
    </div>
  );
}

/** The Samples view, on its route (`/plan/samples`). */
export function SamplesView() {
  return (
    <PlanView tab="templates">
      <TemplatePanel />
    </PlanView>
  );
}
