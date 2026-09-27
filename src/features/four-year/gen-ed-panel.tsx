import { cn } from "cn";
import { PanelNote } from "~/app/panel";
import {
  GEN_ED_REQUIREMENTS,
  type GenEdProgress,
  genEdProgressLabel,
} from "~/core/four-year/gen-ed";
import { Button } from "~/ui/button";
import { GroupHeader, ListRow } from "~/ui/list-row";
import { WithTooltip } from "~/ui/tooltip";
import { useModel, usePlanNav } from "./model";
import { focusSearch } from "./search-panel";
import { PlanView } from "./views";

// The GenEd tab (V3 §2.7): one row per category, done and planned against
// what it needs, and "Find a course" for one that's short. Not an audit.

const GROUPS = [
  "Fundamental Studies",
  "Distributive Studies",
  "I-Series",
  "Diversity",
] as const;

/** One square per course the category needs: filled done, half planned, open still needed. */
function Pips({ p }: { p: GenEdProgress }) {
  const planned = p.inProgress + p.planned;
  return (
    <span aria-hidden="true" className="flex gap-0.5">
      {Array.from({ length: p.requirement.needed }, (_, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: pips are positional
          key={i}
          className={cn(
            "size-2 border",
            i < p.done
              ? "border-product-plan bg-product-plan"
              : i < p.done + planned
                ? "border-product-plan bg-product-plan-soft"
                : "border-hairline-strong",
          )}
        />
      ))}
    </span>
  );
}

function Row({ p }: { p: GenEdProgress }) {
  const nav = usePlanNav();
  const met = p.short === 0;
  const code = p.searchCodes[0];
  const codes = p.requirement.codes.join(", ");
  return (
    <ListRow
      as="li"
      lead={<Pips p={p} />}
      secondary={
        <span className="tnum">
          {genEdProgressLabel(p)}
          {p.requirement.atLeast
            ? `, at least ${p.requirement.atLeast.count} ${p.requirement.atLeast.code}`
            : ""}
        </span>
      }
      trail={
        !met && code ? (
          <WithTooltip label={`Search for ${code} courses`}>
            <Button
              variant="ghost"
              size="row"
              onClick={() => {
                nav.go({
                  tab: "search",
                  gened: code,
                  wildcard: undefined,
                  course: undefined,
                  q: undefined,
                });
                focusSearch();
              }}
            >
              Find a course
            </Button>
          </WithTooltip>
        ) : undefined
      }
    >
      <span className="block truncate">
        {p.requirement.label}{" "}
        <span className="ident text-muted text-xs">{codes}</span>
      </span>
    </ListRow>
  );
}

export function GenEdPanel() {
  const { genEds } = useModel();
  return (
    <div className="pb-2">
      {GROUPS.map((group) => (
        <section key={group} aria-label={group}>
          <GroupHeader title={group} headingLevel={3} />
          <ul>
            {genEds.progress
              .filter((p) => p.requirement.group === group)
              .map((p) => (
                <Row key={p.requirement.id} p={p} />
              ))}
          </ul>
        </section>
      ))}
      <PanelNote className="text-xs">
        From Testudo's GenEd codes. Your degree audit is the official check.
      </PanelNote>
    </div>
  );
}

/** "5 of 11 categories covered", for the view's header. */
export function GenEdStatus() {
  const { genEds } = useModel();
  const met = genEds.progress.filter((p) => p.short === 0).length;
  return (
    <span className="tnum">
      {met} of {GEN_ED_REQUIREMENTS.length} categories covered, counting planned
      courses
    </span>
  );
}

/** The GenEd view, on its route (`/plan`). */
export function GenEdView() {
  return (
    <PlanView tab="gened" status={<GenEdStatus />}>
      <GenEdPanel />
    </PlanView>
  );
}
