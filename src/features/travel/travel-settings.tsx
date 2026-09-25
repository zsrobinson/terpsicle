import { cn } from "cn";
import { Accessibility } from "lucide-react";
import { type ReactNode, useId } from "react";
import {
  type ExtraMinutes,
  FEET_PER_MINUTE_PER_MPH,
  PACE_MPH,
  type Pace,
  type TravelSettings,
} from "~/core/schema";
import { WithTooltip } from "~/ui/tooltip";
import { setAccessible, setExtraMinutes, setPace } from "./actions";

// Pace, Accessible routes and extra time per trip (SPEC §3.7). Every change
// applies at once: the calendar's pills and the list below update as you
// click.

const PACES: readonly { pace: Pace; label: string }[] = [
  { pace: "slower", label: "Slower" },
  { pace: "typical", label: "Typical" },
  { pace: "faster", label: "Faster" },
];

const EXTRAS: readonly { minutes: ExtraMinutes; label: string; tip: string }[] =
  [
    { minutes: 0, label: "None", tip: "No extra time" },
    {
      minutes: 2,
      label: "+2 min",
      tip: "Add 2 min to every trip, for stairs, crowds or finding the room",
    },
    {
      minutes: 5,
      label: "+5 min",
      tip: "Add 5 min to every trip, for stairs, crowds or finding the room",
    },
  ];

export function TravelSettingsForm({ travel }: { travel: TravelSettings }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-3 px-4 pt-3">
      <Field label="Your pace" labelId={`${id}-pace`}>
        <fieldset
          aria-labelledby={`${id}-pace`}
          className="grid grid-cols-3 gap-0.5 rounded-lg border border-hairline bg-panel p-0.5"
        >
          {PACES.map(({ pace, label }) => {
            const mph = PACE_MPH[pace];
            const on = travel.pace === pace;
            return (
              <WithTooltip
                key={pace}
                label={`Walk at ${mph.toFixed(1)} mph (${mph * FEET_PER_MINUTE_PER_MPH} ft a minute)`}
              >
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={`${label}, ${mph.toFixed(1)} mph`}
                  onClick={() => setPace(pace)}
                  className={cn(
                    "flex flex-col items-center rounded-md py-1 transition-colors",
                    on
                      ? "bg-raised text-fg shadow-xs ring-1 ring-hairline"
                      : "text-muted hover:text-fg",
                  )}
                >
                  <span className="text-[12.5px] leading-5">{label}</span>
                  <span className="tnum text-[10.5px] text-muted leading-4">
                    {mph.toFixed(1)} mph
                  </span>
                </button>
              </WithTooltip>
            );
          })}
        </fieldset>
      </Field>

      <WithTooltip
        label={
          travel.accessible
            ? "Use standard routes"
            : "Use UMD's accessible routes for every trip"
        }
      >
        <button
          type="button"
          role="switch"
          aria-checked={travel.accessible}
          onClick={() => setAccessible(!travel.accessible)}
          className="flex items-start gap-3 rounded-lg border border-hairline px-3 py-2.5 text-left transition-colors hover:border-hairline-strong"
        >
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 font-medium text-[12.5px]">
              <Accessibility size={13} aria-hidden />
              Accessible routes
            </span>
            <span className="mt-0.5 block text-[11.5px] text-muted leading-snug">
              Ramps, elevators and accessible entrances, from UMD's campus map.
            </span>
          </span>
          <Toggle on={travel.accessible} />
        </button>
      </WithTooltip>

      <Field label="Extra time per trip" labelId={`${id}-extra`}>
        <fieldset
          aria-labelledby={`${id}-extra`}
          className="grid grid-cols-3 gap-0.5 rounded-lg border border-hairline bg-panel p-0.5"
        >
          {EXTRAS.map(({ minutes, label, tip }) => {
            const on = travel.extraMinutes === minutes;
            return (
              <WithTooltip key={minutes} label={tip}>
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={minutes === 0 ? "No extra time" : label}
                  onClick={() => setExtraMinutes(minutes)}
                  className={cn(
                    "tnum h-7 rounded-md text-[12px] transition-colors",
                    on
                      ? "bg-raised text-fg shadow-xs ring-1 ring-hairline"
                      : "text-muted hover:text-fg",
                  )}
                >
                  {label}
                </button>
              </WithTooltip>
            );
          })}
        </fieldset>
      </Field>
    </div>
  );
}

function Field({
  label,
  labelId,
  children,
}: {
  label: string;
  labelId: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div id={labelId} className="mb-1.5 font-medium text-[11px] text-muted">
        {label}
      </div>
      {children}
    </div>
  );
}

/** The switch's track and knob; the whole row is the control. */
function Toggle({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 flex h-[18px] w-[30px] shrink-0 items-center rounded-full p-0.5 transition-colors",
        on ? "bg-accent" : "bg-hairline-strong",
      )}
    >
      <span
        className={cn(
          "size-[14px] rounded-full bg-raised shadow-xs transition-transform",
          on && "translate-x-3 bg-accent-fg",
        )}
      />
    </span>
  );
}
