import { useId, useState } from "react";
import { track } from "~/app/analytics";
import {
  type Connection,
  FEET_PER_MINUTE_PER_MPH,
  PACE_MPH,
  TIGHT_SHARE,
  type TravelSettings,
} from "~/core/schema";
import { connectionToExplain, travelMath } from "~/core/travel";
import { WithTooltip } from "~/ui/tooltip";
import { estimateLine } from "./words";

// "Estimates use campus paths at your pace. How?" (SPEC §3.7). The math is
// shown on one real connection from the plan, so the numbers can be checked
// against a pill on the calendar (DESIGN §5, honest numbers).

export function HowEstimate({
  connections,
  travel,
}: {
  connections: readonly Connection[];
  travel: TravelSettings;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const example = connectionToExplain(connections);
  const math = example ? travelMath(example, travel) : null;
  const mph = PACE_MPH[travel.pace];

  const toggle = () => {
    if (!open) track("travel_how_opened", {});
    setOpen(!open);
  };

  return (
    <div className="px-4 pt-3 text-[12px] text-muted">
      <p>
        Estimates use campus paths at your pace.{" "}
        <WithTooltip label={open ? "Hide the math" : "See the math"}>
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls={id}
            className="text-fg underline decoration-hairline-strong underline-offset-2 hover:decoration-fg"
          >
            {open ? "Hide" : "How?"}
          </button>
        </WithTooltip>
      </p>
      {open ? (
        <div
          id={id}
          className="mt-2 flex flex-col gap-2 rounded-lg bg-panel p-3 leading-relaxed"
        >
          <p>
            We measure the {travel.accessible ? "accessible " : ""}walking path
            on UMD's campus map between the closest entrances of the two
            buildings, then divide by your pace ({mph.toFixed(1)} mph is{" "}
            {mph * FEET_PER_MINUTE_PER_MPH} ft a minute) and round up.
          </p>
          {example && math ? (
            <p className="tnum font-mono text-[11.5px] text-fg">
              {example.from.building} → {example.to.building}:{" "}
              {estimateLine(math)}
            </p>
          ) : null}
          <p>
            A connection is tight when getting there takes{" "}
            {Math.round(TIGHT_SHARE * 100)}% of the time between classes or
            more. It doesn't know about crowds, weather or a slow elevator, so
            leave some slack.
          </p>
        </div>
      ) : null}
    </div>
  );
}
