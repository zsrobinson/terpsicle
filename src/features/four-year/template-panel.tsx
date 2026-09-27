import { cn } from "cn";
import { ExternalLink } from "lucide-react";
import { useId } from "react";
import { wildcardLabel } from "~/core/catalog/wildcard";
import {
  templateCredits,
  templateFit,
  templateFitSentence,
} from "~/core/four-year/templates";
import {
  firstTermChoices,
  fourYearTermLabel,
  semesterIds,
} from "~/core/four-year/terms";
import type {
  FourYearTemplate,
  FourYearTemplateEntry,
} from "~/core/schema/four-year";
import { Button } from "~/ui/button";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { applyTemplate, newDocFromTemplate, setFirstTerm } from "./actions";
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
      <li className="border border-hairline-strong bg-panel px-1 font-mono text-xs">
        {entry.code}
      </li>
    );
  const words =
    entry.wildcard.kind === "pattern"
      ? entry.wildcard.pattern
      : wildcardLabel(entry.wildcard);
  return (
    <li className="border border-hairline-strong border-dashed px-1 font-mono text-muted text-xs">
      {words}
    </li>
  );
}

function StartsIn() {
  const { doc, today } = useModel();
  const id = useId();
  const choices = firstTermChoices(today);
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="shrink-0 text-muted text-sm">
        Your plan starts in
      </label>
      <WithTooltip label="Sample plans count semesters from here">
        <select
          id={id}
          value={doc.firstTermId}
          onChange={(event) => setFirstTerm(doc, event.target.value)}
          className="h-11 min-w-0 flex-1 border border-hairline-strong bg-raised px-2 text-base outline-none focus-visible:border-fg md:h-8 md:text-sm"
        >
          {/* A plan made elsewhere may start outside today's choices. */}
          {choices.includes(doc.firstTermId) ? null : (
            <option value={doc.firstTermId}>
              {fourYearTermLabel(doc.firstTermId)}
            </option>
          )}
          {choices.map((term) => (
            <option key={term} value={term}>
              {fourYearTermLabel(term)}
            </option>
          ))}
        </select>
      </WithTooltip>
    </div>
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
    <section
      aria-labelledby={headingId}
      className="space-y-3 border border-hairline bg-panel p-3"
    >
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
            className="h-11 w-full md:h-8"
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
              className="h-11 w-full md:h-8"
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
    </section>
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
        <Skeleton className="h-64 w-full" />
      ) : state.phase === "failed" ? (
        <p role="alert" className="text-sm">
          The sample plans didn't load. Check your connection and reload the
          page.
        </p>
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
