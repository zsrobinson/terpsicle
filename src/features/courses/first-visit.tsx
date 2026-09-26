import { Layers, Search } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { chooseFirstVisitPath } from "./actions";

// "Build your <term> schedule" (SPEC §3.2): two equally weighted ways in,
// shown on a first visit and whenever a plan is empty. The owner asked for
// starting from scratch and generating to read as "equally valid paths"
// (DESIGN §4b): the same card, the same primary button, and neither styled
// as the default. They stack (the owner found two columns too cramped in the
// sidebar), each with a one-line summary rather than numbered steps, so both
// buttons fit in the phone drawer at half height (390×844).

export function FirstVisit({ termName }: { termName: string | undefined }) {
  return (
    <section
      aria-labelledby="first-visit-title"
      className="px-3 pt-3 pb-4"
      data-testid="first-visit"
    >
      <h3 id="first-visit-title" className="px-1 font-semibold text-xl">
        Build your {termName ?? "term"} schedule
      </h3>
      <p className="mt-0.5 px-1 text-muted text-sm">
        Two ways to start. You can switch anytime.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <Path
          title="Build it yourself"
          summary="Search, pick sections, fix what's flagged."
          action={
            <WithTooltip label="Open Search" shortcut="/">
              <Button
                className="w-full text-sm"
                onClick={() => chooseFirstVisitPath("build")}
              >
                <Search aria-hidden="true" className="size-3.5" />
                Search for a course
              </Button>
            </WithTooltip>
          }
        />
        <Path
          title="Generate plans"
          summary="Tell it what you need, then pick a plan."
          action={
            <WithTooltip label="Open Generate" shortcut="6">
              <Button
                className="w-full text-sm"
                onClick={() => chooseFirstVisitPath("generate")}
              >
                <Layers aria-hidden="true" className="size-3.5" />
                Generate plans
              </Button>
            </WithTooltip>
          }
        />
      </div>
    </section>
  );
}

function Path({
  title,
  summary,
  action,
}: {
  title: string;
  summary: string;
  action: ReactNode;
}) {
  return (
    <fieldset
      aria-label={title}
      className="flex min-w-0 flex-col rounded-lg border border-hairline bg-raised p-3"
    >
      <h4 className="font-semibold text-base">{title}</h4>
      <p className="mt-1 mb-3 text-muted text-sm">{summary}</p>
      <div className="mt-auto">{action}</div>
    </fieldset>
  );
}
