import type { ErrorComponentProps } from "@tanstack/react-router";
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
import { RouteError } from "~/features/site/route-states";
import { Button } from "~/ui/button";
import { Card } from "~/ui/card";
import { WithTooltip } from "~/ui/tooltip";
import { applyTemplate, newDocFromTemplate, setFirstTerm } from "./actions";
import { FirstTermSelect } from "./first-term-select";
import { useModel, usePlanNav } from "./model";
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
      label="Your four-year plan starts in"
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
        <h3 id={headingId} className="emph-heading">
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
              Start a new four-year plan from it
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

export function TemplatePanel({
  templates,
}: {
  templates: readonly FourYearTemplate[];
}) {
  return (
    <div className="space-y-3 px-4 py-3">
      <p className="emph-secondary text-sm">
        Adding a sample plan fills your empty semesters and leaves the rest as
        they are.
      </p>
      <StartsIn />
      {templates.map((t) => (
        <TemplateCard key={t.id} template={t} />
      ))}
    </div>
  );
}

/** The Samples header's line: what a sample plan is. */
const SAMPLES_STATUS = "A major's courses, semester by semester";

/** The Samples view, on its route (`/plan/samples`), whose loader brings the sample plans. */
export function SamplesView({
  templates,
}: {
  templates: readonly FourYearTemplate[];
}) {
  return (
    <PlanView tab="templates" status={SAMPLES_STATUS}>
      <TemplatePanel templates={templates} />
    </PlanView>
  );
}

/**
 * The route's error state: the router's own (RouteError: Try again loads
 * them again, or reloads for a file that didn't arrive), under the view's
 * header, so the sidebar still says where you are.
 */
export function SamplesFailed(props: ErrorComponentProps) {
  return (
    <PlanView tab="templates" status={SAMPLES_STATUS}>
      <RouteError {...props} />
    </PlanView>
  );
}
