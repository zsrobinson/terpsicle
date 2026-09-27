import { useId, useState } from "react";
import { Mark } from "~/app/brand/mark";
import {
  defaultFirstTerm,
  firstTermChoices,
  fourYearTermLabel,
} from "~/core/four-year/terms";
import type { IsoDate } from "~/core/schema";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import {
  createDoc,
  createDocForImport,
  createDocForTemplates,
} from "./actions";
import type { PlanNav } from "./model";

// The first visit (V3 §2.13): equal ways in, like the scheduler's. Starting
// from scratch asks one thing, when you started, so the semesters line up.
// A sample plan opens a plan on the Samples tab, which asks the same before
// it fills anything. Importing opens a plan on the Import tab; the import
// sets the first semester from the transcript.

export function EmptyState({ today, nav }: { today: IsoDate; nav: PlanNav }) {
  const [first, setFirst] = useState(() => defaultFirstTerm(today));
  const selectId = useId();
  return (
    <div className="mx-auto max-w-[1040px] space-y-6 pt-[6vh]">
      <div className="space-y-1.5">
        <Mark id="plan" size={40} className="mb-3" />
        <h1 className="font-semibold text-xl tracking-tight">
          Plan your four years
        </h1>
        <p className="max-w-[640px] text-muted">
          Lay out every semester, see your credits add up to 120 and keep track
          of your GenEds. It's saved in this browser, with nothing to sign up
          for.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <section
          aria-labelledby="plan-start-scratch"
          className="flex flex-col gap-3 border border-keyline bg-raised p-4 shadow-offset"
        >
          <div className="space-y-1">
            <h2 id="plan-start-scratch" className="font-semibold text-lg">
              Start from scratch
            </h2>
            <p className="text-muted text-sm">
              Add courses semester by semester, or placeholders like CMSC4XX and
              "Any DSHS course" until you know which one.
            </p>
          </div>
          <div className="mt-auto space-y-3">
            <div className="space-y-1">
              <label
                htmlFor={selectId}
                className="font-medium text-muted text-xs"
              >
                I started at UMD in
              </label>
              <WithTooltip label="Your first fall or spring at UMD">
                <select
                  id={selectId}
                  value={first}
                  onChange={(event) => setFirst(event.target.value)}
                  className="h-11 w-full border border-hairline-strong bg-raised px-2 text-base outline-none focus-visible:border-fg md:h-8"
                >
                  {firstTermChoices(today).map((term) => (
                    <option key={term} value={term}>
                      {fourYearTermLabel(term)}
                    </option>
                  ))}
                </select>
              </WithTooltip>
            </div>
            <WithTooltip label="Lay out eight semesters from there">
              <Button
                className="h-11 w-full md:h-8"
                onClick={() => createDoc(first)}
              >
                Start planning
              </Button>
            </WithTooltip>
          </div>
        </section>
        <section
          aria-labelledby="plan-start-template"
          className="flex flex-col gap-3 border border-keyline bg-raised p-4 shadow-offset"
        >
          <div className="space-y-1">
            <h2 id="plan-start-template" className="font-semibold text-lg">
              Start from a sample plan
            </h2>
            <p className="text-muted text-sm">
              A major's courses laid out semester by semester, with placeholders
              for the ones you'll pick. Computer Science for now.
            </p>
          </div>
          <div className="mt-auto">
            <WithTooltip label="See a major's courses by semester, then add them">
              <Button
                className="h-11 w-full md:h-8"
                onClick={() => {
                  createDocForTemplates(defaultFirstTerm(today));
                  nav.go({ tab: "templates" });
                }}
              >
                Pick a sample plan
              </Button>
            </WithTooltip>
          </div>
        </section>
        <section
          aria-labelledby="plan-start-import"
          className="flex flex-col gap-3 border border-keyline bg-raised p-4 shadow-offset"
        >
          <div className="space-y-1">
            <h2 id="plan-start-import" className="font-semibold text-lg">
              Import your transcript
            </h2>
            <p className="text-muted text-sm">
              Paste your unofficial transcript from Testudo and we'll fill in
              what you've taken. It's read in your browser and never sent to us.
            </p>
          </div>
          <div className="mt-auto">
            <WithTooltip label="Paste Testudo's Unofficial Transcript page">
              <Button
                className="h-11 w-full md:h-8"
                onClick={() => {
                  createDocForImport(defaultFirstTerm(today));
                  nav.go({ tab: "import" });
                }}
              >
                Paste your transcript
              </Button>
            </WithTooltip>
          </div>
        </section>
      </div>
    </div>
  );
}
