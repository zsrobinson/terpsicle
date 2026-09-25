import { cn } from "cn";
import { Layers, Search } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { chooseFirstVisitPath } from "./actions";

// "Build your <term> schedule" (SPEC §3.2): two equally weighted ways in,
// shown on a first visit and whenever a plan is empty. The owner asked for
// starting from scratch and generating to read as "equally valid paths"
// (DESIGN §4b), so they sit side by side in two identical columns: the same
// card, the same numbered steps, the same primary button. Stacked cards would
// make the top one read as the recommended path, which is what the prototype
// got wrong (one primary button plus a small "or generate" link).

const BUILD_STEPS = [
  "Find your courses",
  "Pick sections on the calendar",
  "Fix anything flagged",
  "Export for registration",
] as const;

const GENERATE_STEPS = [
  "List the courses you need",
  "Set must-haves (days off, start time)",
  "Pick from ranked plans",
  "Export for registration",
] as const;

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
        Pick a way to start. You can switch anytime.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Path
          title="Build it yourself"
          steps={BUILD_STEPS}
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
          steps={GENERATE_STEPS}
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
  steps,
  action,
}: {
  title: string;
  steps: readonly string[];
  action: ReactNode;
}) {
  return (
    <fieldset
      aria-label={title}
      className="flex min-w-0 flex-col rounded-lg border border-hairline bg-raised p-3"
    >
      <h4 className="font-semibold text-base">{title}</h4>
      <ol className="mt-2.5 mb-3 flex flex-col gap-2">
        {steps.map((step, i) => (
          <li key={step} className="flex gap-2 text-sm">
            <span
              aria-hidden="true"
              className={cn(
                "tnum mt-px flex size-4 shrink-0 items-center justify-center rounded-full bg-hover font-medium text-2xs text-muted",
              )}
            >
              {i + 1}
            </span>
            <span className="min-w-0">{step}</span>
          </li>
        ))}
      </ol>
      <div className="mt-auto">{action}</div>
    </fieldset>
  );
}
