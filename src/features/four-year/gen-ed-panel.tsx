import { cn } from "cn";
import {
  GEN_ED_REQUIREMENTS,
  type GenEdProgress,
  genEdProgressLabel,
} from "~/core/four-year/gen-ed";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { useModel, usePlanNav } from "./model";
import { focusSearch } from "./search-panel";

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
    <li className="flex items-center gap-2 px-4 py-1.5">
      <Pips p={p} />
      <span className="min-w-0 flex-1">
        <span className="block truncate">
          {p.requirement.label}{" "}
          <span className="font-mono text-muted text-xs">{codes}</span>
        </span>
        <span className="tnum block text-muted text-xs">
          {genEdProgressLabel(p)}
          {p.requirement.atLeast
            ? `, at least ${p.requirement.atLeast.count} ${p.requirement.atLeast.code}`
            : ""}
        </span>
      </span>
      {!met && code ? (
        <WithTooltip label={`Search for ${code} courses`}>
          <Button
            variant="ghost"
            size="row"
            className="h-11 md:h-6"
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
      ) : null}
    </li>
  );
}

export function GenEdPanel() {
  const { genEds } = useModel();
  const met = genEds.progress.filter((p) => p.short === 0).length;
  return (
    <div className="pb-2">
      <p className="tnum px-4 pt-3 pb-1 text-muted text-sm">
        {met} of {GEN_ED_REQUIREMENTS.length} categories covered, counting
        planned courses
      </p>
      {GROUPS.map((group) => (
        <section key={group} aria-label={group}>
          <h2 className="px-4 pt-3 pb-0.5 font-medium text-muted text-xs">
            {group}
          </h2>
          <ul>
            {genEds.progress
              .filter((p) => p.requirement.group === group)
              .map((p) => (
                <Row key={p.requirement.id} p={p} />
              ))}
          </ul>
        </section>
      ))}
      <p className="px-4 pt-3 text-muted text-xs">
        From Testudo's GenEd codes. Your degree audit is the official check.
      </p>
    </div>
  );
}
